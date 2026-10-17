/**
 * MODALIA — Centralized Email Configuration
 *
 * All email sending uses these settings. No hardcoded addresses or URLs
 * elsewhere in the codebase.
 */

function env(name: string): string | undefined {
  // Server: process.env — Browser: import.meta.env
  if (typeof process !== "undefined" && process.env?.[name]) return process.env[name];
  try {
    const meta = (import.meta as unknown as { env?: Record<string, string> }).env;
    if (meta?.[name]) return meta[name];
  } catch { /* ignore */ }
  return undefined;
}

export const emailConfig = {
  /** Verified sender domain */
  senderDomain: "modaliadz.com",
  /** Default From address (verified in Resend) */
  defaultFrom: env("EMAIL_FROM") ?? "info@modaliadz.com",
  /** Resend API key (server-side only — never expose to browser) */
  get resendApiKey(): string | undefined {
    return env("RESEND_API_KEY");
  },
  /** Public site URL for links (unsubscribe, etc.) */
  siteUrl: env("SITE_URL") ?? "https://modaliadz.com",
  /** Resend API endpoint */
  resendApiUrl: "https://api.resend.com/emails",
} as const;

/** Build a standard From header */
export function getFromAddress(customFrom?: string): string {
  return customFrom ?? emailConfig.defaultFrom;
}
