/**
 * MODALIA — Partner coupons (V10.1).
 *
 * Platform-wide partner promotions with tiered fixed discounts based on the
 * eligible cart merchandise subtotal. Sellers cannot opt out when the coupon
 * is marked mandatory (is_mandatory).
 *
 * Security:
 * - All admin mutations require requireSupabaseAuth + assertAdmin.
 * - validatePartnerCoupon is server-side only: it must be called with the
 *   service-role client (it reads coupons + coupon_tiers past RLS) and the
 *   server-computed cart subtotal. Never trust client-supplied amounts.
 * - The applied discount + funding snapshot must be persisted on the order
 *   at checkout time; never reconstruct historical discounts from the
 *   current coupon configuration.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type CouponTier = {
  id: string;
  minSubtotal: number;
  maxSubtotal: number | null;
  discountAmount: number;
  sortOrder: number;
};

export type PartnerCoupon = {
  id: string;
  code: string;
  couponType: string;
  partnerName: string | null;
  partnerLogo: string | null;
  fundingModel: string;
  isMandatory: boolean;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  usageCount: number;
  createdAt: string;
  tiers: CouponTier[];
};

function toTier(r: any): CouponTier {
  return {
    id: r.id,
    minSubtotal: Number(r.min_subtotal),
    maxSubtotal: r.max_subtotal == null ? null : Number(r.max_subtotal),
    discountAmount: Number(r.discount_amount),
    sortOrder: r.sort_order,
  };
}

function toCoupon(row: any, tiers: any[]): PartnerCoupon {
  return {
    id: row.id,
    code: row.code,
    couponType: row.coupon_type,
    partnerName: row.partner_name,
    partnerLogo: row.partner_logo,
    fundingModel: row.funding_model,
    isMandatory: !!row.is_mandatory,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    usageLimit: row.usage_limit,
    usageCount: row.usage_count ?? 0,
    createdAt: row.created_at,
    tiers: tiers.map(toTier),
  };
}

const tierSchema = z.object({
  minSubtotal: z.number().min(0),
  maxSubtotal: z.number().positive().nullable(),
  discountAmount: z.number().positive(),
});

const partnerCouponSchema = z.object({
  code: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[A-Z0-9_-]+$/i, "Code may only contain letters, numbers, dashes and underscores"),
  partnerName: z.string().min(2).max(200),
  partnerLogo: z.string().url().max(2000).optional().or(z.literal("")),
  description: z.string().max(1000).optional().or(z.literal("")),
  fundingModel: z.enum(["platform", "seller", "mixed"]).default("platform"),
  isMandatory: z.boolean().default(false),
  status: z.enum(["active", "inactive"]).default("active"),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  usageLimit: z.number().int().positive().nullable().optional(),
  tiers: z.array(tierSchema).min(1).max(10),
});

/**
 * Validate tier ranges server-side:
 * - strictly increasing, non-overlapping
 * - discount < min_subtotal for every tier (discount can never exceed the
 *   smallest eligible subtotal of its tier)
 * - exactly one open-ended top tier (max_subtotal null), in last position
 */
export function validateTiers(tiers: z.infer<typeof tierSchema>[]): string | null {
  const sorted = [...tiers].sort((a, b) => a.minSubtotal - b.minSubtotal);
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i]!;
    if (t.maxSubtotal !== null && t.maxSubtotal <= t.minSubtotal) {
      return `Tier ${i + 1}: maximum must be greater than minimum.`;
    }
    if (t.discountAmount >= t.minSubtotal) {
      return `Tier ${i + 1}: discount (${t.discountAmount}) must be less than the tier minimum (${t.minSubtotal}).`;
    }
    if (i > 0) {
      const prev = sorted[i - 1]!;
      if (prev.maxSubtotal === null) {
        return `Tier ${i}: only the last tier may be open-ended (no maximum).`;
      }
      if (t.minSubtotal < prev.maxSubtotal) {
        return `Tier ${i + 1} overlaps tier ${i} (ranges must not overlap).`;
      }
    }
  }
  const last = sorted[sorted.length - 1]!;
  if (last.maxSubtotal !== null) {
    return "The last tier must be open-ended (no maximum).";
  }
  return null;
}

async function assertUniqueCode(code: string, excludeId?: string): Promise<void> {
  const normalized = code.trim().toUpperCase();
  let q = supabaseAdmin
    .from("coupons")
    .select("id")
    .eq("code", normalized)
    .eq("coupon_type", "partner")
    .limit(1);
  if (excludeId) q = q.neq("id", excludeId);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(error.message);
  if (data) throw new Error(`A partner coupon with code "${normalized}" already exists.`);
}

/** Admin: list partner coupons with their tiers. */
export const listPartnerCoupons = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth] as const)
  .validator((d) =>
    z
      .object({ status: z.enum(["active", "inactive", "all"]).default("all") })
      .parse(d)
  )
  .handler(async ({ data, context }): Promise<PartnerCoupon[]> => {
    await assertAdmin(context);
    let q = supabaseAdmin
      .from("coupons")
      .select("*")
      .eq("coupon_type", "partner")
      .order("created_at", { ascending: false });
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const ids = (rows ?? []).map((r: any) => r.id);
    let tiersByCoupon = new Map<string, any[]>();
    if (ids.length > 0) {
      const { data: tiers, error: tErr } = await supabaseAdmin
        .from("coupon_tiers")
        .select("*")
        .in("coupon_id", ids)
        .order("sort_order", { ascending: true });
      if (tErr) throw new Error(tErr.message);
      for (const t of tiers ?? []) {
        const arr = tiersByCoupon.get(t.coupon_id) ?? [];
        arr.push(t);
        tiersByCoupon.set(t.coupon_id, arr);
      }
    }
    return (rows ?? []).map((r: any) => toCoupon(r, tiersByCoupon.get(r.id) ?? []));
  });

/** Admin: create a partner coupon with tiers. */
export const createPartnerCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth] as const)
  .validator((d) => partnerCouponSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean; id: string }> => {
    await assertAdmin(context);
    const tierError = validateTiers(data.tiers);
    if (tierError) throw new Error(tierError);
    await assertUniqueCode(data.code);

    const sorted = [...data.tiers].sort((a, b) => a.minSubtotal - b.minSubtotal);
    if (data.startsAt && data.endsAt && new Date(data.endsAt) <= new Date(data.startsAt)) {
      throw new Error("End date must be after start date.");
    }

    const { data: coupon, error } = await supabaseAdmin
      .from("coupons")
      .insert({
        code: data.code.trim().toUpperCase(),
        coupon_type: "partner",
        seller_id: null,
        discount_type: "fixed",
        discount_value: 0,
        partner_name: data.partnerName.trim(),
        partner_logo: data.partnerLogo?.trim() || null,
        funding_model: data.fundingModel,
        is_mandatory: data.isMandatory,
        status: data.status,
        starts_at: data.startsAt ?? null,
        ends_at: data.endsAt ?? null,
        usage_limit: data.usageLimit ?? null,
        usage_count: 0,
      })
      .select("id")
      .single();
    if (error || !coupon) throw new Error(error?.message ?? "Failed to create coupon.");

    const { error: tErr } = await supabaseAdmin.from("coupon_tiers").insert(
      sorted.map((t, i) => ({
        coupon_id: coupon.id,
        min_subtotal: t.minSubtotal,
        max_subtotal: t.maxSubtotal,
        discount_amount: t.discountAmount,
        sort_order: i,
      }))
    );
    if (tErr) {
      await supabaseAdmin.from("coupons").delete().eq("id", coupon.id);
      throw new Error(tErr.message);
    }
    return { ok: true, id: coupon.id };
  });

/** Admin: update a partner coupon (replaces tiers atomically). */
export const updatePartnerCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth] as const)
  .validator((d) => partnerCouponSchema.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    await assertAdmin(context);
    const tierError = validateTiers(data.tiers);
    if (tierError) throw new Error(tierError);
    await assertUniqueCode(data.code, data.id);

    const sorted = [...data.tiers].sort((a, b) => a.minSubtotal - b.minSubtotal);
    if (data.startsAt && data.endsAt && new Date(data.endsAt) <= new Date(data.startsAt)) {
      throw new Error("End date must be after start date.");
    }

    const { error } = await supabaseAdmin
      .from("coupons")
      .update({
        code: data.code.trim().toUpperCase(),
        partner_name: data.partnerName.trim(),
        partner_logo: data.partnerLogo?.trim() || null,
        funding_model: data.fundingModel,
        is_mandatory: data.isMandatory,
        status: data.status,
        starts_at: data.startsAt ?? null,
        ends_at: data.endsAt ?? null,
        usage_limit: data.usageLimit ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("coupon_type", "partner");
    if (error) throw new Error(error.message);

    // Replace tiers
    const { error: delErr } = await supabaseAdmin
      .from("coupon_tiers")
      .delete()
      .eq("coupon_id", data.id);
    if (delErr) throw new Error(delErr.message);
    const { error: insErr } = await supabaseAdmin.from("coupon_tiers").insert(
      sorted.map((t, i) => ({
        coupon_id: data.id,
        min_subtotal: t.minSubtotal,
        max_subtotal: t.maxSubtotal,
        discount_amount: t.discountAmount,
        sort_order: i,
      }))
    );
    if (insErr) throw new Error(insErr.message);
    return { ok: true };
  });

/** Admin: delete a partner coupon (tiers cascade). */
export const deletePartnerCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth] as const)
  .validator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    await assertAdmin(context);
    const { error } = await supabaseAdmin
      .from("coupons")
      .delete()
      .eq("id", data.id)
      .eq("coupon_type", "partner");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type PartnerCouponValidation =
  | { valid: true; couponId: string; tierIndex: number; discountAmount: number; fundingModel: string; isMandatory: boolean }
  | { valid: false; reason: string };

/**
 * SERVER-SIDE ONLY: validate a partner coupon code against the server-computed
 * eligible cart merchandise subtotal. Returns the applicable tier discount.
 *
 * Must be called with the service-role client (bypasses RLS) — never expose
 * coupon_tiers reads to the client. Callers must pass a subtotal they computed
 * server-side from real cart/order data.
 */
export async function validatePartnerCoupon(
  code: string,
  cartSubtotal: number
): Promise<PartnerCouponValidation> {
  const normalized = code.trim().toUpperCase();
  const now = new Date().toISOString();

  const { data: coupon, error } = await supabaseAdmin
    .from("coupons")
    .select("id, code, status, starts_at, ends_at, usage_limit, usage_count, funding_model, is_mandatory")
    .eq("code", normalized)
    .eq("coupon_type", "partner")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!coupon) return { valid: false, reason: "not_found" };
  if (coupon.status !== "active") return { valid: false, reason: "inactive" };
  if (coupon.starts_at && coupon.starts_at > now) return { valid: false, reason: "not_started" };
  if (coupon.ends_at && coupon.ends_at < now) return { valid: false, reason: "expired" };
  if (
    coupon.usage_limit != null &&
    (coupon.usage_count ?? 0) >= coupon.usage_limit
  ) {
    return { valid: false, reason: "usage_limit" };
  }

  const { data: tiers, error: tErr } = await supabaseAdmin
    .from("coupon_tiers")
    .select("min_subtotal, max_subtotal, discount_amount, sort_order")
    .eq("coupon_id", coupon.id)
    .order("sort_order", { ascending: true });
  if (tErr) throw new Error(tErr.message);

  const match = (tiers ?? []).find(
    (t: any) =>
      cartSubtotal >= Number(t.min_subtotal) &&
      (t.max_subtotal == null || cartSubtotal < Number(t.max_subtotal))
  );
  if (!match) return { valid: false, reason: "min_not_met" };

  const discount = Number(match.discount_amount);
  // Safety: discount can never exceed the subtotal it was evaluated against.
  const safeDiscount = Math.min(discount, cartSubtotal);
  if (safeDiscount <= 0) return { valid: false, reason: "min_not_met" };

  return {
    valid: true,
    couponId: coupon.id,
    tierIndex: match.sort_order,
    discountAmount: Math.round(safeDiscount * 100) / 100,
    fundingModel: coupon.funding_model,
    isMandatory: !!coupon.is_mandatory,
  };
}
