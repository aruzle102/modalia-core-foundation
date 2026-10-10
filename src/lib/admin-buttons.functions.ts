import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { assertAdmin } from "@/lib/admin-auth";
import { assertAdminPermission } from "@/lib/admin-permissions";
import { rateLimitEndpoint } from "@/lib/rate-limit";

const adminOnly = [requireSupabaseAuth] as const;

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function auditLog(
  actorId: string | null,
  action: string,
  resource: string,
  resourceId: string | null,
  metadata: Record<string, Json> = {},
) {
  try {
    const sb = await adminClient();
    await sb.from("audit_logs").insert({
      actor_id: actorId,
      action,
      resource,
      resource_id: resourceId,
      metadata,
    });
  } catch {
    // Audit logging must never block the underlying mutation.
  }
}

/**
 * Centralized button/CTA control.
 * Only safe predefined actions are allowed — no arbitrary JavaScript.
 */
export const ACTION_TYPES = [
  "link_internal",
  "link_external",
  "link_category",
  "link_store",
  "link_collection",
  "link_product",
] as const;

export const PLACEMENTS = [
  "hero_primary",
  "hero_secondary",
  "header",
  "footer",
  "category_cta",
  "product_cta",
  "banner_cta",
] as const;

export const BUTTON_STYLES = ["primary", "secondary", "ghost", "link"] as const;

const buttonInput = z.object({
  label: z.string().trim().min(1).max(60),
  action_type: z.enum(ACTION_TYPES),
  destination: z.string().trim().min(1).max(500),
  placement: z.enum(PLACEMENTS),
  style: z.enum(BUTTON_STYLES).default("primary"),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().min(0).max(9999).default(0),
  locale: z.enum(["ar", "fr", "en"]).nullable().default(null),
});

function validateDestination(actionType: string, destination: string): string | null {
  if (actionType === "link_internal") {
    if (!destination.startsWith("/")) return "Internal links must start with /.";
    if (/^javascript:/i.test(destination)) return "Invalid destination.";
    return null;
  }
  if (actionType === "link_external") {
    if (!/^https:\/\//i.test(destination)) return "External links must use https://.";
    return null;
  }
  if (/[\s<>\"']/.test(destination)) return "Invalid destination.";
  if (/^javascript:/i.test(destination)) return "Invalid destination.";
  return null;
}

export type SiteButton = {
  id: string;
  label: string;
  action_type: (typeof ACTION_TYPES)[number];
  destination: string;
  placement: (typeof PLACEMENTS)[number];
  style: (typeof BUTTON_STYLES)[number];
  is_active: boolean;
  sort_order: number;
  locale: string | null;
};

export type PublicSiteButton = {
  label: string;
  action_type: (typeof ACTION_TYPES)[number];
  destination: string;
  placement: (typeof PLACEMENTS)[number];
  style: (typeof BUTTON_STYLES)[number];
  locale: string | null;
};

/**
 * Public read of ACTIVE site buttons for one placement (Section 60).
 * No auth — the storefront renders these. Reads via the service-role client
 * because RLS is admin-only, but selects ONLY the public columns (no ids,
 * no timestamps). Destinations are re-validated at render time.
 */
export const getPublicSiteButtons = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ placement: z.enum(PLACEMENTS) }).parse(data))
  .handler(async ({ data }) => {
    rateLimitEndpoint("getPublicSiteButtons", 120);
    const supabaseAdmin = await adminClient();
    const { data: rows, error } = await supabaseAdmin
      .from("site_buttons")
      .select("label,action_type,destination,placement,style,sort_order,locale,created_at")
      .eq("is_active", true)
      .eq("placement", data.placement)
      .order("sort_order")
      .order("created_at");
    if (error) throw new Error("Buttons are temporarily unavailable.");
    return {
      buttons: ((rows ?? []) as Array<Record<string, unknown>>)
        .filter(
          (row) =>
            typeof row["label"] === "string" &&
            typeof row["destination"] === "string" &&
            (ACTION_TYPES as readonly string[]).includes(row["action_type"] as string),
        )
        .map(
          (row): PublicSiteButton => ({
            label: row["label"] as string,
            action_type: row["action_type"] as PublicSiteButton["action_type"],
            destination: row["destination"] as string,
            placement: row["placement"] as PublicSiteButton["placement"],
            style: (BUTTON_STYLES as readonly string[]).includes(row["style"] as string)
              ? (row["style"] as PublicSiteButton["style"])
              : "primary",
            locale:
              row["locale"] === "ar" || row["locale"] === "fr" || row["locale"] === "en"
                ? (row["locale"] as string)
                : null,
          }),
        ),
    };
  });

export const listSiteButtons = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) => z.object({ placement: z.enum(PLACEMENTS).optional() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdminPermission(context, "content.manage");
    const supabaseAdmin = await adminClient();
    let q = supabaseAdmin.from("site_buttons").select("*").order("sort_order").order("created_at");
    if (data.placement) q = q.eq("placement", data.placement);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { buttons: (rows ?? []) as SiteButton[] };
  });

export const createSiteButton = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) => buttonInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdminPermission(context, "content.manage");
    const err = validateDestination(data.action_type, data.destination);
    if (err) throw new Error(err);
    const supabaseAdmin = await adminClient();
    const { data: row, error } = await supabaseAdmin
      .from("site_buttons")
      .insert({ ...data })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await auditLog(
      (context as { userId?: string }).userId ?? null,
      "site_button_created",
      "site_button",
      row.id,
      { label: data.label, placement: data.placement },
    );
    return { id: row.id };
  });

export const updateSiteButton = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) => buttonInput.partial().extend({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdminPermission(context, "content.manage");
    const { id, ...patch } = data;
    const supabaseAdmin = await adminClient();
    if (patch.action_type || patch.destination) {
      const { data: current } = await supabaseAdmin
        .from("site_buttons")
        .select("action_type,destination")
        .eq("id", id)
        .single();
      const actionType = patch.action_type ?? current?.action_type ?? "";
      const destination = patch.destination ?? current?.destination ?? "";
      const err = validateDestination(actionType, destination);
      if (err) throw new Error(err);
    }
    const updateData: {
      label?: string;
      action_type?: string;
      destination?: string;
      placement?: string;
      style?: string;
      is_active?: boolean;
      sort_order?: number;
      locale?: string | null;
      updated_at: string;
    } = { updated_at: new Date().toISOString() };
    if (patch.label !== undefined) updateData.label = patch.label;
    if (patch.action_type !== undefined) updateData.action_type = patch.action_type;
    if (patch.destination !== undefined) updateData.destination = patch.destination;
    if (patch.placement !== undefined) updateData.placement = patch.placement;
    if (patch.style !== undefined) updateData.style = patch.style;
    if (patch.is_active !== undefined) updateData.is_active = patch.is_active;
    if (patch.sort_order !== undefined) updateData.sort_order = patch.sort_order;
    if (patch.locale !== undefined) updateData.locale = patch.locale;
    const { error } = await supabaseAdmin
      .from("site_buttons")
      .update(updateData)
      .eq("id", id);
    if (error) throw new Error(error.message);
    await auditLog(
      (context as { userId?: string }).userId ?? null,
      "site_button_updated",
      "site_button",
      id,
      { patch: Object.keys(patch) },
    );
    return { ok: true };
  });

export const deleteSiteButton = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdminPermission(context, "content.manage");
    const supabaseAdmin = await adminClient();
    const { error } = await supabaseAdmin.from("site_buttons").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await auditLog(
      (context as { userId?: string }).userId ?? null,
      "site_button_deleted",
      "site_button",
      data.id,
    );
    return { ok: true };
  });
