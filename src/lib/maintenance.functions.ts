/**
 * MODALIA — Maintenance mode.
 *
 * Real platform setting stored in `site_settings`:
 *   - `maintenance_enabled` (jsonb boolean)
 *   - `maintenance_title`   (jsonb string)
 *   - `maintenance_message` (jsonb string)
 *
 * The public storefront reads the status through `getPublicMaintenanceStatus`
 * (public RLS allowlist) and the root layout shows a premium maintenance
 * page to non-admin visitors while it is enabled. Admin / seller / auth
 * routes are never blocked, so nobody gets locked out.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin-auth";
import type { Json } from "@/integrations/supabase/types";

export const MAINTENANCE_ENABLED_KEY = "maintenance_enabled";
export const MAINTENANCE_TITLE_KEY = "maintenance_title";
export const MAINTENANCE_MESSAGE_KEY = "maintenance_message";

export const DEFAULT_MAINTENANCE_TITLE = "We'll be back soon";
export const DEFAULT_MAINTENANCE_MESSAGE =
  "Modalia is getting better. Maintenance is in progress — we'll be back shortly.";

function publicClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("This service is temporarily unavailable.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function toBool(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

function toStr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

const adminOnly = [requireSupabaseAuth] as const;

/** Admin read of the maintenance settings (super-admin area, like Settings). */
export const getMaintenanceSettings = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const supabase = await adminClient();
    const { data, error } = await supabase
      .from("site_settings")
      .select("key,value")
      .in("key", [MAINTENANCE_ENABLED_KEY, MAINTENANCE_TITLE_KEY, MAINTENANCE_MESSAGE_KEY]);
    if (error) throw new Error(error.message);
    const values: Record<string, unknown> = {};
    for (const row of data ?? []) values[row.key] = row.value;
    return {
      enabled: toBool(values[MAINTENANCE_ENABLED_KEY]),
      title: toStr(values[MAINTENANCE_TITLE_KEY], DEFAULT_MAINTENANCE_TITLE),
      message: toStr(values[MAINTENANCE_MESSAGE_KEY], DEFAULT_MAINTENANCE_MESSAGE),
    };
  });

const maintenanceInput = z.object({
  enabled: z.boolean(),
  title: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(500),
});

/** Admin write of the maintenance settings. Audited. */
export const updateMaintenanceSettings = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .validator((d) => maintenanceInput.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    await assertAdmin(context);
    const supabase = await adminClient();
    const actorId = (context as { userId?: string } | null | undefined)?.userId ?? null;
    const now = new Date().toISOString();
    const rows = [
      { key: MAINTENANCE_ENABLED_KEY, value: data.enabled as Json },
      { key: MAINTENANCE_TITLE_KEY, value: data.title as Json },
      { key: MAINTENANCE_MESSAGE_KEY, value: data.message as Json },
    ].map((r) => ({ ...r, updated_by: actorId, updated_at: now }));
    const { error } = await supabase.from("site_settings").upsert(rows, { onConflict: "key" });
    if (error) throw new Error(error.message);
    try {
      await supabase.from("audit_logs").insert({
        actor_id: actorId,
        action: data.enabled ? "maintenance_enabled" : "maintenance_disabled",
        resource: "site_settings",
        resource_id: null,
        metadata: { title: data.title },
      });
    } catch {
      // Audit logging must never break the mutation itself.
    }
    return { ok: true };
  });

export type PublicMaintenanceStatus = {
  enabled: boolean;
  title: string;
  message: string;
};

/**
 * Public read of the maintenance status. Enforced server-side: the value
 * comes from the database on every call (60s client cache at most), never
 * from client-controlled state. Fail-closed to "not in maintenance" only
 * when the settings service itself is unreachable — the storefront stays up.
 */
export const getPublicMaintenanceStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicMaintenanceStatus> => {
    try {
      const supabase = publicClient();
      const { data, error } = await supabase
        .from("site_settings")
        .select("key,value")
        .in("key", [MAINTENANCE_ENABLED_KEY, MAINTENANCE_TITLE_KEY, MAINTENANCE_MESSAGE_KEY]);
      if (error || !data) {
        return { enabled: false, title: DEFAULT_MAINTENANCE_TITLE, message: DEFAULT_MAINTENANCE_MESSAGE };
      }
      const values: Record<string, unknown> = {};
      for (const row of data) values[row.key] = row.value;
      return {
        enabled: toBool(values[MAINTENANCE_ENABLED_KEY]),
        title: toStr(values[MAINTENANCE_TITLE_KEY], DEFAULT_MAINTENANCE_TITLE),
        message: toStr(values[MAINTENANCE_MESSAGE_KEY], DEFAULT_MAINTENANCE_MESSAGE),
      };
    } catch {
      return { enabled: false, title: DEFAULT_MAINTENANCE_TITLE, message: DEFAULT_MAINTENANCE_MESSAGE };
    }
  },
);
