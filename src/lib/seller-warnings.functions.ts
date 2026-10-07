/**
 * Seller-side warning inbox: moderation warnings issued by admin
 * (product deleted/rejected/hidden, or plain notices).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireSeller } from "@/lib/seller-auth";

const sellerOnly = [requireSupabaseAuth] as const;

export type SellerWarning = {
  id: string;
  reason: string;
  actionTaken: string;
  issuedAt: string;
  acknowledgedAt: string | null;
  productId: string | null;
};

/** Seller: list my moderation warnings (newest first). */
export const getMyWarnings = createServerFn({ method: "GET" })
  .middleware(sellerOnly)
  .handler(async ({ context }): Promise<SellerWarning[]> => {
    const userId = (context as any)?.userId as string;
    if (!userId) throw new Error("Unauthorized");
    const seller = await requireSeller({ supabase: (context as any).supabase, userId }, "store.manage");
    const supabase = (context as any).supabase;

    const { data, error } = await supabase
      .from("seller_warnings")
      .select("id, reason, action_taken, issued_at, acknowledged_at, product_id")
      .eq("seller_id", seller.sellerId)
      .order("issued_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []).map((w: any) => ({
      id: w.id,
      reason: w.reason,
      actionTaken: w.action_taken,
      issuedAt: w.issued_at,
      acknowledgedAt: w.acknowledged_at,
      productId: w.product_id,
    }));
  });

/** Seller: acknowledge a warning (marks as read). */
export const acknowledgeWarning = createServerFn({ method: "POST" })
  .middleware(sellerOnly)
  .validator((d) => z.object({ warningId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const userId = (context as any)?.userId as string;
    if (!userId) throw new Error("Unauthorized");
    const seller = await requireSeller({ supabase: (context as any).supabase, userId }, "store.manage");
    const supabase = (context as any).supabase;

    const { error } = await supabase
      .from("seller_warnings")
      .update({ acknowledged_at: new Date().toISOString() })
      .eq("id", data.warningId)
      .eq("seller_id", seller.sellerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
