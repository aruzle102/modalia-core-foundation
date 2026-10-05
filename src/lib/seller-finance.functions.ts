import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireSeller } from "@/lib/seller-auth";

const num = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
};

const SETTLED_STATUSES = ["approved", "paid"] as const;

async function getPayable(supabase: any, sellerId: string): Promise<number> {
  const [{ data: orders }, { data: settlements }] = await Promise.all([
    supabase.from("seller_orders").select("commission_total").eq("seller_id", sellerId).eq("status", "fulfilled"),
    supabase.from("seller_settlements").select("amount,status").eq("seller_id", sellerId).in("status", [...SETTLED_STATUSES]),
  ]);
  const earned = (orders ?? []).reduce((s: number, o: any) => s + num(o.commission_total), 0);
  const settled = (settlements ?? []).reduce((s: number, x: any) => s + num(x.amount), 0);
  return Math.max(0, earned - settled);
}

/* ------------------------------- Summary -------------------------------- */

export const getCommissionSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const seller = await requireSeller({ supabase: context.supabase, userId: context.userId }, "finance.view");

    const [{ data: sellerRow }, { data: history }, { data: orders }, { data: settlements }] = await Promise.all([
      context.supabase.from("sellers").select("legal_name,commission_rate").eq("id", seller.sellerId).single(),
      context.supabase
        .from("seller_commission_history")
        .select("id,rate,effective_from,changed_by,created_at")
        .eq("seller_id", seller.sellerId)
        .order("effective_from", { ascending: false })
        .limit(50),
      context.supabase.from("seller_orders").select("status,subtotal,shipping_total,commission_total").eq("seller_id", seller.sellerId),
      context.supabase.from("seller_settlements").select("status,amount").eq("seller_id", seller.sellerId),
    ]);

    const delivered = (orders ?? []).filter((o: any) => o.status === "fulfilled");
    const grossDelivered = delivered.reduce((s: number, o: any) => s + num(o.subtotal) + num(o.shipping_total), 0);
    const commissionPayable = delivered.reduce((s: number, o: any) => s + num(o.commission_total), 0);
    const settled = (settlements ?? [])
      .filter((x: any) => (SETTLED_STATUSES as readonly string[]).includes(x.status))
      .reduce((s: number, x: any) => s + num(x.amount), 0);
    const pendingPayout = Math.max(0, commissionPayable - settled);

    return {
      seller: { id: seller.sellerId, legalName: sellerRow?.legal_name ?? seller.legalName },
      rate: num(sellerRow?.commission_rate),
      isOwner: seller.isOwner,
      kpis: {
        grossDelivered,
        commissionPayable,
        netDelivered: Math.max(0, grossDelivered - commissionPayable),
        pendingPayout,
        settled,
        deliveredOrders: delivered.length,
      },
      history: (history ?? []).map((h: any) => ({
        id: h.id as string,
        rate: num(h.rate),
        effectiveFrom: h.effective_from as string,
        changedBy: (h.changed_by as string | null) ?? null,
        createdAt: h.created_at as string,
      })),
    };
  });

/* ------------------------------ Settlements ----------------------------- */

export const listSettlements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const seller = await requireSeller({ supabase: context.supabase, userId: context.userId }, "finance.view");
    const { data, error } = await context.supabase
      .from("seller_settlements")
      .select("id,amount,currency,period_start,period_end,status,payment_method,payment_reference,settled_at,notes,created_at")
      .eq("seller_id", seller.sellerId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const payable = await getPayable(context.supabase, seller.sellerId);
    return {
      isOwner: seller.isOwner,
      payable,
      settlements: (data ?? []).map((s: any) => ({
        id: s.id as string,
        amount: num(s.amount),
        currency: (s.currency as string) ?? "DZD",
        periodStart: (s.period_start as string | null) ?? null,
        periodEnd: (s.period_end as string | null) ?? null,
        status: s.status as string,
        paymentMethod: (s.payment_method as string | null) ?? null,
        paymentReference: (s.payment_reference as string | null) ?? null,
        settledAt: (s.settled_at as string | null) ?? null,
        notes: (s.notes as string | null) ?? null,
        createdAt: s.created_at as string,
      })),
    };
  });

export const requestSettlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        amount: z.number().positive().max(100_000_000),
        notes: z.string().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    // Money movement: owner only.
    const seller = await requireSeller({ supabase: context.supabase, userId: context.userId });
    if (!seller.isOwner) throw new Error("Only the store owner can request a settlement.");

    const payable = await getPayable(context.supabase, seller.sellerId);
    if (data.amount > payable + 1e-9) throw new Error(`Amount exceeds the payable balance of ${payable.toFixed(2)} DZD.`);

    const { data: row, error } = await context.supabase
      .from("seller_settlements")
      .insert({ seller_id: seller.sellerId, amount: data.amount, currency: "DZD", status: "pending", notes: data.notes ?? null })
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Unable to request settlement.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "seller_settlement.request",
      resource: "seller_settlements",
      resource_id: row.id,
      metadata: { seller_id: seller.sellerId, amount: data.amount },
    });

    return { ok: true, id: row.id as string };
  });
