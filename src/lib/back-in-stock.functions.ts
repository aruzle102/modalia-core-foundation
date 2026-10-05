import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { checkRateLimit, rateLimitEndpoint } from "@/lib/rate-limit";

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

/** Variant must exist, belong to a public product, and be genuinely out of stock. */
async function assertOutOfStockVariant(variantId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const variantResult = await supabaseAdmin
    .from("product_variants")
    .select("id,available,products!inner(id,status,publication_status,moderation_status,visibility)")
    .eq("id", variantId)
    .maybeSingle();
  const variant = variantResult.data;
  if (variantResult.error || !variant) throw new Error("This product variant was not found.");
  const product = Array.isArray(variant.products) ? variant.products[0] : variant.products;
  if (
    !product ||
    product.status !== "active" ||
    product.publication_status !== "published" ||
    product.moderation_status !== "approved" ||
    product.visibility !== "public"
  ) {
    throw new Error("This product variant was not found.");
  }
  // Real stock lives in the inventory table (quantity − reserved_quantity),
  // not on the variant row.
  const inventoryResult = await supabaseAdmin
    .from("inventory")
    .select("quantity,reserved_quantity")
    .eq("variant_id", variantId)
    .maybeSingle();
  const stock = Math.max(
    0,
    (inventoryResult.data?.quantity ?? 0) - (inventoryResult.data?.reserved_quantity ?? 0),
  );
  if (variant.available && stock > 0) {
    throw new Error("This item is in stock — no alert needed.");
  }
  return supabaseAdmin;
}

const subscribeInput = z.object({
  variantId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email().max(255).optional(),
});

export const subscribeBackInStock = createServerFn({ method: "POST" })
  .inputValidator((data) => subscribeInput.parse(data))
  .handler(async ({ data }) => {
    rateLimitEndpoint("subscribeBackInStock", 20);
    if (data.email) checkRateLimit(`rl:bisEmail:${data.email}`, 10, 24 * 60 * 60 * 1000);

    const supabaseAdmin = await assertOutOfStockVariant(data.variantId);

    const callerUserId = await getOptionalUserId();
    let customerId: string | null = null;
    if (callerUserId) {
      const customerResult = await supabaseAdmin
        .from("customers")
        .select("id")
        .eq("profile_id", callerUserId)
        .maybeSingle();
      if (customerResult.data) customerId = customerResult.data.id;
    }
    const email = customerId ? null : data.email ?? null;
    if (!customerId && !email) {
      throw new Error("Enter your email to be notified.");
    }

    const insertResult = await supabaseAdmin.from("back_in_stock_subscriptions").insert({
      variant_id: data.variantId,
      customer_id: customerId,
      email,
    });
    // Unique index (variant × customer or variant × email) — a repeat
    // subscribe is idempotent success, not an error.
    if (insertResult.error && !insertResult.error.message.includes("duplicate")) {
      throw new Error("Your alert could not be saved.");
    }
    return { subscribed: true };
  });

export const unsubscribeBackInStock = createServerFn({ method: "POST" })
  .inputValidator((data) => subscribeInput.parse(data))
  .handler(async ({ data }) => {
    rateLimitEndpoint("unsubscribeBackInStock", 30);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const callerUserId = await getOptionalUserId();
    if (callerUserId) {
      const customerResult = await supabaseAdmin
        .from("customers")
        .select("id")
        .eq("profile_id", callerUserId)
        .maybeSingle();
      if (customerResult.data) {
        await supabaseAdmin
          .from("back_in_stock_subscriptions")
          .delete()
          .eq("variant_id", data.variantId)
          .eq("customer_id", customerResult.data.id);
        return { subscribed: false };
      }
    }
    if (data.email) {
      await supabaseAdmin
        .from("back_in_stock_subscriptions")
        .delete()
        .eq("variant_id", data.variantId)
        .eq("email", data.email);
    }
    return { subscribed: false };
  });

/** Whether the signed-in customer already asked to be alerted for a variant. */
export const getBackInStockStatus = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ variantId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const callerUserId = await getOptionalUserId();
    if (!callerUserId) return { subscribed: false };
    const customerResult = await supabaseAdmin
      .from("customers")
      .select("id")
      .eq("profile_id", callerUserId)
      .maybeSingle();
    if (!customerResult.data) return { subscribed: false };
    const subResult = await supabaseAdmin
      .from("back_in_stock_subscriptions")
      .select("id")
      .eq("variant_id", data.variantId)
      .eq("customer_id", customerResult.data.id)
      .maybeSingle();
    return { subscribed: Boolean(subResult.data) };
  });
