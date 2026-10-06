import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import type { SupportedLocale } from "@/lib/i18n";

// ============================================================================
// Login brute-force guard (V8 Section 57 — FIX #151)
// ----------------------------------------------------------------------------
// The sign-in pages call `supabase.auth.signInWithPassword` from the browser,
// so app-layer throttling needs a server-side gate: `checkLoginAllowed` must
// be awaited BEFORE `signInWithPassword` on both `/seller/login` and `/auth`.
//
// Design:
// - Rate limits attempts per (normalized identifier, client IP) pair:
//     5 attempts / 15 minutes (short window), escalating to
//     20 attempts / 60 minutes (long window — persistent attackers stay
//     blocked longer).
// - On the limit, the gate throws an error whose message is exactly
//   LOGIN_RATE_LIMIT_CODE. The login pages map it to ONE generic,
//   non-enumerating message ("Too many attempts, try again later") — the
//   same text whether or not the account exists (#150 keeps sign-in
//   failures generic, and this gate preserves that).
// - The in-memory limiter (see @/lib/rate-limit) resets on redeploy and is
//   per-instance; it blunts brute force at the app layer on top of
//   Supabase Auth's own server-side throttling of signInWithPassword.
// ============================================================================

/** Machine-readable code thrown by checkLoginAllowed when the limit is hit. */
export const LOGIN_RATE_LIMIT_CODE = "LOGIN_RATE_LIMITED";

const FIFTEEN_MINUTES_MS = 15 * 60_000;
const HOUR_MS = 60 * 60_000;

const loginInput = z.object({
  /** Email address the user typed. Normalized (trimmed + lowercased) before keying. */
  identifier: z.string().trim().min(1).max(255),
});

function bucketKey(identifier: string, ip: string, window: string): string {
  return `login-guard:${window}:${identifier}:${ip}`;
}

/**
 * checkLoginAllowed — call at the TOP of a sign-in submit, before
 * `supabase.auth.signInWithPassword`. Counts the attempt against two
 * sliding windows; throws Error(LOGIN_RATE_LIMIT_CODE) when either is
 * exhausted. The thrown message carries no account information.
 */
export const checkLoginAllowed = createServerFn({ method: "POST" })
  .inputValidator((data) => loginInput.parse(data))
  .handler(async ({ data }) => {
    const identifier = data.identifier.trim().toLowerCase();
    const ip = getClientIp();
    try {
      // Escalating: a short strict window, then a longer memory so an
      // attacker who keeps probing past the short block stays locked out
      // for the hour.
      checkRateLimit(bucketKey(identifier, ip, "short"), 5, FIFTEEN_MINUTES_MS);
      checkRateLimit(bucketKey(identifier, ip, "long"), 20, HOUR_MS);
    } catch {
      // Never leak bucket internals or retry timing — one generic code.
      throw new Error(LOGIN_RATE_LIMIT_CODE);
    }
    return { allowed: true as const };
  });

/** True when `err` is the rate-limit denial from checkLoginAllowed. */
export function isLoginRateLimitedError(err: unknown): boolean {
  return err instanceof Error && err.message.includes(LOGIN_RATE_LIMIT_CODE);
}

/**
 * Localized "too many attempts" copy, kept next to the guard so the login
 * pages stay generic without touching the i18n source files (Worker C owns
 * src/lib/i18n/*). The same strings are registered in /tmp/v8_i18n_D.json as
 * `auth.loginRateLimited` / `sellerAuth.loginRateLimited` for the coordinator
 * to merge; `resolveLoginRateLimitMessage` prefers the merged translations
 * when they exist.
 */
export const LOGIN_RATE_LIMIT_FALLBACK_MESSAGES: Record<SupportedLocale, string> = {
  en: "Too many attempts. Please try again later.",
  fr: "Trop de tentatives. Veuillez réessayer plus tard.",
  ar: "محاولات كثيرة جدًا. يُرجى المحاولة لاحقًا.",
};

export function resolveLoginRateLimitMessage(
  locale: SupportedLocale,
  mergedStrings?: Record<string, unknown> | undefined,
): string {
  const merged = mergedStrings?.["loginRateLimited"];
  if (typeof merged === "string" && merged.trim().length > 0) return merged;
  return LOGIN_RATE_LIMIT_FALLBACK_MESSAGES[locale] ?? LOGIN_RATE_LIMIT_FALLBACK_MESSAGES.en;
}
