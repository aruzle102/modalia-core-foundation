import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin-auth";
import type { Database, Json } from "@/integrations/supabase/types";

/**
 * Homepage builder backend (admin-only).
 *
 * This module touches ONLY the `homepage_sections` table. The storefront reads
 * sections through `getDiscoveryData` in catalog.functions.ts (section_key,
 * kind, title, subtitle, content, ordered by sort_order, enabled-only) — that
 * file is deliberately left untouched.
 */

const adminOnly = [requireSupabaseAuth] as const;

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type JsonRecord = Record<string, Json>;

async function auditLog(
  actorId: string | null,
  action: string,
  resourceId: string | null,
  metadata: JsonRecord = {},
) {
  try {
    const supabaseAdmin = await adminClient();
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: actorId,
      action,
      resource: "homepage_section",
      resource_id: resourceId,
      metadata,
    });
  } catch {
    // Audit logging must never block the underlying mutation.
  }
}

export const HOMEPAGE_KINDS = [
  "hero",
  "categories",
  "trending",
  "best_sellers",
  "new_arrivals",
  "flash_sale",
  "stores",
  "recommendations",
  "editorial",
  "blog",
  "app_banner",
] as const;

export type HomepageKind = (typeof HOMEPAGE_KINDS)[number];

const kindSchema = z.enum(HOMEPAGE_KINDS);

const localizedTextSchema = z.record(z.string(), z.string()).nullable();
const jsonObjectSchema = z.record(z.string(), z.unknown());

export interface HomepageSection {
  id: string;
  section_key: string;
  kind: HomepageKind;
  title: Json | null;
  subtitle: Json | null;
  content: Json;
  animation: Json;
  enabled: boolean;
  sort_order: number;
  starts_at: string | null;
  ends_at: string | null;
}

const SECTION_COLUMNS =
  "id,section_key,kind,title,subtitle,content,animation,enabled,sort_order,starts_at,ends_at";

/** Careful merge for localized jsonb columns (title / subtitle). */
function mergeLocalized(
  existing: unknown,
  patch: Record<string, string> | null | undefined,
): Json | null | undefined {
  if (patch === undefined) return undefined; // leave untouched
  if (patch === null) return null; // explicitly cleared
  const base: Record<string, string> = {};
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    for (const [key, value] of Object.entries(existing as Record<string, unknown>)) {
      if (typeof value === "string") base[key] = value;
    }
  } else if (typeof existing === "string" && existing.trim()) {
    // Graceful migration for any legacy plain-string value.
    base["en"] = existing;
  }
  return { ...base, ...patch };
}

/** Careful merge for free-form jsonb columns (content / animation). */
function mergeContent(
  existing: unknown,
  patch: Record<string, unknown> | undefined,
): Json | undefined {
  if (patch === undefined) return undefined; // leave untouched
  const base: Record<string, unknown> =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  return { ...base, ...patch } as Json;
}

function toIsoOrNull(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined; // leave untouched
  if (value === null) return null; // explicitly cleared
  const trimmed = value.trim();
  if (!trimmed) return null;
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) throw new Error("Invalid date/time value.");
  return new Date(ms).toISOString();
}

async function maxSortOrder(): Promise<number> {
  const supabaseAdmin = await adminClient();
  const { data, error } = await supabaseAdmin
    .from("homepage_sections")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return typeof data?.sort_order === "number" ? data.sort_order : -1;
}

export const getHomepageSections = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("homepage_sections")
      .select(SECTION_COLUMNS)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { sections: (data ?? []) as HomepageSection[] };
  });

export const reorderHomepageSections = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) =>
    z
      .object({ orderedIds: z.array(z.string().uuid()).min(1).max(200) })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (new Set(data.orderedIds).size !== data.orderedIds.length) {
      throw new Error("Duplicate section ids in the new order.");
    }
    const supabaseAdmin = await adminClient();
    const now = new Date().toISOString();
    for (let index = 0; index < data.orderedIds.length; index += 1) {
      const sectionId = data.orderedIds[index];
      if (!sectionId) throw new Error("Duplicate section ids in the new order.");
      const { error } = await supabaseAdmin
        .from("homepage_sections")
        .update({ sort_order: index, updated_at: now })
        .eq("id", sectionId);
      if (error) throw new Error(error.message);
    }
    await auditLog(context.userId ?? null, "homepage_sections_reordered", null, {
      count: data.orderedIds.length,
    });
    return { ok: true as const, count: data.orderedIds.length };
  });

const updatePatchSchema = z
  .object({
    title: localizedTextSchema.optional(),
    subtitle: localizedTextSchema.optional(),
    content: jsonObjectSchema.optional(),
    animation: jsonObjectSchema.optional(),
    starts_at: z.string().nullable().optional(),
    ends_at: z.string().nullable().optional(),
    enabled: z.boolean().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, { message: "Nothing to update." });

export const updateHomepageContent = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) =>
    z
      .object({ sectionId: z.string().uuid(), patch: updatePatchSchema })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await adminClient();
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("homepage_sections")
      .select("id,section_key,title,subtitle,content,animation")
      .eq("id", data.sectionId)
      .maybeSingle();
    if (fetchError) throw new Error(fetchError.message);
    if (!existing) throw new Error("Section not found.");

    // Careful merge: sort_order is never touched here (use reorderHomepageSections).
    const update: Database["public"]["Tables"]["homepage_sections"]["Update"] = {
      updated_at: new Date().toISOString(),
    };
    const title = mergeLocalized(existing.title, data.patch.title ?? undefined);
    if (title !== undefined) update.title = title;
    const subtitle = mergeLocalized(existing.subtitle, data.patch.subtitle ?? undefined);
    if (subtitle !== undefined) update.subtitle = subtitle;
    const content = mergeContent(existing.content, data.patch.content);
    if (content !== undefined) update.content = content;
    const animation = mergeContent(existing.animation, data.patch.animation);
    if (animation !== undefined) update.animation = animation;
    const startsAt = toIsoOrNull(data.patch.starts_at);
    if (startsAt !== undefined) update.starts_at = startsAt;
    const endsAt = toIsoOrNull(data.patch.ends_at);
    if (endsAt !== undefined) update.ends_at = endsAt;
    if (data.patch.enabled !== undefined) update.enabled = data.patch.enabled;

    const { data: updated, error } = await supabaseAdmin
      .from("homepage_sections")
      .update(update)
      .eq("id", data.sectionId)
      .select(SECTION_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    await auditLog(context.userId ?? null, "homepage_section_content_updated", data.sectionId, {
      section_key: existing.section_key,
      fields: Object.keys(data.patch),
    });
    return { section: updated as HomepageSection };
  });

const sectionKeySchema = z
  .string()
  .trim()
  .min(3, "Key must be at least 3 characters.")
  .max(60, "Key must be at most 60 characters.")
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/, "Use lowercase letters, numbers, dashes or underscores.");

export const createHomepageSection = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) =>
    z
      .object({
        kind: kindSchema,
        section_key: sectionKeySchema,
        title: localizedTextSchema.optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await adminClient();
    const sortOrder = (await maxSortOrder()) + 1;
    const { data: created, error } = await supabaseAdmin
      .from("homepage_sections")
      .insert({
        kind: data.kind,
        section_key: data.section_key,
        title: data.title ?? null,
        subtitle: null,
        content: {},
        animation: {},
        enabled: true,
        sort_order: sortOrder,
        starts_at: null,
        ends_at: null,
      })
      .select(SECTION_COLUMNS)
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("A section with this key already exists.");
      throw new Error(error.message);
    }
    await auditLog(context.userId ?? null, "homepage_section_created", created.id, {
      section_key: data.section_key,
      kind: data.kind,
    });
    return { section: created as HomepageSection };
  });

export const duplicateHomepageSection = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) => z.object({ sectionId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await adminClient();
    const { data: source, error: fetchError } = await supabaseAdmin
      .from("homepage_sections")
      .select("section_key,kind,title,subtitle,content,animation,starts_at,ends_at")
      .eq("id", data.sectionId)
      .maybeSingle();
    if (fetchError) throw new Error(fetchError.message);
    if (!source) throw new Error("Section not found.");

    // Find a free copy key: "<key>-copy", "<key>-copy-2", ...
    const { data: siblings } = await supabaseAdmin
      .from("homepage_sections")
      .select("section_key")
      .like("section_key", `${source.section_key}-copy%`);
    const taken = new Set((siblings ?? []).map((row) => row.section_key));
    let copyKey = `${source.section_key}-copy`;
    let attempt = 2;
    while (taken.has(copyKey)) {
      copyKey = `${source.section_key}-copy-${attempt}`;
      attempt += 1;
    }

    const sortOrder = (await maxSortOrder()) + 1;
    const { data: created, error } = await supabaseAdmin
      .from("homepage_sections")
      .insert({
        kind: source.kind,
        section_key: copyKey,
        title: source.title,
        subtitle: source.subtitle,
        content: source.content ?? {},
        animation: source.animation ?? {},
        // Duplicates start disabled so the live homepage is never surprised.
        enabled: false,
        sort_order: sortOrder,
        starts_at: source.starts_at,
        ends_at: source.ends_at,
      })
      .select(SECTION_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    await auditLog(context.userId ?? null, "homepage_section_duplicated", created.id, {
      source_section_id: data.sectionId,
      section_key: copyKey,
    });
    return { section: created as HomepageSection };
  });

export const deleteHomepageSection = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) => z.object({ sectionId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await adminClient();
    const { data: target, error: fetchError } = await supabaseAdmin
      .from("homepage_sections")
      .select("id,section_key,kind")
      .eq("id", data.sectionId)
      .maybeSingle();
    if (fetchError) throw new Error(fetchError.message);
    if (!target) throw new Error("Section not found.");

    // Protection: never delete the last remaining section of its kind.
    const { count, error: countError } = await supabaseAdmin
      .from("homepage_sections")
      .select("id", { count: "exact", head: true })
      .eq("kind", target.kind);
    if (countError) throw new Error(countError.message);
    if ((count ?? 0) <= 1) {
      throw new Error(
        `Cannot delete the only "${target.kind}" section. Add another one of the same kind first.`,
      );
    }

    const { error } = await supabaseAdmin
      .from("homepage_sections")
      .delete()
      .eq("id", data.sectionId);
    if (error) throw new Error(error.message);
    await auditLog(context.userId ?? null, "homepage_section_deleted", data.sectionId, {
      section_key: target.section_key,
      kind: target.kind,
    });
    return { ok: true as const };
  });
