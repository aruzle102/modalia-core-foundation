/**
 * Minimal in-memory sliding-window rate limiter for SERVER code only.
 *
 * Server functions run in a single Node process per instance, so a Map-based
 * bucket is enough to blunt abuse of the public entry points (seller
 * applications, newsletter/contact forms, guest checkout + order tracking,
 * and the public AI/search endpoints which each fetch the whole catalog and
 * can call an external LLM provider).
 *
 * It is intentionally simple: not a distributed limiter, and it resets on
 * redeploy. Import this module only from server functions — never from
 * client components.
 */
import { getRequest } from "@tanstack/react-start/server";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

const WINDOW_SWEEP_MS = 60_000;

/** Best-effort client IP for keying buckets; "unknown" shares one coarse bucket. */
export function getClientIp(): string {
  try {
    const headers = getRequest()?.headers;
    if (!headers) return "unknown";
    const forwarded = headers.get("x-forwarded-for");
    if (forwarded) {
      const first = forwarded.split(",")[0]?.trim();
      if (first) return first;
    }
    for (const name of ["cf-connecting-ip", "x-real-ip", "x-client-ip"]) {
      const value = headers.get(name)?.trim();
      if (value) return value;
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}

function sweep(now: number) {
  if (now - lastSweep < WINDOW_SWEEP_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Throws when `limit` requests within `windowMs` have been seen for `key`.
 * Counts the current request against the limit.
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  sweep(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    throw new Error(
      `Too many requests. Please wait ${retryAfterSeconds} seconds and try again.`,
    );
  }
}

const HOUR_MS = 60 * 60_000;

/**
 * Rate-limit a named public endpoint per client IP. Call at the TOP of the
 * handler, before any expensive work (DB queries, LLM calls).
 */
export function rateLimitEndpoint(name: string, limit: number, windowMs: number = HOUR_MS): void {
  checkRateLimit(`rl:${name}:${getClientIp()}`, limit, windowMs);
}
