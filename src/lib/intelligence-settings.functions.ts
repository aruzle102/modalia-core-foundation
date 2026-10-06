/**
 * Modalia Intelligence — admin control plane.
 *
 * Admin-only server functions for the Intelligence settings page.
 * Everything here is deterministic and DB-backed; there is no external AI.
 * The singleton row (id = 1) in `intelligence_settings` holds the toggles,
 * trilingual copy, and ranking weights.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";
import { assertAdmin } from "@/lib/admin-auth";

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

const LOCALES = ["ar", "fr", "en"] as const;

const trilingualSchema = z.object({
  ar: z.string().max(2000),
  fr: z.string().max(2000),
  en: z.string().max(2000),
});

const suggestedQuestionSchema = z.object({
  ar: z.string().trim().min(1).max(200),
  fr: z.string().trim().min(1).max(200),
  en: z.string().trim().min(1).max(200),
});

const rankingWeightsSchema = z.object({
  sales: z.number().min(0).max(1),
  views: z.number().min(0).max(1),
  recency: z.number().min(0).max(1),
  rating: z.number().min(0).max(1),
});

export type IntelligenceSettings = {
  support_enabled: boolean;
  smart_shopping_enabled: boolean;
  recommendations_enabled: boolean;
  welcome_message: Record<string, string>;
  suggested_questions: { ar: string; fr: string; en: string }[];
  fallback_message: Record<string, string>;
  ranking_weights: { sales: number; views: number; recency: number; rating: number };
  updated_at: string;
};

function toSettings(row: Record<string, unknown>): IntelligenceSettings {
  const tri = (v: unknown): Record<string, string> => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const r = v as Record<string, unknown>;
      return {
        ar: typeof r["ar"] === "string" ? (r["ar"] as string) : "",
        fr: typeof r["fr"] === "string" ? (r["fr"] as string) : "",
        en: typeof r["en"] === "string" ? (r["en"] as string) : "",
      };
    }
    return { ar: "", fr: "", en: "" };
  };
  const weights = (v: unknown) => {
    const d = { sales: 0.4, views: 0.3, recency: 0.2, rating: 0.1 };
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const r = v as Record<string, unknown>;
      for (const k of Object.keys(d) as (keyof typeof d)[]) {
        const n = r[k];
        if (typeof n === "number") d[k] = Math.min(1, Math.max(0, n));
      }
    }
    return d;
  };
  const rawQuestions = row["suggested_questions"];
  const questions: { ar: string; fr: string; en: string }[] = Array.isArray(rawQuestions)
    ? (rawQuestions as unknown[])
        .filter((q): q is Record<string, unknown> => !!q && typeof q === "object" && !Array.isArray(q))
        .map((q) => ({
          ar: typeof q["ar"] === "string" ? (q["ar"] as string) : "",
          fr: typeof q["fr"] === "string" ? (q["fr"] as string) : "",
          en: typeof q["en"] === "string" ? (q["en"] as string) : "",
        }))
        .filter((q) => q.ar || q.fr || q.en)
        .slice(0, 12)
    : [];
  const updatedAt = row["updated_at"];
  return {
    support_enabled: row["support_enabled"] === true,
    smart_shopping_enabled: row["smart_shopping_enabled"] === true,
    recommendations_enabled: row["recommendations_enabled"] === true,
    welcome_message: tri(row["welcome_message"]),
    suggested_questions: questions,
    fallback_message: tri(row["fallback_message"]),
    ranking_weights: weights(row["ranking_weights"]),
    updated_at: typeof updatedAt === "string" ? updatedAt : new Date().toISOString(),
  };
}

export const getIntelligenceSettings = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .validator((data) => z.object({}).parse(data))
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const sb = await adminClient();
    const { data, error } = await sb.from("intelligence_settings").select("*").eq("id", 1).maybeSingle();
    if (error) throw new Error("Could not load intelligence settings.");
    if (!data) {
      // Table exists but seed row missing (migration not yet applied) — return defaults.
      return toSettings({});
    }
    return toSettings(data as unknown as Record<string, unknown>);
  });

const updateInput = z.object({
  support_enabled: z.boolean().optional(),
  smart_shopping_enabled: z.boolean().optional(),
  recommendations_enabled: z.boolean().optional(),
  welcome_message: trilingualSchema.optional(),
  suggested_questions: z.array(suggestedQuestionSchema).max(12).optional(),
  fallback_message: trilingualSchema.optional(),
  ranking_weights: rankingWeightsSchema.optional(),
});

export const updateIntelligenceSettings = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .validator((data) => updateInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = await adminClient();

    const patch: Database["public"]["Tables"]["intelligence_settings"]["Update"] = {
      updated_at: new Date().toISOString(),
    };
    if (data.support_enabled !== undefined) patch["support_enabled"] = data.support_enabled;
    if (data.smart_shopping_enabled !== undefined) patch["smart_shopping_enabled"] = data.smart_shopping_enabled;
    if (data.recommendations_enabled !== undefined)
      patch["recommendations_enabled"] = data.recommendations_enabled;
    if (data.welcome_message) patch["welcome_message"] = data.welcome_message as unknown as Json;
    if (data.suggested_questions)
      patch["suggested_questions"] = data.suggested_questions as unknown as Json;
    if (data.fallback_message) patch["fallback_message"] = data.fallback_message as unknown as Json;
    if (data.ranking_weights) {
      const w = data.ranking_weights;
      const sum = w.sales + w.views + w.recency + w.rating;
      if (sum <= 0) throw new Error("Ranking weights must sum to more than zero.");
      // Normalize so weights always sum to 1.
      patch["ranking_weights"] = {
        sales: w.sales / sum,
        views: w.views / sum,
        recency: w.recency / sum,
        rating: w.rating / sum,
      } as unknown as Json;
    }

    const { data: row, error } = await sb
      .from("intelligence_settings")
      .update(patch)
      .eq("id", 1)
      .select("*")
      .maybeSingle();
    if (error) throw new Error("Could not save intelligence settings.");

    // Best-effort actor id for the audit log (never blocks the save).
    const actorId: string | null = null;
    await auditLog(actorId, "intelligence_settings.update", "intelligence_settings", "1", {
      fields: Object.keys(patch),
    });

    if (!row) return toSettings({});
    return toSettings(row as unknown as Record<string, unknown>);
  });

export type IntelligenceToggles = {
  support_enabled: boolean;
  smart_shopping_enabled: boolean;
  recommendations_enabled: boolean;
};

const INTELLIGENCE_TOGGLES_DEFAULT: IntelligenceToggles = {
  support_enabled: true,
  smart_shopping_enabled: true,
  recommendations_enabled: true,
};

/**
 * Server-side read of the intelligence feature toggles (V8 #177).
 *
 * Reads via the admin client — `intelligence_settings` is admin-only under
 * RLS by design, so the public client cannot see it. Used to GATE server
 * functions (aiChat, getRecommendations): client-side hiding is not enough,
 * the endpoints themselves must refuse when a toggle is off.
 *
 * Fail-open to `true` (matching the public config defaults) so a transient
 * DB error never hard-disables storefront features.
 */
export async function readIntelligenceToggles(): Promise<IntelligenceToggles> {
  try {
    const sb = await adminClient();
    const { data, error } = await sb
      .from("intelligence_settings")
      .select("support_enabled, smart_shopping_enabled, recommendations_enabled")
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) return { ...INTELLIGENCE_TOGGLES_DEFAULT };
    const r = data as unknown as Record<string, unknown>;
    return {
      support_enabled: r["support_enabled"] === true,
      smart_shopping_enabled: r["smart_shopping_enabled"] === true,
      recommendations_enabled: r["recommendations_enabled"] !== false,
    };
  } catch {
    return { ...INTELLIGENCE_TOGGLES_DEFAULT };
  }
}

/**
 * Public (storefront) read of the assistant-facing copy + toggles.
 * Only exposes what the chat UI needs — never ranking weights internals.
 */
export const getPublicIntelligenceConfig = createServerFn({ method: "GET" })
  .validator((data) => z.object({ locale: z.enum(LOCALES) }).parse(data))
  .handler(async ({ data }) => {
    const sb = await adminClient();
    const { data: row, error } = await sb
      .from("intelligence_settings")
      .select("support_enabled, smart_shopping_enabled, recommendations_enabled, welcome_message, suggested_questions, fallback_message")
      .eq("id", 1)
      .maybeSingle();
    if (error || !row) {
      return {
        support_enabled: true,
        smart_shopping_enabled: true,
        recommendations_enabled: true,
        welcome_message: "",
        suggested_questions: [] as string[],
        fallback_message: "",
      };
    }
    const r = row as unknown as Record<string, unknown>;
    const pick = (v: unknown): string => {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const rec = v as Record<string, unknown>;
        const t = rec[data.locale] ?? rec["en"] ?? rec["fr"] ?? rec["ar"];
        return typeof t === "string" ? t : "";
      }
      return "";
    };
    const rawQ = r["suggested_questions"];
    const questions = Array.isArray(rawQ)
      ? (rawQ as unknown[])
          .map((q) => {
            if (q && typeof q === "object") {
              const rec = q as Record<string, unknown>;
              const t = rec[data.locale] ?? rec["en"] ?? rec["fr"] ?? rec["ar"];
              return typeof t === "string" ? t : "";
            }
            return "";
          })
          .filter(Boolean)
          .slice(0, 8)
      : [];
    return {
      support_enabled: r["support_enabled"] === true,
      smart_shopping_enabled: r["smart_shopping_enabled"] === true,
      recommendations_enabled: r["recommendations_enabled"] !== false,
      welcome_message: pick(r["welcome_message"]),
      suggested_questions: questions,
      fallback_message: pick(r["fallback_message"]),
    };
  });
