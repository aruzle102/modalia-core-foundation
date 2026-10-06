/**
 * Platform product-moderation mode (Section 36, V8).
 *
 * Real platform setting stored in `site_settings` under the key
 * `product_moderation_mode` (jsonb value is a plain string):
 *   - `require_approval` (DEFAULT): seller submit/publish sets
 *     moderation_status='pending' / publication_status='pending_review' —
 *     a human moderator must approve.
 *   - `auto_publish`: seller submit/publish sets the product straight to
 *     approved/published/public/active (server-side, in the same write).
 *
 * The setting is read server-side at publish time (`submitForModeration`,
 * `bulkUpdateProducts` "submit") — changing it in Admin > Settings actually
 * changes seller-pipeline behavior. Admins change it via the existing
 * `site_settings` key allowlist in `admin-ops.functions.ts`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";

export const PRODUCT_MODERATION_MODE_KEY = "product_moderation_mode";

export const MODERATION_MODES = ["require_approval", "auto_publish"] as const;
export type ProductModerationMode = (typeof MODERATION_MODES)[number];

export const DEFAULT_MODERATION_MODE: ProductModerationMode = "require_approval";

export function isModerationMode(value: unknown): value is ProductModerationMode {
  return value === "require_approval" || value === "auto_publish";
}

/** Server-side read of the platform mode. Defaults to `require_approval`. */
export async function getProductModerationMode(
  admin: SupabaseClient<Database>,
): Promise<ProductModerationMode> {
  try {
    const { data, error } = await admin
      .from("site_settings")
      .select("value")
      .eq("key", PRODUCT_MODERATION_MODE_KEY)
      .maybeSingle();
    if (error || !data) return DEFAULT_MODERATION_MODE;
    const raw: unknown = data.value as Json;
    return isModerationMode(raw) ? raw : DEFAULT_MODERATION_MODE;
  } catch {
    return DEFAULT_MODERATION_MODE;
  }
}

/**
 * Column patch a seller "publish" action writes, given the platform mode.
 * `now` is the ISO timestamp of the write.
 */
export function publishStateForMode(mode: ProductModerationMode, now: string) {
  if (mode === "auto_publish") {
    return {
      moderation_status: "approved",
      publication_status: "published",
      visibility: "public",
      status: "active" as const,
      published_at: now,
      moderated_at: now,
      moderated_by: null,
      moderation_reason: "Auto-published (platform moderation mode).",
    };
  }
  return {
    moderation_status: "pending",
    publication_status: "pending_review",
    visibility: "private",
  };
}
