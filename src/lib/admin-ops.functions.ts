import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";
import { assertAdmin } from "@/lib/admin-auth";
import { assertAdminPermission } from "@/lib/admin-permissions";

/**
 * Admin operations server functions (Super Admin OS, phase 3/8 — worker 1/5).
 *
 * Covers the new standalone admin sections: stores, customers, wilayas,
 * communes, official store, media library, security overview and site
 * settings. Every function is admin-only: `.middleware([requireSupabaseAuth])`
 * plus the shared `assertAdmin` that calls the `is_super_admin` RPC.
 *
 * Existing sections (products, orders, sellers, shipping rules, coupons,
 * settlements, audit logs) keep their own functions untouched.
 */

const adminOnly = [requireSupabaseAuth] as const;

type StoreRow = Database["public"]["Tables"]["stores"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type WilayaRow = Database["public"]["Tables"]["wilayas"]["Row"];
type CommuneRow = Database["public"]["Tables"]["communes"]["Row"];

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

/** Strip postgrest filter-breaking characters from free-text search. */
function sanitizeSearch(q: string): string {
  return q.replace(/[,()]/g, "").trim().slice(0, 100);
}

const PAGE_SIZE = 25;

/* ------------------------------------------------------------------ */
/* Stores                                                              */
/* ------------------------------------------------------------------ */

export type AdminStoreListItem = StoreRow & {
  seller_legal_name: string | null;
  product_count: number;
};

const listStoresInput = z.object({
  q: z.string().max(100).optional(),
  status: z.enum(["draft", "active", "suspended", "closed"]).optional(),
  page: z.number().int().min(1).default(1),
});

export const listAdminStores = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) => listStoresInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdminPermission(context, "stores.view");
    const supabaseAdmin = await adminClient();
    const q = data.q ? sanitizeSearch(data.q) : "";

    let query = supabaseAdmin.from("stores").select("*, sellers(legal_name)", { count: "exact" });
    if (data.status) query = query.eq("status", data.status);
    if (q) query = query.or(`name.ilike.%${q}%,slug.ilike.%${q}%`);

    const from = (data.page - 1) * PAGE_SIZE;
    const {
      data: rows,
      error,
      count,
    } = await query.order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);

    const items: AdminStoreListItem[] = (rows ?? []).map((s) => ({
      ...(s as StoreRow),
      seller_legal_name:
        (s as { sellers?: { legal_name?: string | null } | null }).sellers?.legal_name ?? null,
      product_count: 0,
    }));

    // Product counts per seller (products belong to sellers, stores to sellers).
    const sellerIds = [...new Set(items.map((s) => s.seller_id))];
    if (sellerIds.length > 0) {
      const { data: products } = await supabaseAdmin
        .from("products")
        .select("seller_id")
        .in("seller_id", sellerIds);
      const counts = new Map<string, number>();
      for (const p of products ?? []) {
        if (p.seller_id) counts.set(p.seller_id, (counts.get(p.seller_id) ?? 0) + 1);
      }
      for (const item of items) item.product_count = counts.get(item.seller_id) ?? 0;
    }

    return { items, total: count ?? 0, page: data.page, pageSize: PAGE_SIZE };
  });

/* ------------------------------------------------------------------ */
/* Customers (registered profiles + guest buyers)                      */
/* ------------------------------------------------------------------ */

export type AdminCustomerListItem = ProfileRow & {
  order_count: number;
  total_spent: number;
  last_order_at: string | null;
};

const listCustomersInput = z.object({
  q: z.string().max(100).optional(),
  page: z.number().int().min(1).default(1),
});

export const listAdminCustomers = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) => listCustomersInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdminPermission(context, "customers.view");
    const supabaseAdmin = await adminClient();
    const q = data.q ? sanitizeSearch(data.q) : "";

    let query = supabaseAdmin.from("profiles").select("*", { count: "exact" });
    if (q) query = query.or(`display_name.ilike.%${q}%,phone.ilike.%${q}%`);

    const from = (data.page - 1) * PAGE_SIZE;
    const {
      data: rows,
      error,
      count,
    } = await query.order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);

    const items: AdminCustomerListItem[] = (rows ?? []).map((p) => ({
      ...p,
      order_count: 0,
      total_spent: 0,
      last_order_at: null,
    }));

    const ids = items.map((p) => p.id);
    if (ids.length > 0) {
      const { data: orders } = await supabaseAdmin
        .from("orders")
        .select("customer_id,grand_total,created_at")
        .in("customer_id", ids);
      const stats = new Map<string, { n: number; total: number; last: string | null }>();
      for (const o of orders ?? []) {
        if (!o.customer_id) continue;
        const s = stats.get(o.customer_id) ?? { n: 0, total: 0, last: null };
        s.n += 1;
        s.total += Number(o.grand_total) || 0;
        if (!s.last || o.created_at > s.last) s.last = o.created_at;
        stats.set(o.customer_id, s);
      }
      for (const item of items) {
        const s = stats.get(item.id);
        if (s) {
          item.order_count = s.n;
          item.total_spent = s.total;
          item.last_order_at = s.last;
        }
      }
    }

    return { items, total: count ?? 0, page: data.page, pageSize: PAGE_SIZE };
  });

export type AdminGuestCustomer = {
  key: string;
  email: string | null;
  phone: string | null;
  order_count: number;
  total_spent: number;
  last_order_at: string | null;
};

export const listGuestCustomers = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) => z.object({ page: z.number().int().min(1).default(1) }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdminPermission(context, "customers.view");
    const supabaseAdmin = await adminClient();
    // Guest orders carry no customer_id; aggregate by contact details.
    const { data: orders, error } = await supabaseAdmin
      .from("orders")
      .select("guest_email,guest_phone,grand_total,created_at")
      .is("customer_id", null)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);

    const byKey = new Map<string, AdminGuestCustomer>();
    for (const o of orders ?? []) {
      const email = (o.guest_email ?? "").trim().toLowerCase() || null;
      const phone = (o.guest_phone ?? "").trim() || null;
      const key = email ?? phone ?? "unknown";
      const existing = byKey.get(key);
      if (existing) {
        existing.order_count += 1;
        existing.total_spent += Number(o.grand_total) || 0;
        if (!existing.last_order_at || o.created_at > existing.last_order_at) {
          existing.last_order_at = o.created_at;
        }
      } else {
        byKey.set(key, {
          key,
          email,
          phone,
          order_count: 1,
          total_spent: Number(o.grand_total) || 0,
          last_order_at: o.created_at,
        });
      }
    }

    const all = [...byKey.values()].sort((a, b) => b.order_count - a.order_count);
    const from = (data.page - 1) * PAGE_SIZE;
    return {
      items: all.slice(from, from + PAGE_SIZE),
      total: all.length,
      page: data.page,
      pageSize: PAGE_SIZE,
    };
  });

/* ------------------------------------------------------------------ */
/* Wilayas (with commune + shipping-rule counts)                       */
/* ------------------------------------------------------------------ */

export type AdminWilayaListItem = WilayaRow & {
  commune_count: number;
  rule_count: number;
};

/**
 * Rich wilaya list for the management page (with commune_count + rule_count).
 * For simple dropdowns, use the lite `listWilayas` in admin-catalog.functions.ts.
 */
export const listAdminWilayas = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) => z.object({}).parse(data))
  .handler(async ({ context }) => {
    await assertAdminPermission(context, "shipping.manage");
    const supabaseAdmin = await adminClient();
    const [{ data: wilayas, error }, { data: communes }, { data: rules }] = await Promise.all([
      supabaseAdmin.from("wilayas").select("*").order("code"),
      supabaseAdmin.from("communes").select("wilaya_id"),
      supabaseAdmin.from("shipping_rules").select("wilaya_id"),
    ]);
    if (error) throw new Error(error.message);

    const communeCounts = new Map<string, number>();
    for (const c of communes ?? []) {
      if (c.wilaya_id) communeCounts.set(c.wilaya_id, (communeCounts.get(c.wilaya_id) ?? 0) + 1);
    }
    const ruleCounts = new Map<string, number>();
    for (const r of rules ?? []) {
      if (r.wilaya_id) ruleCounts.set(r.wilaya_id, (ruleCounts.get(r.wilaya_id) ?? 0) + 1);
    }

    const items: AdminWilayaListItem[] = (wilayas ?? []).map((w) => ({
      ...w,
      commune_count: communeCounts.get(w.id) ?? 0,
      rule_count: ruleCounts.get(w.id) ?? 0,
    }));
    return { items };
  });

/* ------------------------------------------------------------------ */
/* Communes                                                            */
/* ------------------------------------------------------------------ */

export type AdminCommuneListItem = CommuneRow & {
  wilaya_code: string | null;
  wilaya_name: Json;
};

const listCommunesInput = z.object({
  wilayaId: z.string().uuid().optional(),
  q: z.string().max(100).optional(),
  page: z.number().int().min(1).default(1),
});

/**
 * Rich paginated/searchable commune list for the management page.
 * For simple dropdowns by wilaya, use the lite `listCommunes` in
 * admin-catalog.functions.ts.
 */
export const listAdminCommunes = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) => listCommunesInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdminPermission(context, "shipping.manage");
    const supabaseAdmin = await adminClient();
    const q = data.q ? sanitizeSearch(data.q) : "";

    let query = supabaseAdmin.from("communes").select("*, wilayas(code,name)", { count: "exact" });
    if (data.wilayaId) query = query.eq("wilaya_id", data.wilayaId);
    if (q) query = query.or(`code.ilike.%${q}%`);

    const from = (data.page - 1) * PAGE_SIZE;
    const {
      data: rows,
      error,
      count,
    } = await query.order("code").range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);

    const items: AdminCommuneListItem[] = (rows ?? []).map((c) => {
      const w = (c as { wilayas?: { code?: string; name?: unknown } | null }).wilayas;
      const { wilayas: _omit, ...rest } = c as CommuneRow & { wilayas?: unknown };
      void _omit;
      return {
        ...rest,
        wilaya_code: w?.code ?? null,
        wilaya_name: (w?.name as Json | undefined) ?? null,
      };
    });
    return { items, total: count ?? 0, page: data.page, pageSize: PAGE_SIZE };
  });

/* ------------------------------------------------------------------ */
/* Security overview                                                   */
/* ------------------------------------------------------------------ */

export type SecurityOverview = {
  roleCounts: { role: string; count: number }[];
  superAdmins: { user_id: string; display_name: string | null; created_at: string }[];
  passwordResetRequired: number;
  recentSecurityEvents: {
    id: string;
    action: string;
    created_at: string;
    resource: string | null;
  }[];
};

export const getSecurityOverview = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) => z.object({}).parse(data))
  .handler(async ({ context }): Promise<SecurityOverview> => {
    await assertAdmin(context);
    const supabaseAdmin = await adminClient();

    const [
      { data: roles },
      { data: admins },
      { data: resetSellers, count: resetCount },
      { data: events },
    ] = await Promise.all([
      supabaseAdmin.from("user_roles").select("role"),
      supabaseAdmin
        .from("user_roles")
        .select("user_id,created_at")
        .eq("role", "super_admin")
        .order("created_at"),
      supabaseAdmin
        .from("sellers")
        .select("id", { count: "exact" })
        .eq("must_reset_password", true),
      supabaseAdmin
        .from("audit_logs")
        .select("id,action,created_at,resource")
        .or(
          "action.ilike.%password%,action.ilike.%login%,action.ilike.%role%,action.ilike.%session%,action.ilike.%auth%",
        )
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const adminIds = (admins ?? []).map((a) => a.user_id);
    const { data: adminProfiles } =
      adminIds.length > 0
        ? await supabaseAdmin.from("profiles").select("id,display_name").in("id", adminIds)
        : { data: [] as { id: string; display_name: string | null }[] };
    const displayNames = new Map((adminProfiles ?? []).map((p) => [p.id, p.display_name]));

    const counts = new Map<string, number>();
    for (const r of roles ?? []) counts.set(r.role, (counts.get(r.role) ?? 0) + 1);

    return {
      roleCounts: [...counts.entries()]
        .map(([role, count]) => ({ role, count }))
        .sort((a, b) => b.count - a.count),
      superAdmins: (admins ?? []).map((a) => ({
        user_id: a.user_id,
        display_name: displayNames.get(a.user_id) ?? null,
        created_at: a.created_at,
      })),
      passwordResetRequired: resetCount ?? (resetSellers ?? []).length,
      recentSecurityEvents: (events ?? []).map((e) => ({
        id: e.id,
        action: e.action,
        created_at: e.created_at,
        resource: e.resource,
      })),
    };
  });

/* ------------------------------------------------------------------ */
/* Site settings (contact, social, SEO defaults)                       */
/* ------------------------------------------------------------------ */

/** Keys the admin settings UI is allowed to read/write. */
export const SITE_SETTING_KEYS = [
  "contact_email",
  "contact_phone",
  "contact_address",
  "contact_hours",
  "instagram_url",
  "facebook_url",
  "tiktok_url",
  "whatsapp_number",
  "seo_title",
  "seo_description",
  "seo_keywords",
  "seo_robots_index",
  // Platform product-moderation mode: `require_approval` (default) or
  // `auto_publish`. Read server-side by the seller publish actions.
  "product_moderation_mode",
  // Platform default commission rate (percent, 0–100) pre-filled in the
  // seller-creation wizard. Read by `getDefaultCommissionRate`.
  "default_commission_rate",
] as const;

export const getSiteSettings = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) => z.object({}).parse(data))
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await adminClient();
    const { data, error } = await supabaseAdmin
      .from("site_settings")
      .select("key,value,updated_at")
      .in("key", [...SITE_SETTING_KEYS]);
    if (error) throw new Error(error.message);
    const values: Record<string, Json> = {};
    for (const row of data ?? []) values[row.key] = row.value;
    return { values };
  });

export const updateSiteSettings = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) => z.object({ values: z.record(z.string(), z.unknown()) }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await adminClient();
    const actorId = (context as { userId?: string } | null | undefined)?.userId ?? null;

    const allowed = new Set<string>(SITE_SETTING_KEYS as readonly string[]);
    const rows = Object.entries(data.values)
      .filter(([key]) => allowed.has(key))
      .map(([key, value]) => {
        // The moderation mode is a strict enum — never persist garbage that
        // the seller publish path would silently fall back from.
        if (key === "product_moderation_mode") {
          if (value !== "require_approval" && value !== "auto_publish") {
            throw new Error("Invalid moderation mode.");
          }
        }
        // The default commission rate is a percent — never persist garbage
        // the seller wizard would silently fall back from.
        if (key === "default_commission_rate") {
          const n =
            typeof value === "number"
              ? value
              : Number(String(value ?? "").trim().replace(",", "."));
          if (!Number.isFinite(n) || n < 0 || n > 100) {
            throw new Error("Invalid default commission rate (0–100).");
          }
          return {
            key,
            value: Math.round(n * 100) / 100,
            updated_by: actorId,
            updated_at: new Date().toISOString(),
          };
        }
        return {
          key,
          value: value as Json,
          updated_by: actorId,
          updated_at: new Date().toISOString(),
        };
      });
    if (rows.length === 0) throw new Error("No valid settings to save.");

    const { error } = await supabaseAdmin.from("site_settings").upsert(rows, { onConflict: "key" });
    if (error) throw new Error(error.message);

    await auditLog(context, "site_settings_updated", "site_settings", null, {
      keys: rows.map((r) => r.key),
    });
    return { ok: true, saved: rows.length };
  });

/** Hard fallback when the platform setting was never configured. */
export const DEFAULT_COMMISSION_RATE = 10;

/**
 * Admin read of the platform default commission rate (percent, 0–100).
 * The seller-creation wizard pre-fills its commission step from this —
 * changing it in Admin > Settings actually changes new-seller behavior.
 */
export const getDefaultCommissionRate = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) => z.object({}).parse(data))
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await adminClient();
    const { data, error } = await supabaseAdmin
      .from("site_settings")
      .select("value")
      .eq("key", "default_commission_rate")
      .maybeSingle();
    if (error) throw new Error(error.message);
    const raw = data?.value as Json;
    const n =
      typeof raw === "number" ? raw : Number(String(raw ?? "").trim().replace(",", "."));
    const rate = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : DEFAULT_COMMISSION_RATE;
    return { rate };
  });
