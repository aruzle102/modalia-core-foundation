import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { platformConfig } from "@/config/platform";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Public engagement entry points (newsletter + contact form).
 * Like seller applications, these accept anonymous input with strict
 * validation; inserts are public, reads stay admin-only via RLS.
 */
function publicClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("This service is temporarily unavailable.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`)
          headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

const localeSchema = z.enum(platformConfig.market.languages).optional();

const newsletterInput = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  locale: localeSchema,
});

export const subscribeNewsletter = createServerFn({ method: "POST" })
  .inputValidator((data) => newsletterInput.parse(data))
  .handler(async ({ data }) => {
    const supabase = publicClient();
    const { error } = await supabase.from("newsletter_subscribers").upsert(
      {
        email: data.email,
        locale: data.locale ?? platformConfig.market.defaultLanguage,
        subscribed_at: new Date().toISOString(),
      },
      { onConflict: "email", ignoreDuplicates: true },
    );
    if (error) throw new Error("Your subscription could not be saved. Please try again.");
    return { ok: true };
  });

const contactInput = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(255),
  phone: z.string().trim().max(32).optional(),
  subject: z.string().trim().min(2).max(160),
  message: z.string().trim().min(10).max(4000),
  locale: localeSchema,
});

export const submitContactMessage = createServerFn({ method: "POST" })
  .inputValidator((data) => contactInput.parse(data))
  .handler(async ({ data }) => {
    const supabase = publicClient();
    const { error } = await supabase.from("contact_messages").insert({
      name: data.name,
      email: data.email,
      phone: data.phone || null,
      subject: data.subject,
      message: data.message,
      locale: data.locale ?? platformConfig.market.defaultLanguage,
      status: "new",
    });
    if (error) throw new Error("Your message could not be sent. Please try again.");
    return { ok: true };
  });

/** Whitelisted site-settings keys editable from the admin panel. */
export const siteSettingKeys = [
  "contact_email",
  "contact_phone",
  "contact_address",
  "contact_hours",
  "instagram_url",
  "facebook_url",
  "tiktok_url",
  "whatsapp_number",
] as const;

export type SiteSettingKey = (typeof siteSettingKeys)[number];

/** Public read of the storefront's site settings (contact info, social links…). */
export const getSiteSettings = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = publicClient();
  const { data, error } = await supabase
    .from("site_settings")
    .select("key, value")
    .in("key", [...siteSettingKeys]);
  if (error) throw new Error("Settings are temporarily unavailable.");
  const settings: Record<SiteSettingKey, string> = Object.fromEntries(
    siteSettingKeys.map((key) => [key, ""]),
  ) as Record<SiteSettingKey, string>;
  for (const row of data ?? []) {
    if (siteSettingKeys.includes(row.key as SiteSettingKey))
      settings[row.key as SiteSettingKey] = row.value ?? "";
  }
  return { settings };
});

const settingsInput = z.object({
  settings: z
    .record(z.string(), z.string().trim().max(500))
    .refine(
      (settings) =>
        Object.keys(settings).every((key) => (siteSettingKeys as readonly string[]).includes(key)),
      {
        message: "Unknown setting key.",
      },
    ),
});

const adminOnly = [requireSupabaseAuth] as const;

type SupabaseRpc = (fn: string) => Promise<{ data: unknown; error: unknown }>;

async function assertAdmin(context: unknown) {
  const supabase = (context as { supabase?: { rpc?: SupabaseRpc } } | null | undefined)?.supabase;
  if (!supabase?.rpc) throw new Error("Unauthorized");
  const { data, error } = await supabase.rpc("is_super_admin");
  if (error || data !== true) throw new Error("Forbidden");
}

/** Admin-only write of site settings. */
export const updateSiteSettings = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) => settingsInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const rows = Object.entries(data.settings).map(([key, value]) => ({
      key,
      value,
      updated_at: new Date().toISOString(),
    }));
    if (!rows.length) return { ok: true };
    const { error } = await context.supabase
      .from("site_settings")
      .upsert(rows, { onConflict: "key" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
