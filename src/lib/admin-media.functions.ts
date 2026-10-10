/**
 * Admin media manager server functions (Phase 4/8, Worker 3).
 *
 * Real product-media operations on the `product-media` storage bucket and the
 * `product_images` table: upload (signed URL + server-side content
 * validation), preview URLs, alt text, primary flag, reorder, replace and
 * safe delete (storage objects are removed only when no product_images row
 * references them — `duplicateProduct` copies storage paths between
 * products, so blind deletes would break the copies).
 *
 * Upload flow (enforced server-side, never trusted from the client):
 *   1. `requestMediaUpload` — metadata validation (type/size), mints a
 *      short-lived signed upload URL scoped to
 *      `<sellerId>/products/<productId>/<uuid>.<ext>`.
 *   2. The browser PUTs the file bytes to that URL.
 *   3. `finalizeMediaUpload` — downloads the object with the service role,
 *      validates magic bytes + real image dimensions, deletes the object on
 *      failure, and only then inserts the `product_images` row.
 *
 * Every function is admin-only: `.middleware([requireSupabaseAuth])` plus
 * `assertAdmin` (the `is_super_admin` RPC), the same pattern as the other
 * admin function modules. Mutations are written to `audit_logs`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";
import { assertAdmin } from "@/lib/admin-auth";
import { assertAdminPermission } from "@/lib/admin-permissions";
import {
  detectMediaKind,
  validateMediaBytes,
  validateMediaMeta,
  type MediaKind,
} from "@/lib/media-validation";

const adminOnly = [requireSupabaseAuth] as const;
const MEDIA_BUCKET = "product-media";
const uuid = z.string().uuid();

type ProductImageInsert = Database["public"]["Tables"]["product_images"]["Insert"];

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function auditLog(
  context: unknown,
  action: string,
  resource: string,
  resourceId: string | null,
  metadata: Record<string, Json> = {},
) {
  try {
    const supabaseAdmin = await adminClient();
    const actorId = (context as { userId?: string } | null | undefined)?.userId ?? null;
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: actorId,
      action,
      resource,
      resource_id: resourceId,
      metadata,
    });
  } catch {
    // Audit logging must never break the mutation itself.
  }
}

const altTextSchema = z
  .object({
    fr: z.string().max(500).optional(),
    en: z.string().max(500).optional(),
    ar: z.string().max(500).optional(),
  })
  .optional();

/** `<sellerId>/products/<productId>/<uuid>.<ext>` — rejects path games. */
function parseManagedPath(path: string): { sellerId: string; productId: string } | null {
  const m =
    /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/products\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[0-9a-f-]{1,64}\.(jpg|jpeg|png|webp|gif|mp4|webm|glb|gltf)$/i.exec(
      path.trim(),
    );
  if (!m) return null;
  return { sellerId: m[1]!, productId: m[2]! };
}

/**
 * `<sellerId>/uploads/<uuid>.<ext>` — pre-save uploads (the admin editor's
 * "new product" mode, mirroring the seller pipeline's
 * `<sellerId>/uploads/` staging area). Rejects path games.
 */
function parseStagingPath(path: string): { sellerId: string } | null {
  const m =
    /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/uploads\/[0-9a-f-]{1,64}\.(jpg|jpeg|png|webp|gif|mp4|webm|glb|gltf)$/i.exec(
      path.trim(),
    );
  if (!m) return null;
  return { sellerId: m[1]! };
}

async function getProductSeller(productId: string): Promise<string> {
  const supabaseAdmin = await adminClient();
  const { data, error } = await supabaseAdmin
    .from("products")
    .select("id, seller_id")
    .eq("id", productId)
    .maybeSingle();
  if (error || !data) throw new Error("Product not found.");
  return data.seller_id;
}

/**
 * Download an object and run full content validation. On failure the object
 * is deleted so invalid bytes never linger in the bucket. Returns the real
 * image dimensions when the kind is `image`.
 */
async function downloadAndValidate(
  path: string,
  kind: MediaKind,
): Promise<{ width?: number; height?: number }> {
  const supabaseAdmin = await adminClient();
  const { data: blob, error: dlError } = await supabaseAdmin.storage
    .from(MEDIA_BUCKET)
    .download(path);
  if (dlError || !blob) {
    throw new Error("The uploaded file could not be read. Please upload it again.");
  }
  const buffer = new Uint8Array(await blob.arrayBuffer());
  // Re-run the metadata check against the real stored size — the client
  // declaration is never trusted.
  const filename = path.split("/").pop() ?? path;
  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  try {
    validateMediaMeta({
      filename,
      mimeType: blob.type || undefined,
      sizeBytes: buffer.length,
      expectedKind: kind,
    });
    return validateMediaBytes(buffer, kind, ext);
  } catch (e) {
    // Invalid content: remove the object, then surface the validation error.
    await supabaseAdmin.storage.from(MEDIA_BUCKET).remove([path]);
    throw e;
  }
}

/** Remove storage objects that no remaining product_images row references. */
async function removeUnreferencedObjects(paths: string[]): Promise<void> {
  const uniq = [...new Set(paths.map((p) => p.trim()).filter(Boolean))];
  if (!uniq.length) return;
  const supabaseAdmin = await adminClient();
  const { data: refs, error } = await supabaseAdmin
    .from("product_images")
    .select("storage_path")
    .in("storage_path", uniq);
  if (error) throw new Error(error.message);
  const referenced = new Set((refs ?? []).map((r) => r.storage_path));
  const orphans = uniq.filter((p) => !referenced.has(p));
  if (orphans.length) {
    const { error: rmError } = await supabaseAdmin.storage.from(MEDIA_BUCKET).remove(orphans);
    if (rmError) throw new Error(rmError.message);
  }
}

// ---------------------------------------------------------------------------
// Upload: request (metadata check + signed URL) → browser PUT → finalize
// ---------------------------------------------------------------------------

export const requestMediaUpload = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) =>
    z
      .object({
        productId: uuid.optional(),
        sellerId: uuid.optional(),
        filename: z.string().min(1).max(200),
        mimeType: z.string().max(120).optional(),
        sizeBytes: z.number().int().min(1),
        mediaKind: z.enum(["image", "video", "model_3d"]).optional(),
      })
      .refine((d) => Boolean(d.productId) !== Boolean(d.sellerId), {
        message: "Provide exactly one of productId or sellerId.",
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdminPermission(context, "content.manage");
    const { kind, extension } = validateMediaMeta({
      filename: data.filename,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      expectedKind: data.mediaKind ?? null,
    });
    const supabaseAdmin = await adminClient();
    let path: string;
    if (data.productId) {
      const sellerId = await getProductSeller(data.productId);
      path = `${sellerId}/products/${data.productId}/${crypto.randomUUID()}.${extension}`;
    } else {
      // Pre-save staging for the admin product editor's "new product" mode:
      // the admin has already chosen a seller, so uploads stage under that
      // seller's prefix (mirrors the seller pipeline's <sellerId>/uploads/).
      const { data: seller, error } = await supabaseAdmin
        .from("sellers")
        .select("id")
        .eq("id", data.sellerId as string)
        .maybeSingle();
      if (error || !seller) throw new Error("Seller not found.");
      path = `${seller.id}/uploads/${crypto.randomUUID()}.${extension}`;
    }
    const { data: signed, error } = await supabaseAdmin.storage
      .from(MEDIA_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !signed?.signedUrl) {
      throw new Error(error?.message ?? "Could not prepare the upload.");
    }
    return { path, signedUrl: signed.signedUrl, token: signed.token, mediaKind: kind as MediaKind };
  });

export const finalizeMediaUpload = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) =>
    z
      .object({
        productId: uuid.optional(),
        sellerId: uuid.optional(),
        path: z.string().min(1).max(500),
        mediaKind: z.enum(["image", "video", "model_3d"]),
        altText: altTextSchema,
      })
      .refine((d) => Boolean(d.productId) !== Boolean(d.sellerId), {
        message: "Provide exactly one of productId or sellerId.",
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdminPermission(context, "content.manage");
    const supabaseAdmin = await adminClient();
    if (data.sellerId) {
      // Staging mode (admin editor "new product"): validate content, keep the
      // object; the editor attaches the path to the product on save.
      const staged = parseStagingPath(data.path);
      if (!staged || staged.sellerId !== data.sellerId) {
        throw new Error("The upload path is not valid for this seller.");
      }
      const dims = await downloadAndValidate(data.path, data.mediaKind);
      await auditLog(context, "media_uploaded", "storage_object", null, {
        seller_id: data.sellerId,
        media_kind: data.mediaKind,
        staged: true,
      });
      return { staged: true as const, width: dims.width ?? null, height: dims.height ?? null };
    }
    const productId = data.productId as string;
    const parsed = parseManagedPath(data.path);
    if (!parsed || parsed.productId !== productId) {
      throw new Error("The upload path is not valid for this product.");
    }
    const sellerId = await getProductSeller(productId);
    if (parsed.sellerId !== sellerId) {
      throw new Error("The upload path does not belong to this product's seller.");
    }

    const dims = await downloadAndValidate(data.path, data.mediaKind);

    const { data: existing, error: countError } = await supabaseAdmin
      .from("product_images")
      .select("id, sort_order")
      .eq("product_id", productId)
      .order("sort_order", { ascending: false })
      .limit(1);
    if (countError) throw new Error(countError.message);
    const isFirst = !existing || existing.length === 0;
    const nextOrder = existing?.[0] ? (existing[0].sort_order ?? 0) + 1 : 0;

    const insert: ProductImageInsert = {
      product_id: productId,
      storage_path: data.path,
      alt_text: (data.altText ?? {}) as unknown as Json,
      is_primary: isFirst,
      sort_order: nextOrder,
      media_type: data.mediaKind,
      variant_id: null,
    };
    const { data: row, error: insertError } = await supabaseAdmin
      .from("product_images")
      .insert(insert)
      .select("id, storage_path, alt_text, is_primary, sort_order, media_type, created_at")
      .single();
    if (insertError || !row) {
      await supabaseAdmin.storage.from(MEDIA_BUCKET).remove([data.path]);
      throw new Error(insertError?.message ?? "Could not save the media record.");
    }
    await auditLog(context, "media_uploaded", "product_image", row.id, {
      product_id: productId,
      media_kind: data.mediaKind,
    });
    return { image: row, width: dims.width ?? null, height: dims.height ?? null };
  });

// ---------------------------------------------------------------------------
// Product media listing (with preview URLs)
// ---------------------------------------------------------------------------

export type AdminProductMedia = {
  id: string;
  storagePath: string;
  altText: Record<string, string>;
  isPrimary: boolean;
  sortOrder: number;
  mediaType: string;
  previewUrl: string | null;
  width: number | null;
  height: number | null;
};

export const listProductMedia = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) => z.object({ productId: uuid }).parse(data))
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      product: { id: string; name: Json; slug: string };
      media: AdminProductMedia[];
    }> => {
      await assertAdminPermission(context, "content.manage");
      const supabaseAdmin = await adminClient();
      const { data: product, error: pError } = await supabaseAdmin
        .from("products")
        .select("id, name, slug")
        .eq("id", data.productId)
        .maybeSingle();
      if (pError || !product) throw new Error("Product not found.");
      const { data: rows, error } = await supabaseAdmin
        .from("product_images")
        .select("id, storage_path, alt_text, is_primary, sort_order, media_type")
        .eq("product_id", data.productId)
        .order("sort_order", { ascending: true });
      if (error) throw new Error(error.message);
      const paths = (rows ?? []).map((r) => r.storage_path);
      const urls = new Map<string, string>();
      if (paths.length) {
        const { data: signed, error: sError } = await supabaseAdmin.storage
          .from(MEDIA_BUCKET)
          .createSignedUrls(paths, 3600);
        if (sError) throw new Error(sError.message);
        for (const s of signed ?? []) {
          const url = s.signedUrl ?? s.signedURL;
          if (s.path && url) urls.set(s.path, url);
        }
      }
      return {
        product: { id: product.id, name: product.name, slug: product.slug },
        media: (rows ?? []).map((r) => ({
          id: r.id,
          storagePath: r.storage_path,
          altText:
            r.alt_text && typeof r.alt_text === "object" && !Array.isArray(r.alt_text)
              ? (r.alt_text as Record<string, string>)
              : {},
          isPrimary: r.is_primary,
          sortOrder: r.sort_order,
          mediaType: r.media_type,
          previewUrl: urls.get(r.storage_path) ?? null,
          width: null,
          height: null,
        })),
      };
    },
  );

// ---------------------------------------------------------------------------
// Alt text / primary / reorder / replace / delete
// ---------------------------------------------------------------------------

async function imageBelongsToProduct(imageId: string, productId: string) {
  const supabaseAdmin = await adminClient();
  const { data, error } = await supabaseAdmin
    .from("product_images")
    .select("id, product_id, storage_path, media_type")
    .eq("id", imageId)
    .eq("product_id", productId)
    .maybeSingle();
  if (error || !data) throw new Error("Media not found for this product.");
  return data;
}

export const updateMediaAlt = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) =>
    z.object({ imageId: uuid, productId: uuid, altText: altTextSchema }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdminPermission(context, "content.manage");
    await imageBelongsToProduct(data.imageId, data.productId);
    const supabaseAdmin = await adminClient();
    const { error } = await supabaseAdmin
      .from("product_images")
      .update({ alt_text: (data.altText ?? {}) as unknown as Json })
      .eq("id", data.imageId);
    if (error) throw new Error(error.message);
    await auditLog(context, "media_alt_updated", "product_image", data.imageId, {
      product_id: data.productId,
    });
    return { ok: true as const };
  });

export const setPrimaryMedia = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) => z.object({ imageId: uuid, productId: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdminPermission(context, "content.manage");
    await imageBelongsToProduct(data.imageId, data.productId);
    const supabaseAdmin = await adminClient();
    const { error: clearError } = await supabaseAdmin
      .from("product_images")
      .update({ is_primary: false })
      .eq("product_id", data.productId);
    if (clearError) throw new Error(clearError.message);
    const { error } = await supabaseAdmin
      .from("product_images")
      .update({ is_primary: true })
      .eq("id", data.imageId);
    if (error) throw new Error(error.message);
    await auditLog(context, "media_primary_set", "product_image", data.imageId, {
      product_id: data.productId,
    });
    return { ok: true as const };
  });

export const reorderMedia = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) =>
    z.object({ productId: uuid, orderedIds: z.array(uuid).min(1).max(50) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdminPermission(context, "content.manage");
    const supabaseAdmin = await adminClient();
    const { data: rows, error } = await supabaseAdmin
      .from("product_images")
      .select("id")
      .eq("product_id", data.productId);
    if (error) throw new Error(error.message);
    const current = new Set((rows ?? []).map((r) => r.id));
    const incoming = new Set(data.orderedIds);
    if (current.size !== incoming.size || [...current].some((id) => !incoming.has(id))) {
      throw new Error("The media order does not match this product's media.");
    }
    for (let i = 0; i < data.orderedIds.length; i++) {
      const imageId = data.orderedIds[i];
      if (!imageId) continue;
      const { error: upError } = await supabaseAdmin
        .from("product_images")
        .update({ sort_order: i })
        .eq("id", imageId);
      if (upError) throw new Error(upError.message);
    }
    await auditLog(context, "media_reordered", "product", data.productId, {
      count: data.orderedIds.length,
    });
    return { ok: true as const };
  });

export const replaceMedia = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) =>
    z
      .object({
        imageId: uuid,
        productId: uuid,
        path: z.string().min(1).max(500),
        mediaKind: z.enum(["image", "video", "model_3d"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdminPermission(context, "content.manage");
    const existing = await imageBelongsToProduct(data.imageId, data.productId);
    const parsed = parseManagedPath(data.path);
    const sellerId = await getProductSeller(data.productId);
    if (!parsed || parsed.productId !== data.productId || parsed.sellerId !== sellerId) {
      throw new Error("The upload path is not valid for this product.");
    }
    if (data.path === existing.storage_path) {
      throw new Error("This is already the current file.");
    }
    await downloadAndValidate(data.path, data.mediaKind);
    const supabaseAdmin = await adminClient();
    const oldPath = existing.storage_path;
    const { error } = await supabaseAdmin
      .from("product_images")
      .update({ storage_path: data.path, media_type: data.mediaKind })
      .eq("id", data.imageId);
    if (error) {
      await supabaseAdmin.storage.from(MEDIA_BUCKET).remove([data.path]);
      throw new Error(error.message);
    }
    // Variants may pin this image via image_id — the row keeps its id, so
    // variant links survive the replacement untouched.
    await removeUnreferencedObjects([oldPath]);
    await auditLog(context, "media_replaced", "product_image", data.imageId, {
      product_id: data.productId,
    });
    return { ok: true as const };
  });

export const deleteMedia = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) => z.object({ imageId: uuid, productId: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdminPermission(context, "content.manage");
    const existing = await imageBelongsToProduct(data.imageId, data.productId);
    const supabaseAdmin = await adminClient();
    // Clear variant image pins first (FK is nullable; keep variants intact).
    await supabaseAdmin
      .from("product_variants")
      .update({ image_id: null })
      .eq("image_id", data.imageId);
    const { error } = await supabaseAdmin.from("product_images").delete().eq("id", data.imageId);
    if (error) throw new Error(error.message);
    await removeUnreferencedObjects([existing.storage_path]);
    // Keep exactly one primary when the deleted one was primary.
    const { data: remaining } = await supabaseAdmin
      .from("product_images")
      .select("id")
      .eq("product_id", data.productId)
      .order("sort_order")
      .limit(1);
    if (remaining?.[0]) {
      await supabaseAdmin
        .from("product_images")
        .update({ is_primary: true })
        .eq("id", remaining[0].id);
    }
    await auditLog(context, "media_deleted", "product_image", data.imageId, {
      product_id: data.productId,
    });
    return { ok: true as const };
  });

/**
 * Delete a raw storage object from the bucket browser. Refuses when any
 * product_images row still references the path, so in-use media can never
 * be orphaned from the browser.
 */
export const deleteStorageObject = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) => z.object({ path: z.string().min(1).max(1000) }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdminPermission(context, "content.manage");
    const path = data.path.trim();
    if (path.includes("..")) throw new Error("Invalid path.");
    const supabaseAdmin = await adminClient();
    const { count, error: refError } = await supabaseAdmin
      .from("product_images")
      .select("id", { count: "exact", head: true })
      .eq("storage_path", path);
    if (refError) throw new Error(refError.message);
    if (count && count > 0) {
      throw new Error(
        "This file is attached to a product. Delete it from the product's media instead.",
      );
    }
    const { error } = await supabaseAdmin.storage.from(MEDIA_BUCKET).remove([path]);
    if (error) throw new Error(error.message);
    await auditLog(context, "media_object_deleted", "storage_object", null, { path });
    return { ok: true as const };
  });

/** Re-exported for the uploader: the kind the server derived at request time. */
export type { MediaKind };
export { detectMediaKind };

/* ------------------------------------------------------------------ */
/* Media library (product-media bucket)                                */
/* ------------------------------------------------------------------ */

export type MediaEntry = {
  name: string;
  path: string;
  isFolder: boolean;
  size: number | null;
  mime: string | null;
  updatedAt: string | null;
};

export const listMedia = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) => z.object({ prefix: z.string().max(500).default("") }).parse(data))
  .handler(async ({ data, context }): Promise<{ prefix: string; entries: MediaEntry[] }> => {
    await assertAdminPermission(context, "content.manage");
    const supabaseAdmin = await adminClient();
    const prefix = data.prefix.replace(/(^\/+|\/+$)/g, "");
    const { data: objects, error } = await supabaseAdmin.storage
      .from(MEDIA_BUCKET)
      .list(prefix || undefined, { limit: 100, sortBy: { column: "updated_at", order: "desc" } });
    if (error) throw new Error(error.message);

    const entries: MediaEntry[] = (objects ?? [])
      .filter((o) => o.name !== ".emptyFolderPlaceholder")
      .map((o) => {
        const isFolder = o.id == null && (!o.metadata || Object.keys(o.metadata).length === 0);
        return {
          name: o.name,
          path: prefix ? `${prefix}/${o.name}` : o.name,
          isFolder,
          size: typeof o.metadata?.size === "number" ? o.metadata.size : null,
          mime: typeof o.metadata?.mimetype === "string" ? o.metadata.mimetype : null,
          updatedAt: o.updated_at ?? o.created_at ?? null,
        };
      });
    return { prefix, entries };
  });

export const getMediaSignedUrl = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) => z.object({ path: z.string().min(1).max(1000) }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdminPermission(context, "content.manage");
    const supabaseAdmin = await adminClient();
    const { data: signed, error } = await supabaseAdmin.storage
      .from(MEDIA_BUCKET)
      .createSignedUrl(data.path, 3600);
    if (error || !signed?.signedUrl) throw new Error(error?.message ?? "Could not sign URL.");
    return { url: signed.signedUrl };
  });
