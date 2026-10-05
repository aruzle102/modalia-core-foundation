import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireSeller } from "@/lib/seller-auth";

export type SellerSearchKind = "product" | "order" | "customer";

export interface SellerSearchItem {
  kind: SellerSearchKind;
  id: string;
  label: string;
  /** Optional secondary line shown under the label. */
  sub?: string;
  to: string;
  /** Search params to forward to `to`. */
  search?: Record<string, string>;
}

const adminOnly = [requireSupabaseAuth] as const;

function productName(p: { slug: string; name: unknown }): string {
  if (p.name && typeof p.name === "object") {
    const n = p.name as Record<string, unknown>;
    for (const locale of ["en", "fr", "ar"]) {
      if (typeof n[locale] === "string" && (n[locale] as string).trim()) return n[locale] as string;
    }
    const first = Object.values(n).find((v) => typeof v === "string" && v.trim());
    if (typeof first === "string") return first;
  }
  return p.slug;
}

function extractCustomer(row: {
  first_name: string | null;
  last_name: string | null;
  guest_phone: string | null;
  address_snapshot: unknown;
}): { name: string; phone: string | null } {
  const snap =
    row.address_snapshot && typeof row.address_snapshot === "object"
      ? (row.address_snapshot as Record<string, unknown>)
      : null;
  const snapName =
    typeof snap?.['full_name'] === "string"
      ? snap['full_name']
      : [snap?.['first_name'], snap?.['last_name']].filter((v) => typeof v === "string" && v).join(" ");
  const name =
    snapName ||
    [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
    "Unknown customer";
  const phone =
    typeof snap?.['phone'] === "string" && snap['phone']
      ? snap['phone']
      : typeof snap?.['guest_phone'] === "string" && snap['guest_phone']
        ? snap['guest_phone']
        : row.guest_phone;
  return { name, phone };
}

/**
 * Seller-scoped global search: only ever returns the caller's OWN products,
 * orders and customers. Uses requireSeller (no permissions required) so the
 * seller_id always comes from the session.
 *
 * Candidate rows are fetched from the seller's own data and filtered in code
 * (avoids PostgREST quirks with jsonb name columns). A failing query degrades
 * to an empty group rather than failing the whole search.
 */
export const searchSellerCatalog = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) => z.object({ q: z.string().min(2).max(60) }).parse(data))
  .handler(async ({ data, context }): Promise<SellerSearchItem[]> => {
    const seller = await requireSeller({ supabase: context.supabase, userId: context.userId });
    // Strip characters that could break queries.
    const q = data.q.trim().replace(/[,()]/g, "").toLowerCase();
    if (q.length < 2) return [];

    const supabase = context.supabase;
    const items: SellerSearchItem[] = [];

    try {
      const { data: products, error } = await supabase
        .from("products")
        .select("id,slug,sku,name,base_price")
        .eq("seller_id", seller.sellerId)
        .order("updated_at", { ascending: false })
        .limit(60);
      if (!error && products) {
        for (const p of products) {
          const name = productName(p);
          if (
            name.toLowerCase().includes(q) ||
            p.slug.toLowerCase().includes(q) ||
            (p.sku ?? "").toLowerCase().includes(q)
          ) {
            items.push({
              kind: "product",
              id: p.id,
              label: name,
              sub: `${Number(p.base_price).toLocaleString()} DZD · ${p.slug}`,
              to: "/seller/products",
              search: { q: p.slug },
            });
          }
          if (items.length >= 12) break;
        }
      }
    } catch {
      /* degrade: empty product group */
    }

    try {
      const { data: rows, error } = await supabase
        .from("seller_orders")
        .select(
          "id,order_id,status,orders(id,order_number,grand_total,first_name,last_name,guest_phone,address_snapshot)",
        )
        .eq("seller_id", seller.sellerId)
        .order("created_at", { ascending: false })
        .limit(80);
      if (!error && rows) {
        const seenCustomers = new Map<string, SellerSearchItem>();
        let orderCount = 0;
        for (const row of rows) {
          const o = row.orders as {
            id: string;
            order_number: string;
            grand_total: number;
            first_name: string | null;
            last_name: string | null;
            guest_phone: string | null;
            address_snapshot: unknown;
          } | null;
          if (!o) continue;
          if (o.order_number.toLowerCase().includes(q) && orderCount < 8) {
            orderCount += 1;
            items.push({
              kind: "order",
              id: row.id,
              label: o.order_number,
              sub: `${Number(o.grand_total).toLocaleString()} DZD · ${String(row.status).replace(/_/g, " ")}`,
              to: "/seller/orders",
              search: { q: o.order_number },
            });
          }
          const customer = extractCustomer(o);
          if (
            (customer.name.toLowerCase().includes(q) ||
              (customer.phone ?? "").toLowerCase().includes(q)) &&
            seenCustomers.size < 6
          ) {
            const key = customer.phone ?? customer.name;
            if (!seenCustomers.has(key)) {
              const item: SellerSearchItem = {
                kind: "customer",
                id: `customer-${o.id}`,
                label: customer.name,
                sub: customer.phone ?? "No phone",
                to: "/seller/customers",
                search: { q: customer.phone ?? customer.name },
              };
              seenCustomers.set(key, item);
              items.push(item);
            }
          }
        }
      }
    } catch {
      /* degrade: empty order/customer groups */
    }

    return items;
  });
