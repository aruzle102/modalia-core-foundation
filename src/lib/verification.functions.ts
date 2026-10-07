/**
 * MODALIA — Store verification request system.
 *
 * Conditions for eligibility:
 *  - 50+ delivered/paid sales in the last 30 days
 *  - 5000+ unique store views (deduplicated by device)
 *
 * Flow:
 *  1. Seller views eligibility (sales count, views count, progress)
 *  2. Eligible seller clicks "Request verification"
 *  3. Admin reviews in /admin/verifications — approve or reject
 *  4. Approved → store.verification_status = 'verified'
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireSeller } from "@/lib/seller-auth";
import { assertAdmin } from "@/lib/admin-auth";

const sellerOnly = [requireSupabaseAuth] as const;
const adminOnly = [requireSupabaseAuth] as const;

export type VerificationEligibility = {
  sales30d: number;
  uniqueViews: number;
  salesRequired: number;
  viewsRequired: number;
  eligible: boolean;
  requestStatus: "none" | "pending" | "approved" | "rejected";
  verificationStatus: string;
};

async function getSellerStore(supabase: any, sellerId: string) {
  const { data, error } = await supabase
    .from("stores")
    .select("id, verification_status")
    .eq("seller_id", sellerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Seller: get verification eligibility + current request status. */
export const getVerificationStatus = createServerFn({ method: "GET" })
  .middleware(sellerOnly)
  .handler(async ({ context }): Promise<VerificationEligibility> => {
    const userId = (context as any)?.userId as string;
    if (!userId) throw new Error("Unauthorized");
    const seller = await requireSeller({ supabase: (context as any).supabase, userId }, "store.manage");
    const supabase = (context as any).supabase;

    const store = await getSellerStore(supabase, seller.sellerId);
    if (!store) throw new Error("No store found");

    // Get eligibility from RPC
    const { data: elig, error: eligError } = await supabase.rpc("get_store_verification_eligibility", {
      p_store_id: store.id,
    });
    if (eligError) throw new Error(eligError.message);
    const row = Array.isArray(elig) ? elig[0] : elig;

    // Get current request status
    const { data: req } = await supabase
      .from("verification_requests")
      .select("status")
      .eq("store_id", store.id)
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      sales30d: Number(row?.sales_30d ?? 0),
      uniqueViews: Number(row?.unique_views ?? 0),
      salesRequired: 50,
      viewsRequired: 5000,
      eligible: Boolean(row?.eligible),
      requestStatus: (req?.status as VerificationEligibility["requestStatus"]) ?? "none",
      verificationStatus: store.verification_status ?? "unverified",
    };
  });

/** Seller: submit a verification request (only if eligible). */
export const requestVerification = createServerFn({ method: "POST" })
  .middleware(sellerOnly)
  .handler(async ({ context }): Promise<{ ok: boolean; message: string }> => {
    const userId = (context as any)?.userId as string;
    if (!userId) throw new Error("Unauthorized");
    const seller = await requireSeller({ supabase: (context as any).supabase, userId }, "store.manage");
    const supabase = (context as any).supabase;

    const store = await getSellerStore(supabase, seller.sellerId);
    if (!store) throw new Error("No store found");
    if (store.verification_status === "verified") {
      return { ok: false, message: "Store is already verified" };
    }

    // Check eligibility
    const { data: elig } = await supabase.rpc("get_store_verification_eligibility", {
      p_store_id: store.id,
    });
    const row = Array.isArray(elig) ? elig[0] : elig;
    if (!row?.eligible) {
      return {
        ok: false,
        message: `Not yet eligible: ${row?.sales_30d ?? 0}/50 sales, ${row?.unique_views ?? 0}/5000 views`,
      };
    }

    // Check for existing pending request
    const { data: existing } = await supabase
      .from("verification_requests")
      .select("id")
      .eq("store_id", store.id)
      .eq("status", "pending")
      .maybeSingle();
    if (existing) {
      return { ok: false, message: "A verification request is already pending" };
    }

    const { error } = await supabase.from("verification_requests").insert({
      store_id: store.id,
      seller_id: seller.sellerId,
      sales_30d: Number(row.sales_30d),
      unique_views: Number(row.unique_views),
    });
    if (error) throw new Error(error.message);
    return { ok: true, message: "Verification request submitted" };
  });

/** Public: record a store view (deduplicated by device hash). */
export const recordStoreView = createServerFn({ method: "POST" })
  .validator((d) => z.object({ storeId: z.string().uuid(), deviceHash: z.string().min(8).max(128) }).parse(d))
  .handler(async ({ data, context }): Promise<{ counted: boolean }> => {
    const supabase = (context as any).supabase;
    const { data: result, error } = await supabase.rpc("record_store_view", {
      p_store_id: data.storeId,
      p_device_hash: data.deviceHash,
    });
    if (error) throw new Error(error.message);
    return { counted: Boolean(result) };
  });

// ── Admin ──────────────────────────────────────────────────────────

export type VerificationRequestRow = {
  id: string;
  store_id: string;
  storeName: string;
  sellerName: string;
  status: string;
  sales_30d: number;
  unique_views: number;
  requested_at: string;
};

/** Admin: list verification requests. */
export const listVerificationRequests = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .validator((d) => z.object({ status: z.string().optional() }).parse(d))
  .handler(async ({ data, context }): Promise<VerificationRequestRow[]> => {
    await assertAdmin((context as any));
    const supabase = (context as any).supabase;

    let q = supabase
      .from("verification_requests")
      .select("id, store_id, status, sales_30d, unique_views, requested_at, stores!inner(name), sellers!inner(legal_name)")
      .order("requested_at", { ascending: false });
    if (data.status && data.status !== "all") q = q.eq("status", data.status);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({
      id: r.id,
      store_id: r.store_id,
      storeName: r.stores?.name ?? "—",
      sellerName: r.sellers?.legal_name ?? "—",
      status: r.status,
      sales_30d: r.sales_30d,
      unique_views: r.unique_views,
      requested_at: r.requested_at,
    }));
  });

/** Admin: approve or reject a verification request. */
export const reviewVerificationRequest = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .validator((d) =>
    z
      .object({
        requestId: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        notes: z.string().max(1000).optional(),
      })
      .parse(d)
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    await assertAdmin((context as any));
    const userId = (context as any)?.userId as string;
    const supabase = (context as any).supabase;

    const { data: req, error: reqError } = await supabase
      .from("verification_requests")
      .select("id, store_id, status")
      .eq("id", data.requestId)
      .single();
    if (reqError || !req) throw new Error("Request not found");
    if (req.status !== "pending") throw new Error("Request already reviewed");

    const { error: updError } = await supabase
      .from("verification_requests")
      .update({
        status: data.decision,
        reviewed_at: new Date().toISOString(),
        reviewed_by: userId,
        review_notes: data.notes ?? null,
      })
      .eq("id", data.requestId);
    if (updError) throw new Error(updError.message);

    if (data.decision === "approved") {
      const { error: storeError } = await supabase
        .from("stores")
        .update({ verification_status: "verified" })
        .eq("id", req.store_id);
      if (storeError) throw new Error(storeError.message);
    }
    return { ok: true };
  });
