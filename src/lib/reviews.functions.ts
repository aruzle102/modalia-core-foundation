import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { checkRateLimit, rateLimitEndpoint } from "@/lib/rate-limit";
import { emitAdminNotification } from "@/lib/notifications.functions";
import { validateMediaBytes, validateMediaMeta } from "@/lib/media-validation";

const REVIEW_BUCKET = "review-images";
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

// Optional guest review image must live under the review-images bucket and use
// a whitelisted extension. Paths are minted server-side only.
const imagePathSchema = z
  .string()
  .regex(/^reviews\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/i);

const reviewInput = z.object({
  productId: z.string().uuid(),
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  email: z.string().trim().toLowerCase().email().max(255),
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().max(2000).optional(),
  imagePath: imagePathSchema.optional(),
  // Honeypot: bots fill it, humans never see it.
  website: z.string().max(0).optional(),
});

function rejectSpamLinks(body: string | undefined): void {
  if (body && /(https?:\/\/|www\.)/i.test(body)) {
    throw new Error("Links are not allowed in reviews.");
  }
}

/**
 * Best-effort optional auth: returns the caller's Supabase user id when a
 * valid Bearer <redacted> was sent, null for guests. Used to link a customer
 * record and to check customer-owned delivered orders; never trusted for
 * anything privileged.
 */
async function getOptionalUserId(): Promise<string | null> {
  try {
    const request = getRequest();
    const authHeader = request?.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token || token.split(".").length !== 3) return null;
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) return null;
    const client = createClient(url, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.getClaims(token);
    if (error || !data?.claims?.sub) return null;
    return data.claims.sub as string;
  } catch {
    return null;
  }
}

/**
 * Download the signed-URL upload and validate its real content (magic bytes
 * + dimensions), mirroring the product-media finalize flow. Invalid bytes are
 * removed from the bucket so they can never linger.
 */
async function validateStoredImage(path: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: blob, error } = await supabaseAdmin.storage.from(REVIEW_BUCKET).download(path);
  if (error || !blob) {
    throw new Error("The review photo could not be read. Please upload it again.");
  }
  const buffer = new Uint8Array(await blob.arrayBuffer());
  const filename = path.split("/").pop() ?? path;
  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  try {
    validateMediaMeta({
      filename,
      mimeType: blob.type || undefined,
      sizeBytes: buffer.length,
      expectedKind: "image",
    });
    validateMediaBytes(buffer, "image", ext);
  } catch (e) {
    await supabaseAdmin.storage.from(REVIEW_BUCKET).remove([path]);
    throw e;
  }
}

/**
 * Public (guest or signed-in customer) review submission.
 * Reviews land in `moderation_status = 'pending'` and only appear on the
 * product page after an admin approves them. `verified_purchase` is computed
 * server-side: a delivered order placed with the same email that contains the
 * product. Rate-limited per IP and per email.
 */
export const submitProductReview = createServerFn({ method: "POST" })
  .inputValidator((data) => reviewInput.parse(data))
  .handler(async ({ data }) => {
    rateLimitEndpoint("submitProductReview", 10);
    checkRateLimit(
      `rl:reviewEmail:${data.email}`,
      3,
      24 * 60 * 60 * 1000,
    );
    if (data.website) {
      // Honeypot triggered — silently accept to fool bots.
      return { ok: true, pending: true };
    }
    rejectSpamLinks(data.body);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Product must exist and be publicly purchasable.
    const productResult = await supabaseAdmin
      .from("products")
      .select("id,slug,name")
      .eq("id", data.productId)
      .eq("status", "active")
      .eq("publication_status", "published")
      .eq("moderation_status", "approved")
      .eq("visibility", "public")
      .maybeSingle();
    if (productResult.error || !productResult.data) {
      throw new Error("This product is not available for review.");
    }

    // One review per email per product (the unique index covers customer_id;
    // guest reviews are identified by email).
    const existingResult = await supabaseAdmin
      .from("reviews")
      .select("id")
      .eq("product_id", data.productId)
      .eq("email", data.email)
      .maybeSingle();
    if (existingResult.error) throw new Error("Your review could not be saved.");
    if (existingResult.data) {
      throw new Error("You have already submitted a review for this product.");
    }

    // Verified purchase: a delivered order for the same email that contains
    // the product. Server-side only — never trusted from the client.
    let verifiedPurchase = false;
    let customerId: string | null = null;
    const callerUserId = await getOptionalUserId();
    if (callerUserId) {
      const customerResult = await supabaseAdmin
        .from("customers")
        .select("id")
        .eq("profile_id", callerUserId)
        .maybeSingle();
      if (customerResult.data) customerId = customerResult.data.id;
    }

    const deliveredOrders = await supabaseAdmin
      .from("orders")
      .select(
        "id,seller_orders(order_items(product_id))",
      )
      .eq("status", "delivered")
      .eq("guest_email", data.email);
    if (!deliveredOrders.error) {
      outer: for (const order of deliveredOrders.data ?? []) {
        for (const sellerOrder of order.seller_orders ?? []) {
          for (const item of (sellerOrder as { order_items?: { product_id?: string | null }[] }).order_items ?? []) {
            if (item.product_id === data.productId) {
              verifiedPurchase = true;
              break outer;
            }
          }
        }
      }
    }
    if (!verifiedPurchase && customerId) {
      const customerOrders = await supabaseAdmin
        .from("orders")
        .select("id,seller_orders(order_items(product_id))")
        .eq("status", "delivered")
        .eq("customer_id", customerId);
      if (!customerOrders.error) {
        outer: for (const order of customerOrders.data ?? []) {
          for (const sellerOrder of order.seller_orders ?? []) {
            for (const item of (sellerOrder as { order_items?: { product_id?: string | null }[] }).order_items ?? []) {
              if (item.product_id === data.productId) {
                verifiedPurchase = true;
                break outer;
              }
            }
          }
        }
      }
    }

    // Optional photo: the path must be a server-minted signed-URL upload for
    // this product; re-validate the stored bytes (magic bytes) so a forged
    // content type can't smuggle non-image bytes into the bucket.
    let imagePath: string | null = null;
    if (data.imagePath) {
      await validateStoredImage(data.imagePath);
      imagePath = data.imagePath;
    }

    const insertResult = await supabaseAdmin.from("reviews").insert({
      product_id: data.productId,
      customer_id: customerId,
      first_name: data.firstName,
      last_name: data.lastName,
      email: data.email,
      rating: data.rating,
      body: data.body?.trim() ? data.body.trim() : null,
      image_path: imagePath,
      moderation_status: "pending",
      verified_purchase: verifiedPurchase,
    });
    if (insertResult.error) {
      // Keep the bucket clean when the insert fails.
      if (imagePath) {
        try {
          await supabaseAdmin.storage.from(REVIEW_BUCKET).remove([imagePath]);
        } catch {
          /* best effort */
        }
      }
      // Race on the unique index or a transient failure — keep it generic.
      throw new Error("Your review could not be saved.");
    }

    // Best-effort: ping super admins so the review gets moderated.
    try {
      const productName =
        typeof productResult.data.name === "object" && productResult.data.name !== null
          ? ((productResult.data.name as Record<string, string>)["fr"] ??
            (productResult.data.name as Record<string, string>)["en"] ??
            productResult.data.slug)
          : productResult.data.slug;
      await emitAdminNotification({
        type: "operational_alert",
        params: {
          reason: `New review pending moderation — ${productName} (${data.rating}/5, ${data.firstName} ${data.lastName})`,
        },
        link: "/admin/reviews",
        payload: { product_id: data.productId, rating: data.rating },
      });
    } catch {
      /* notifications are best-effort */
    }

    return { ok: true, pending: true };
  });

/**
 * Mint a signed upload URL for a guest review photo. The bucket has no public
 * INSERT policy, so the only upload path is this server-minted URL.
 */
export const createReviewImageUpload = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        productId: z.string().uuid(),
        contentType: z.string().refine((value) => (ALLOWED_IMAGE_TYPES as readonly string[]).includes(value)),
        sizeBytes: z.number().int().positive().max(MAX_IMAGE_BYTES),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    rateLimitEndpoint("createReviewImageUpload", 20);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const productResult = await supabaseAdmin
      .from("products")
      .select("id")
      .eq("id", data.productId)
      .eq("status", "active")
      .eq("publication_status", "published")
      .eq("moderation_status", "approved")
      .eq("visibility", "public")
      .maybeSingle();
    if (productResult.error || !productResult.data) {
      throw new Error("This product is not available for review.");
    }

    const extension = data.contentType === "image/png" ? "png" : data.contentType === "image/webp" ? "webp" : "jpg";
    const path = `reviews/${data.productId}/${crypto.randomUUID()}.${extension}`;
    const signed = await supabaseAdmin.storage.from(REVIEW_BUCKET).createSignedUploadUrl(path);
    if (signed.error || !signed.data) throw new Error("The photo could not be prepared.");
    return { path, token: signed.data.token, signedUrl: signed.data.signedUrl };
  });

const featuredReviewsInput = z.object({
  limit: z.coerce.number().int().min(1).max(12).default(6),
  locale: z.string().min(2).max(5).default("en"),
});

export type FeaturedReview = {
  id: string;
  rating: number;
  body: string;
  reviewerName: string;
  verifiedPurchase: boolean;
  productName: string;
  productSlug: string;
  storeName: string;
  createdAt: string;
};

function reviewLocalized(value: unknown, locale: string, fallback: string): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const record = value as Record<string, unknown>;
  const localized = record[locale] ?? record["fr"] ?? record["en"] ?? record["ar"];
  return typeof localized === "string" && localized ? localized : fallback;
}

/**
 * "Customer reviews": latest admin-approved reviews with a written body.
 * Reads through the publishable key, so RLS (`reviews_public_approved`) is the
 * authority. Returns only what is needed for a public testimonial — no emails.
 * Hidden by callers when no approved reviews exist yet.
 */
export const getFeaturedReviews = createServerFn({ method: "GET" })
  .inputValidator((data) => featuredReviewsInput.parse(data))
  .handler(async ({ data }) => {
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) return { reviews: [] as FeaturedReview[], hasData: false };
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: rows, error } = await client
      .from("reviews")
      .select(
        "id, rating, body, first_name, last_name, verified_purchase, created_at, products!inner(slug, name, stores!inner(name))",
      )
      .eq("moderation_status", "approved")
      .not("body", "is", null)
      .neq("body", "")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error || !rows?.length) return { reviews: [] as FeaturedReview[], hasData: false };
    const reviews: FeaturedReview[] = (
      rows as unknown as {
        id: string;
        rating: number;
        body: string;
        first_name: string | null;
        last_name: string | null;
        verified_purchase: boolean;
        created_at: string;
        products: { slug: string; name: unknown; stores: { name: string } | { name: string }[] };
      }[]
    ).map((row) => {
      const first = (row.first_name ?? "").trim();
      const lastInitial = (row.last_name ?? "").trim().slice(0, 1);
      const store = Array.isArray(row.products.stores) ? row.products.stores[0] : row.products.stores;
      return {
        id: row.id,
        rating: Math.min(5, Math.max(1, Number(row.rating) || 5)),
        body: row.body,
        reviewerName: [first, lastInitial ? `${lastInitial}.` : ""].filter(Boolean).join(" ") || "—",
        verifiedPurchase: row.verified_purchase === true,
        productName: reviewLocalized(row.products.name, data.locale, row.products.slug),
        productSlug: row.products.slug,
        storeName: store?.name ?? "",
        createdAt: row.created_at,
      };
    });
    return { reviews, hasData: reviews.length > 0 };
  });
