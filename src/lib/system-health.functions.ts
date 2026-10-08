/**
 * MODALIA — System health diagnostics.
 *
 * Safe, read-only checks an admin can run from Admin → System Health.
 * Never exposes secrets, credentials, or connection strings — only
 * status labels and non-sensitive counts.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin-auth";

export type HealthStatus = "healthy" | "warning" | "error";

export type HealthCheck = {
  id: string;
  category: string;
  label: string;
  status: HealthStatus;
  message: string;
};

const adminOnly = [requireSupabaseAuth] as const;

const REQUIRED_TABLES = [
  "products",
  "orders",
  "sellers",
  "stores",
  "customers",
  "profiles",
  "site_settings",
  "coupons",
  "notifications",
  "wilayas",
  "communes",
  "settlements",
  "reviews",
  "categories",
] as const;

const RLS_TABLES = [
  "products",
  "orders",
  "sellers",
  "stores",
  "customers",
  "coupons",
  "notifications",
  "reviews",
] as const;

const REQUIRED_BUCKETS = ["product-media", "review-images", "problem-reports", "settlement-proofs"] as const;

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function ok(id: string, category: string, label: string, message: string): HealthCheck {
  return { id, category, label, status: "healthy", message };
}
function warn(id: string, category: string, label: string, message: string): HealthCheck {
  return { id, category, label, status: "warning", message };
}
function err(id: string, category: string, label: string, message: string): HealthCheck {
  return { id, category, label, status: "error", message };
}

/**
 * Run all diagnostics. Each check is independent — one failing check never
 * prevents the others from running.
 */
export const runSystemHealthChecks = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .handler(async ({ context }): Promise<{ checks: HealthCheck[]; ranAt: string }> => {
    await assertAdmin(context);
    const supabase = await adminClient();
    const checks: HealthCheck[] = [];

    // 1. Database connectivity
    try {
      const { error } = await (supabase.rpc as any)("version").single();
      // `version` may not exist; fall back to a trivial select.
      if (error) {
        const { error: e2 } = await supabase.from("site_settings").select("key").limit(1);
        if (e2) throw e2;
      }
      checks.push(ok("db-connectivity", "Database", "Connectivity", "Database is reachable."));
    } catch (e) {
      checks.push(err("db-connectivity", "Database", "Connectivity", `Database unreachable: ${e instanceof Error ? e.message : "unknown error"}`));
    }

    // 2. Required tables exist (zero-row select per table via service role)
    try {
      const missing: string[] = [];
      for (const t of REQUIRED_TABLES) {
        const { error: te } = await (supabase as any).from(t).select("*").limit(0);
        if (te) missing.push(t);
      }
      if (missing.length === 0) {
        checks.push(ok("db-tables", "Database", "Required tables", `${REQUIRED_TABLES.length} required tables present.`));
      } else {
        checks.push(err("db-tables", "Database", "Required tables", `Missing or inaccessible tables: ${missing.join(", ")}`));
      }
    } catch (e) {
      checks.push(err("db-tables", "Database", "Required tables", `Check failed: ${e instanceof Error ? e.message : "unknown error"}`));
    }

    // 3. RLS enabled on key tables (via pg_tables — service role can read it)
    try {
      const { data, error } = await supabase
        .from("pg_tables" as any)
        .select("tablename,rowsecurity")
        .eq("schemaname", "public")
        .in("tablename", [...RLS_TABLES]);
      if (error) throw error;
      const rows = (data ?? []) as unknown as { tablename: string; rowsecurity: boolean }[];
      const withoutRls = RLS_TABLES.filter((t) => !rows.some((r) => r.tablename === t && r.rowsecurity));
      if (withoutRls.length === 0) {
        checks.push(ok("db-rls", "Database", "Row-level security", `RLS enabled on ${RLS_TABLES.length} key tables.`));
      } else {
        checks.push(warn("db-rls", "Database", "Row-level security", `RLS not enabled on: ${withoutRls.join(", ")}`));
      }
    } catch {
      checks.push(warn("db-rls", "Database", "Row-level security", "Could not verify RLS status (insufficient metadata access)."));
    }

    // 4. Storage buckets
    try {
      const { data, error } = await supabase.storage.listBuckets();
      if (error) throw error;
      const names = new Set((data ?? []).map((b) => b.id));
      const missing = REQUIRED_BUCKETS.filter((b) => !names.has(b));
      if (missing.length === 0) {
        checks.push(ok("storage-buckets", "Storage", "Buckets", `${REQUIRED_BUCKETS.length} required buckets present.`));
      } else {
        checks.push(err("storage-buckets", "Storage", "Buckets", `Missing buckets: ${missing.join(", ")}`));
      }
    } catch (e) {
      checks.push(err("storage-buckets", "Storage", "Buckets", `Check failed: ${e instanceof Error ? e.message : "unknown error"}`));
    }

    // 5. Wilaya data
    try {
      const { count, error } = await supabase.from("wilayas").select("id", { count: "exact", head: true });
      if (error) throw error;
      if ((count ?? 0) >= 58) {
        checks.push(ok("data-wilayas", "Catalog data", "Wilayas", `${count} wilayas present.`));
      } else if ((count ?? 0) > 0) {
        checks.push(warn("data-wilayas", "Catalog data", "Wilayas", `Only ${count} wilayas — expected 58.`));
      } else {
        checks.push(err("data-wilayas", "Catalog data", "Wilayas", "No wilaya data found."));
      }
    } catch (e) {
      checks.push(err("data-wilayas", "Catalog data", "Wilayas", `Check failed: ${e instanceof Error ? e.message : "unknown error"}`));
    }

    // 6. Commune data
    try {
      const { count, error } = await supabase.from("communes").select("id", { count: "exact", head: true });
      if (error) throw error;
      if ((count ?? 0) > 0) {
        checks.push(ok("data-communes", "Catalog data", "Communes", `${count} communes present.`));
      } else {
        checks.push(err("data-communes", "Catalog data", "Communes", "No commune data found."));
      }
    } catch (e) {
      checks.push(err("data-communes", "Catalog data", "Communes", `Check failed: ${e instanceof Error ? e.message : "unknown error"}`));
    }

    // 7. Product catalog sanity
    try {
      const { count, error } = await supabase.from("products").select("id", { count: "exact", head: true });
      if (error) throw error;
      checks.push(
        (count ?? 0) > 0
          ? ok("data-products", "Catalog data", "Products", `${count} products in catalog.`)
          : warn("data-products", "Catalog data", "Products", "Catalog is empty — storefront sections will hide."),
      );
    } catch (e) {
      checks.push(err("data-products", "Catalog data", "Products", `Check failed: ${e instanceof Error ? e.message : "unknown error"}`));
    }

    // 8. Order pipeline sanity
    try {
      const { count, error } = await supabase.from("orders").select("id", { count: "exact", head: true });
      if (error) throw error;
      checks.push(ok("data-orders", "Commerce", "Orders table", `Orders table readable (${count ?? 0} rows).`));
    } catch (e) {
      checks.push(err("data-orders", "Commerce", "Orders table", `Check failed: ${e instanceof Error ? e.message : "unknown error"}`));
    }

    // 9. Seller system sanity
    try {
      const { count, error } = await supabase.from("sellers").select("id", { count: "exact", head: true });
      if (error) throw error;
      checks.push(ok("data-sellers", "Marketplace", "Sellers table", `Sellers table readable (${count ?? 0} rows).`));
    } catch (e) {
      checks.push(err("data-sellers", "Marketplace", "Sellers table", `Check failed: ${e instanceof Error ? e.message : "unknown error"}`));
    }

    // 10. Coupon system sanity
    try {
      const { count, error } = await supabase.from("coupons").select("id", { count: "exact", head: true });
      if (error) throw error;
      checks.push(ok("data-coupons", "Commerce", "Coupons table", `Coupons table readable (${count ?? 0} rows).`));
    } catch (e) {
      checks.push(err("data-coupons", "Commerce", "Coupons table", `Check failed: ${e instanceof Error ? e.message : "unknown error"}`));
    }

    // 11. Notification system sanity
    try {
      const { count, error } = await supabase.from("notifications").select("id", { count: "exact", head: true });
      if (error) throw error;
      checks.push(ok("data-notifications", "Operations", "Notifications table", `Notifications table readable (${count ?? 0} rows).`));
    } catch (e) {
      checks.push(err("data-notifications", "Operations", "Notifications table", `Check failed: ${e instanceof Error ? e.message : "unknown error"}`));
    }

    return { checks, ranAt: new Date().toISOString() };
  });
