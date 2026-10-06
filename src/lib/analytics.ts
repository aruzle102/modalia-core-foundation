/**
 * Lightweight, privacy-respecting analytics for Modalia.
 *
 * Sacred rule: never fabricate metrics. This module only records genuine
 * storefront interactions and ships them to the `trackAnalyticsEvents` server
 * function, which persists them via the SECURITY DEFINER
 * `track_analytics_event()` RPC. There is no direct client write to the
 * analytics tables.
 *
 * Privacy:
 *  - Anonymous visitor id is a random UUID kept in localStorage (first-party
 *    only). No third-party tracking cookies, ever.
 *  - `navigator.doNotTrack` (and equivalents) is honored: when DNT is on,
 *    nothing is recorded or sent.
 *  - Collection can additionally be disabled platform-wide from Admin >
 *    site settings (`analytics_enabled`); the server function enforces it.
 *  - Tracking is fire-and-forget and batched so it never blocks commerce.
 */
import { trackAnalyticsEvents } from "@/lib/analytics.functions";

export type AnalyticsEventType =
  | "page_view"
  | "product_view"
  | "search"
  | "category_view"
  | "add_to_cart"
  | "wishlist_add"
  | "checkout_started"
  | "checkout_completed"
  | "purchase"
  | "store_view";

export type AnalyticsEntityType = "product" | "category" | "store" | "order";

export interface TrackData {
  entityType?: AnalyticsEntityType | undefined;
  entityId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

const ANON_KEY = "modalia-anon-id";
const RECENT_KEY = "modalia-recently-viewed";
const MAX_RECENT = 12;
const FLUSH_INTERVAL_MS = 5000;
const FLUSH_MAX_BATCH = 25;

/** True when the visitor asked not to be tracked. */
export function isDoNotTrack(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return true;
  const nav = navigator as Navigator & { msDoNotTrack?: string };
  const w = window as Window & { doNotTrack?: string };
  return (
    navigator.doNotTrack === "1" ||
    w.doNotTrack === "1" ||
    nav.msDoNotTrack === "1"
  );
}

/**
 * Stable anonymous visitor id (first-party localStorage only).
 * Returns null on the server or when DNT is enabled.
 */
export function getAnonId(): string | null {
  if (typeof window === "undefined") return null;
  if (isDoNotTrack()) return null;
  try {
    let id = localStorage.getItem(ANON_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(ANON_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

interface QueuedEvent {
  eventType: AnalyticsEventType;
  entityType?: AnalyticsEntityType | undefined;
  entityId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

let queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
/** Minute-bucket dedupe so one logical view is counted once even if an effect fires twice. */
const seenBuckets = new Set<string>();

function bucketKey(e: QueuedEvent): string {
  const minute = Math.floor(Date.now() / 60000);
  return `${e.eventType}:${e.entityType ?? ""}:${e.entityId ?? ""}:${minute}`;
}

function scheduleFlush() {
  if (typeof window === "undefined") return;
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushQueue();
  }, FLUSH_INTERVAL_MS);
}

async function flushQueue(): Promise<void> {
  if (queue.length === 0) return;
  const anonId = getAnonId();
  if (!anonId) {
    queue = [];
    return;
  }
  const batch = queue.splice(0, FLUSH_MAX_BATCH);
  try {
    await trackAnalyticsEvents({
      data: {
        events: batch.map((e) => ({
          anonId,
          eventType: e.eventType,
          entityType: e.entityType,
          entityId: e.entityId,
          metadata: e.metadata,
        })),
      },
    });
  } catch {
    /* Analytics must never break commerce; dropped batches are simply lost. */
  }
  if (queue.length > 0) scheduleFlush();
}

if (typeof window !== "undefined") {
  // Best-effort final flush when the page is being torn down.
  window.addEventListener("pagehide", () => {
    void flushQueue();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flushQueue();
  });
}

/**
 * Record a genuine storefront interaction. Fire-and-forget: events are
 * batched and sent in the background; failures are silently dropped so
 * tracking can never break shopping.
 */
export function track(eventType: AnalyticsEventType, data: TrackData = {}): void {
  if (typeof window === "undefined") return;
  if (isDoNotTrack()) return;
  const queued: QueuedEvent = {
    eventType,
    entityType: data.entityType,
    entityId: data.entityId,
    metadata: data.metadata,
  };
  const key = bucketKey(queued);
  if (seenBuckets.has(key)) return;
  seenBuckets.add(key);
  // Keep the dedupe set small.
  if (seenBuckets.size > 2000) seenBuckets.clear();
  queue.push(queued);
  if (queue.length >= FLUSH_MAX_BATCH) {
    void flushQueue();
  } else {
    scheduleFlush();
  }
}

/* ------------------------- recently viewed (local) ------------------------ */

export interface RecentProduct {
  id: string;
  slug: string;
  name: string;
  image: string | null;
  price: number;
  categorySlug?: string | undefined;
}

/** Record a product view locally for the "Recently viewed" rail. No network. */
export function recordRecentlyViewed(item: RecentProduct): void {
  if (typeof window === "undefined") return;
  try {
    const current = getRecentlyViewed().filter((p) => p.id !== item.id);
    current.unshift(item);
    localStorage.setItem(RECENT_KEY, JSON.stringify(current.slice(0, MAX_RECENT)));
  } catch {
    /* Local-only feature; ignore storage failures. */
  }
}

export function getRecentlyViewed(): RecentProduct[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (p): p is RecentProduct =>
          !!p && typeof p.id === "string" && typeof p.slug === "string" && typeof p.name === "string",
      )
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

/* ----------------- legacy discovery events (compatibility) ---------------- */

/**
 * Backwards-compatible wrapper for the pre-analytics discovery tracker.
 * Routes through the new event pipeline instead of writing to
 * `discovery_events` directly.
 */
export async function trackDiscovery(
  eventKind: "product_view" | "category_view" | "search" | "wishlist" | "cart",
  payload: { productId?: string; categoryId?: string; query?: string; metadata?: Record<string, unknown> } = {},
): Promise<void> {
  switch (eventKind) {
    case "product_view":
      track("product_view", {
        entityType: "product",
        entityId: payload.productId,
        metadata: payload.metadata,
      });
      break;
    case "category_view":
      track("category_view", {
        entityType: "category",
        entityId: payload.categoryId,
        metadata: payload.metadata,
      });
      break;
    case "search":
      track("search", {
        metadata: { ...(payload.metadata ?? {}), ...(payload.query ? { query: payload.query } : {}) },
      });
      break;
    case "wishlist":
      track("wishlist_add", {
        entityType: "product",
        entityId: payload.productId,
        metadata: payload.metadata,
      });
      break;
    case "cart":
      track("add_to_cart", {
        entityType: "product",
        entityId: payload.productId,
        metadata: payload.metadata,
      });
      break;
  }
}
