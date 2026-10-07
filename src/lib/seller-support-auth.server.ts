import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  SUPPORT_READ_PERMISSIONS,
  type SellerContext,
} from "@/lib/seller-auth";

type SellerDb = SupabaseClient<Database>;

const SUPPORT_COOKIE_NAME = "modalia_support";

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function readSupportToken(): string | null {
  const header = getRequest()?.headers?.get("cookie");
  if (!header) return null;
  const part = header
    .split(";")
    .map((segment) => segment.trim())
    .find((segment) => segment.startsWith(`${SUPPORT_COOKIE_NAME}=`));
  if (!part) return null;
  const token = decodeURIComponent(part.slice(SUPPORT_COOKIE_NAME.length + 1));
  return /^[0-9a-f]{64}$/.test(token) ? token : null;
}

/** Resolves the narrow, read-only admin support context from an HttpOnly grant. */
export async function resolveSupportSeller(ctx: {
  supabase: SellerDb;
  userId: string;
}): Promise<SellerContext | null> {
  const token = readSupportToken();
  if (!token) return null;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const nowIso = new Date().toISOString();
  const { data: grant } = await supabaseAdmin
    .from("seller_support_grants")
    .select("id,admin_id,seller_id,expires_at")
    .eq("token_hash", await sha256Hex(token))
    .is("revoked_at", null)
    .gt("expires_at", nowIso)
    .maybeSingle();
  if (!grant || grant.admin_id !== ctx.userId) return null;

  const { data: stillAdmin } = await ctx.supabase.rpc("is_super_admin");
  if (stillAdmin !== true) return null;

  const { data: seller } = await supabaseAdmin
    .from("sellers")
    .select("id,legal_name,onboarded_at")
    .eq("id", grant.seller_id)
    .maybeSingle();
  if (!seller) return null;

  const { data: store } = await supabaseAdmin
    .from("stores")
    .select("id,slug")
    .eq("seller_id", seller.id)
    .maybeSingle();

  void supabaseAdmin
    .from("seller_support_grants")
    .update({ last_used_at: nowIso })
    .eq("id", grant.id);

  return {
    sellerId: seller.id,
    storeId: store?.id ?? null,
    storeSlug: store?.slug ?? null,
    isOwner: false,
    permissions: [...SUPPORT_READ_PERMISSIONS],
    legalName: seller.legal_name,
    mustResetPassword: false,
    onboarded: seller.onboarded_at != null,
    supportMode: true,
    supportAdminId: grant.admin_id,
    supportExpiresAt: grant.expires_at,
  };
}