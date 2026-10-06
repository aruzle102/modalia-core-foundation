import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin-auth";

const adminOnly = [requireSupabaseAuth] as const;

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type OrderRow = { id: string; order_number: string; first_name: string | null; last_name: string | null; grand_total: number; status: string };
type SellerRow = { id: string; legal_name: string; email: string | null; account_status: string };
type ProductRow = { id: string; slug: string; base_price: number; status: string };
type StoreRow = { id: string; name: string; slug: string };
type CustomerRow = {
  id: string;
  email: string | null;
  phone: string | null;
  profiles: { display_name: string | null } | { display_name: string | null }[] | null;
};

async function runSearch<T>(query: any): Promise<T[]> {
  try {
    const { data, error } = await query;
    if (error) return [];
    return (data ?? []) as T[];
  } catch {
    return [];
  }
}

/**
 * Admin-only global search across orders, sellers, products, stores and
 * customers.
 * One failing table never takes down the whole search — it resolves to an
 * empty group instead.
 */
export const adminGlobalSearch = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) => z.object({ q: z.string().min(2).max(60) }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    // Strip characters that would break PostgREST's .or() list syntax.
    const q = data.q.trim().replace(/[,()]/g, "");
    if (q.length < 2) throw new Error("Search query too short.");
    const like = `%${q}%`;
    const supabase = context.supabase;
    // customers RLS only allows the customer themselves, so the customer
    // group is read through the service-role client (admin-only function).
    const supabaseAdmin = await adminClient();

    const [orders, sellers, products, stores, customers] = await Promise.all([
      runSearch<OrderRow>(
        supabase
          .from("orders")
          .select("id,order_number,first_name,last_name,grand_total,status")
          .or(`order_number.ilike.${like},guest_email.ilike.${like},guest_phone.ilike.${like},first_name.ilike.${like},last_name.ilike.${like}`)
          .order("created_at", { ascending: false })
          .limit(6),
      ),
      runSearch<SellerRow>(
        supabase
          .from("sellers")
          .select("id,legal_name,email,account_status")
          .or(`legal_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
          .order("created_at", { ascending: false })
          .limit(6),
      ),
      runSearch<ProductRow>(
        supabase
          .from("products")
          .select("id,slug,base_price,status")
          .ilike("slug", like)
          .order("created_at", { ascending: false })
          .limit(6),
      ),
      runSearch<StoreRow>(
        supabase
          .from("stores")
          .select("id,name,slug")
          .or(`name.ilike.${like},slug.ilike.${like}`)
          .order("created_at", { ascending: false })
          .limit(6),
      ),
      runSearch<CustomerRow>(
        supabaseAdmin
          .from("customers")
          .select("id,email,phone,profiles(display_name)")
          .or(`email.ilike.${like},phone.ilike.${like}`)
          .order("created_at", { ascending: false })
          .limit(6),
      ),
    ]);

    return {
      orders: orders.map((o) => ({
        id: o.id,
        order_number: o.order_number,
        customer: [o.first_name, o.last_name].filter(Boolean).join(" ") || "—",
        total: o.grand_total,
        status: o.status,
      })),
      sellers: sellers.map((s) => ({
        id: s.id,
        name: s.legal_name,
        email: s.email ?? "—",
        status: s.account_status,
      })),
      products: products.map((p) => ({
        id: p.id,
        slug: p.slug,
        price: p.base_price,
        status: p.status,
      })),
      stores: stores.map((s) => ({ id: s.id, name: s.name, slug: s.slug })),
      customers: customers.map((c) => {
        const profile = Array.isArray(c.profiles) ? (c.profiles[0] ?? null) : c.profiles;
        return {
          id: c.id,
          name: profile?.display_name?.trim() || c.email || c.phone || "—",
          email: c.email,
          phone: c.phone,
        };
      }),
    };
  });

export type AdminGlobalSearchResult = Awaited<ReturnType<typeof adminGlobalSearch>>;
