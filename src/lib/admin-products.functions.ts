/**
 * Admin product editor server functions (Section 35, V8).
 *
 * Gives platform admins the SAME full product write path sellers get
 * (`executeProductSave` in `seller-products.functions.ts` — shared core, no
 * second editor): trilingual name/description, price, stock, variants +
 * options matrix, category/brand, weight, images/video/3D, SEO. Differences
 * from the seller path, all server-enforced:
 *   - authorization is `assertAdmin` (super_admin), never a seller session;
 *   - the seller is taken from the existing product (edit) or an explicit
 *     admin-chosen seller (create) — never from the client alone;
 *   - every save is audit-logged with `admin_override: true` so admin edits
 *     of seller settings are explicit in the trail;
 *   - media uploads are validated against the product's seller prefix.
 *
 * Moderation/publish/status/featured/visibility stay on the dedicated admin
 * functions (`moderateAdminProduct`, `setProductStatus`, `updateAdminProduct`)
 * — this module is the editor read + save only.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";
import { assertAdminPermission } from "@/lib/admin-permissions";
import {
  executeProductSave,
  saveProductSchema,
  type SaveProductInput,
} from "@/lib/seller-products.functions";

const adminOnly = [requireSupabaseAuth] as const;
const uuid = z.string().uuid();

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Full product payload for the admin editor (same select as the seller editor). */
export const getAdminProductEditor = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) => z.object({ productId: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdminPermission(context, "products.view");
    const supabaseAdmin = await adminClient();
    const { data: product, error } = await supabaseAdmin
      .from("products")
      .select(
        "*, categories(id, name), brands(id, name), " +
          "product_options(id, code, name, sort_order, product_option_values(id, label, value, color_id, sort_order)), " +
          "product_variants(id, sku, price, compare_at_price, barcode, weight_grams, available, status, image_id, sort_order, variant_option_values(product_option_value_id), inventory(quantity, reserved_quantity, low_stock_threshold)), " +
          "product_images(id, storage_path, alt_text, is_primary, sort_order, media_type, variant_id), " +
          "product_tag_assignments(product_tags(id, name, slug))",
      )
      .eq("id", data.productId)
      .single();
    if (error || !product) throw new Error(error?.message ?? "Product not found.");
    return { product };
  });

/**
 * Editor option lists (categories/brands/colors) in the exact shapes the
 * shared `ProductEditor` consumes from the seller endpoints.
 */
export const getAdminEditorLists = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .handler(async ({ context }) => {
    await assertAdminPermission(context, "products.view");
    const supabaseAdmin = await adminClient();
    const [categories, brands, colors] = await Promise.all([
      supabaseAdmin
        .from("categories")
        .select("id, parent_id, name, status")
        .eq("status", "active")
        .order("name->>fr"),
      supabaseAdmin.from("brands").select("id, name, slug").order("name"),
      supabaseAdmin
        .from("colors")
        .select("id, name, slug, hex_value")
        .eq("active", true)
        .order("sort_order"),
    ]);
    if (categories.error) throw new Error(categories.error.message);
    if (brands.error) throw new Error(brands.error.message);
    if (colors.error) throw new Error(colors.error.message);
    return {
      categories: categories.data ?? [],
      brands: brands.data ?? [],
      colors: colors.data ?? [],
    };
  });

const adminSaveProductInput = saveProductSchema.extend({
  /** Required when creating (data.id absent); ignored on edit (product's own seller wins). */
  sellerId: uuid.optional(),
});

/**
 * Admin save (create / update) through the shared `executeProductSave` core:
 * identical validation and ordered writes as the seller pipeline, with the
 * admin override flagged in audit_logs. The seller is never trusted from the
 * client on edit — it is read from the existing product row.
 */
export const saveAdminProduct = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) => adminSaveProductInput.parse(data))
  .handler(async ({ data, context }): Promise<{ productId: string }> => {
    await assertAdminPermission(context, "products.manage");
    const supabaseAdmin = await adminClient();
    const actorId = (context as { userId?: string } | null | undefined)?.userId ?? null;

    let sellerId: string;
    let storeId: string | null;
    if (data.id) {
      const { data: existing, error } = await supabaseAdmin
        .from("products")
        .select("id, seller_id, store_id")
        .eq("id", data.id)
        .maybeSingle();
      if (error || !existing) throw new Error("Product not found.");
      sellerId = existing.seller_id;
      storeId = existing.store_id;
    } else {
      if (!data.sellerId) throw new Error("Choose a seller for the new product.");
      sellerId = data.sellerId;
      const { data: store, error } = await supabaseAdmin
        .from("stores")
        .select("id")
        .eq("seller_id", sellerId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!store) {
        throw new Error("This seller has no store yet — create a store for the seller first.");
      }
      storeId = store.id;
    }

    const { sellerId: _ignored, ...payload } = data;
    return executeProductSave(supabaseAdmin, payload as SaveProductInput, {
      sellerId,
      storeId,
      actorId,
      isAdmin: true,
    });
  });
