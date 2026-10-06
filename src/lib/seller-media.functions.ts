/**
 * Seller media upload server functions (Phase 4/8, Worker 3).
 *
 * Gives the seller product editor a real upload path instead of the
 * paste-a-storage-path stopgap. Same enforcement model as the admin media
 * manager:
 *   1. `requestSellerMediaUpload` — metadata validation (type/size), mints a
 *      signed upload URL scoped to `<sellerId>/uploads/<uuid>.<ext>`.
 *   2. The browser PUTs the file bytes to that URL.
 *   3. `finalizeSellerMediaUpload` — downloads the object with the service
 *      role, validates magic bytes + real image dimensions, deletes the
 *      object on failure, and returns the verified path. The editor then
 *      attaches the path to the product through the regular `saveProduct`
 *      flow (which re-validates the `<sellerId>/` prefix), so there is a
 *      single product-images write path for sellers.
 *
 * Security: `.middleware([requireSupabaseAuth])` + `requireSeller` with the
 * `products.edit` permission. `seller_id` is never taken from the client —
 * the upload prefix always comes from the server session.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireSeller } from "@/lib/seller-auth";
import {
  validateMediaBytes,
  validateMediaMeta,
  type MediaKind,
} from "@/lib/media-validation";

const sellerOnly = [requireSupabaseAuth] as const;
const MEDIA_BUCKET = "product-media";

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const requestSellerMediaUpload = createServerFn({ method: "POST" })
  .middleware(sellerOnly)
  .inputValidator((data) =>
    z
      .object({
        filename: z.string().min(1).max(200),
        mimeType: z.string().max(120).optional(),
        sizeBytes: z.number().int().min(1),
        mediaKind: z.enum(["image", "video", "model_3d"]).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const seller = await requireSeller(context, "products.edit");
    const { kind, extension } = validateMediaMeta({
      filename: data.filename,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      expectedKind: data.mediaKind ?? null,
    });
    const path = `${seller.sellerId}/uploads/${crypto.randomUUID()}.${extension}`;
    const supabaseAdmin = await adminClient();
    const { data: signed, error } = await supabaseAdmin.storage
      .from(MEDIA_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !signed?.signedUrl) {
      throw new Error(error?.message ?? "Could not prepare the upload.");
    }
    return { path, signedUrl: signed.signedUrl, mediaKind: kind as MediaKind };
  });

export const finalizeSellerMediaUpload = createServerFn({ method: "POST" })
  .middleware(sellerOnly)
  .inputValidator((data) =>
    z
      .object({
        path: z.string().min(1).max(500),
        mediaKind: z.enum(["image", "video", "model_3d"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const seller = await requireSeller(context, "products.edit");
    const path = data.path.trim();
    const prefix = `${seller.sellerId}/uploads/`;
    if (path.includes("..") || !path.startsWith(prefix)) {
      throw new Error("This upload does not belong to your store.");
    }
    const filename = path.split("/").pop() ?? path;
    const supabaseAdmin = await adminClient();
    const { data: blob, error: dlError } = await supabaseAdmin.storage
      .from(MEDIA_BUCKET)
      .download(path);
    if (dlError || !blob) {
      throw new Error("The uploaded file could not be read. Please upload it again.");
    }
    const buffer = new Uint8Array(await blob.arrayBuffer());
    // Re-run the metadata check against the real stored bytes.
    validateMediaMeta({
      filename,
      mimeType: blob.type || undefined,
      sizeBytes: buffer.length,
      expectedKind: data.mediaKind,
    });
    const ext = (filename.split(".").pop() ?? "").toLowerCase();
    try {
      const dims = validateMediaBytes(buffer, data.mediaKind, ext);
      return {
        path,
        mediaKind: data.mediaKind as MediaKind,
        width: dims.width ?? null,
        height: dims.height ?? null,
      };
    } catch (e) {
      await supabaseAdmin.storage.from(MEDIA_BUCKET).remove([path]);
      throw e;
    }
  });

/**
 * Delete an uploaded-but-never-attached object (e.g. the seller removed it
 * from the editor before saving). Refuses when any `product_images` row
 * references the path, and only allows paths under the caller's own
 * `<sellerId>/uploads/` prefix.
 */
export const deleteSellerMediaObject = createServerFn({ method: "POST" })
  .middleware(sellerOnly)
  .inputValidator((data) => z.object({ path: z.string().min(1).max(500) }).parse(data))
  .handler(async ({ data, context }) => {
    const seller = await requireSeller(context, "products.edit");
    const path = data.path.trim();
    const prefix = `${seller.sellerId}/uploads/`;
    if (path.includes("..") || !path.startsWith(prefix)) {
      throw new Error("This upload does not belong to your store.");
    }
    const supabaseAdmin = await adminClient();
    const { count, error: refError } = await supabaseAdmin
      .from("product_images")
      .select("id", { count: "exact", head: true })
      .eq("storage_path", path);
    if (refError) throw new Error(refError.message);
    if (count && count > 0) throw new Error("This file is attached to a product.");
    const { error } = await supabaseAdmin.storage.from(MEDIA_BUCKET).remove([path]);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
