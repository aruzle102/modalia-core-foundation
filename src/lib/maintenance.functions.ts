import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Json } from "@/integrations/supabase/types";

const MAINTENANCE_STATUS_KEY = "maintenance_status";

const fallbackStatus = {
  enabled: false,
  title: "We’ll be back shortly",
  message: "Modalia is currently being updated. Please check back soon.",
};

function publicClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Maintenance status is temporarily unavailable.");

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

function parseMaintenanceStatus(value: Json | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallbackStatus;

  const record = value as Record<string, unknown>;
  return {
    enabled: record.enabled === true,
    title:
      typeof record.title === "string" && record.title.trim()
        ? record.title.trim().slice(0, 160)
        : fallbackStatus.title,
    message:
      typeof record.message === "string" && record.message.trim()
        ? record.message.trim().slice(0, 1000)
        : fallbackStatus.message,
  };
}

/** Public, fail-open maintenance status read for the storefront gate. */
export const getPublicMaintenanceStatus = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { data, error } = await publicClient()
      .from("site_settings")
      .select("value")
      .eq("key", MAINTENANCE_STATUS_KEY)
      .maybeSingle();

    if (error) return fallbackStatus;
    return parseMaintenanceStatus(data?.value ?? null);
  } catch {
    return fallbackStatus;
  }
});