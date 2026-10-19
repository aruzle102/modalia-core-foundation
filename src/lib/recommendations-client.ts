/**
 * Client-side recommendation signals + rule-based "Recommandé pour vous".
 *
 * This is intentionally NOT an AI model — it is a transparent, rule-based
 * scorer over product/category/seller affinities derived from the shopper's
 * own interactions. Never claims otherwise.
 *
 * Signals tracked (localStorage only, guests and signed-in alike):
 *  - viewed products ......... product detail visits (id, category, seller, brand)
 *  - wishlisted products ..... add/remove (persists until removed)
 *  - browsed categories ...... category page / filter visits (slug → count)
 *  - cart additions .......... product added to cart (id, seller)
 *
 * Privacy: only product ids, category slugs, store ids/names and brand slugs
 * are stored — no personal data, no account linkage. `clearRecommendationData()`
 * wipes everything; shoppers can also clear site data in the browser.
 *
 * Scoring (per candidate product, summed over all signals):
 *  - same category as a signal product ......... +3
 *  - same seller as a signal product ........... +2
 *  - same brand as a signal product ............ +1
 *  - browsed-category affinity ................. +min(visits, 5)
 *
 * Already-viewed and in-cart products are excluded (no "purchased" history is
 * available client-side; the server engine can additionally exclude via
 * `excludeIds` when this is wired to `getRecommendations`).
 *
 * Fallback (no signals, or no signal matches): diverse + recent — in-stock
 * products interleaved round-robin across sellers, newest first. Never empty
 * when sellable products exist, never fabricated.
 */

import { useEffect, useMemo, useState } from "react";
import type { CatalogProduct } from "@/lib/catalog.functions";
import { getRotationSeed, mulberry32, sellerKeyOf } from "@/lib/rotation";

const SIGNALS_KEY = "modalia-rec-signals-v1";
const MAX_VIEWS = 60;
const MAX_CATEGORY_COUNT = 999;

export type SignalProduct = {
  id: string;
  categorySlug?: string | null;
  storeId?: string | null;
  storeName?: string | null;
  brandSlug?: string | null;
  ts: number;
};

export type RecSignals = {
  /** Latest-first, deduplicated by id, capped at MAX_VIEWS. */
  views: SignalProduct[];
  /** productId → signal. Removed on wishlist-remove. */
  wishlist: Record<string, SignalProduct>;
  /** categorySlug → browse count. */
  categories: Record<string, number>;
  /** productId → signal (added to cart). */
  cart: Record<string, SignalProduct>;
};

const EMPTY_SIGNALS: RecSignals = { views: [], wishlist: {}, categories: {}, cart: {} };

function isClient(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normalizeSlug(slug: string | null | undefined): string | null {
  const s = (slug ?? "").trim().toLowerCase();
  return s.length > 0 ? s : null;
}

function readSignals(): RecSignals {
  if (!isClient()) return { ...EMPTY_SIGNALS, views: [] };
  try {
    const raw = window.localStorage.getItem(SIGNALS_KEY);
    if (!raw) return { views: [], wishlist: {}, categories: {}, cart: {} };
    const parsed = JSON.parse(raw) as Partial<RecSignals>;
    return {
      views: Array.isArray(parsed.views) ? parsed.views.slice(0, MAX_VIEWS) : [],
      wishlist: parsed.wishlist && typeof parsed.wishlist === "object" ? parsed.wishlist : {},
      categories:
        parsed.categories && typeof parsed.categories === "object" ? parsed.categories : {},
      cart: parsed.cart && typeof parsed.cart === "object" ? parsed.cart : {},
    };
  } catch {
    return { views: [], wishlist: {}, categories: {}, cart: {} };
  }
}

function writeSignals(signals: RecSignals): void {
  if (!isClient()) return;
  try {
    window.localStorage.setItem(SIGNALS_KEY, JSON.stringify(signals));
  } catch {
    /* storage full/blocked — signals are best-effort */
  }
}

function toSignal(input: {
  id: string;
  categorySlug?: string | null;
  storeId?: string | null;
  storeName?: string | null;
  brandSlug?: string | null;
}): SignalProduct {
  return {
    id: input.id,
    categorySlug: normalizeSlug(input.categorySlug),
    storeId: input.storeId ?? null,
    storeName: (input.storeName ?? "").trim() || null,
    brandSlug: normalizeSlug(input.brandSlug),
    ts: Date.now(),
  };
}

/** Public read (debugging, server-engine wiring). Returns a copy. */
export function getRecommendationSignals(): RecSignals {
  const s = readSignals();
  return {
    views: [...s.views],
    wishlist: { ...s.wishlist },
    categories: { ...s.categories },
    cart: { ...s.cart },
  };
}

export function hasRecommendationData(): boolean {
  const s = readSignals();
  return (
    s.views.length > 0 ||
    Object.keys(s.wishlist).length > 0 ||
    Object.keys(s.categories).length > 0 ||
    Object.keys(s.cart).length > 0
  );
}

/** Wipe all recommendation signals. The honest "reset my recommendations". */
export function clearRecommendationData(): void {
  if (!isClient()) return;
  try {
    window.localStorage.removeItem(SIGNALS_KEY);
  } catch {
    /* noop */
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("recommendations-change"));
  }
}

/** Product detail visit. Also counts as a category browse for that product. */
export function recordProductView(input: {
  id: string;
  categorySlug?: string | null;
  storeId?: string | null;
  storeName?: string | null;
  brandSlug?: string | null;
}): void {
  if (!isClient() || !input.id) return;
  const signals = readSignals();
  const signal = toSignal(input);
  signals.views = [signal, ...signals.views.filter((v) => v.id !== input.id)].slice(0, MAX_VIEWS);
  if (signal.categorySlug) {
    signals.categories[signal.categorySlug] = Math.min(
      MAX_CATEGORY_COUNT,
      (signals.categories[signal.categorySlug] ?? 0) + 1,
    );
  }
  writeSignals(signals);
}

/** Wishlist add — persists until explicitly removed. */
export function recordWishlistAdd(input: {
  id: string;
  categorySlug?: string | null;
  storeId?: string | null;
  storeName?: string | null;
  brandSlug?: string | null;
}): void {
  if (!isClient() || !input.id) return;
  const signals = readSignals();
  signals.wishlist[input.id] = toSignal(input);
  writeSignals(signals);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("recommendations-change"));
  }
}

/** Wishlist remove — the signal is withdrawn. */
export function recordWishlistRemove(productId: string): void {
  if (!isClient() || !productId) return;
  const signals = readSignals();
  if (signals.wishlist[productId]) {
    delete signals.wishlist[productId];
    writeSignals(signals);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("recommendations-change"));
    }
  }
}

/** Category page / category filter browse. */
export function recordCategoryBrowse(slug: string): void {
  const normalized = normalizeSlug(slug);
  if (!isClient() || !normalized) return;
  const signals = readSignals();
  signals.categories[normalized] = Math.min(
    MAX_CATEGORY_COUNT,
    (signals.categories[normalized] ?? 0) + 1,
  );
  writeSignals(signals);
}

/** Product added to cart (committed interest; also excluded from recs). */
export function recordCartAdd(input: {
  id: string;
  categorySlug?: string | null;
  storeId?: string | null;
  storeName?: string | null;
  brandSlug?: string | null;
}): void {
  if (!isClient() || !input.id) return;
  const signals = readSignals();
  signals.cart[input.id] = toSignal(input);
  writeSignals(signals);
}

function sellersMatch(
  candidate: { storeId?: string | null; storeName?: string | null },
  signal: SignalProduct,
): boolean {
  if (candidate.storeId && signal.storeId) return candidate.storeId === signal.storeId;
  const a = (candidate.storeName ?? "").trim().toLowerCase();
  const b = (signal.storeName ?? "").trim().toLowerCase();
  return a.length > 0 && a === b;
}

function scoreCandidate(
  candidate: CatalogProduct,
  signals: SignalProduct[],
  categoryCounts: Record<string, number>,
): number {
  let score = 0;
  const candidateCategory = normalizeSlug(candidate.categorySlug);
  const candidateBrand = normalizeSlug(candidate.brandSlug);
  for (const signal of signals) {
    if (candidateCategory && signal.categorySlug && candidateCategory === signal.categorySlug) {
      score += 3;
    }
    if (sellersMatch(candidate, signal)) {
      score += 2;
    }
    if (candidateBrand && signal.brandSlug && candidateBrand === signal.brandSlug) {
      score += 1;
    }
  }
  if (candidateCategory) {
    const visits = categoryCounts[candidateCategory] ?? 0;
    if (visits > 0) score += Math.min(visits, 5);
  }
  return score;
}

function inStock(candidate: CatalogProduct): boolean {
  // totalStock absent = unknown → keep (never guess), matching rotation's stance.
  return candidate.totalStock === undefined || candidate.totalStock > 0;
}

export type RecommendationResult = {
  products: CatalogProduct[];
  /** "personalized" when at least one signal matched; "fallback" otherwise. */
  source: "personalized" | "fallback";
};

/**
 * Score candidate products against the shopper's signals.
 *
 * - Candidates are expected to be public/visible already; only in-stock
 *   (or unknown-stock) products are considered.
 * - Viewed and in-cart products are excluded.
 * - Ties break by stock, then by a session-stable shuffle (no reshuffle
 *   on every render).
 * - With no signals (or no matches): diverse + recent fallback —
 *   sellers interleaved round-robin, newest first within each seller.
 */
export function scoreRecommendations(
  candidates: readonly CatalogProduct[],
  limit = 8,
): RecommendationResult {
  const pool = candidates.filter(inStock);
  if (!pool.length || limit <= 0) return { products: [], source: "fallback" };

  const signals = readSignals();
  const signalList: SignalProduct[] = [
    ...signals.views,
    ...Object.values(signals.wishlist),
    ...Object.values(signals.cart),
  ];
  const excluded = new Set<string>([
    ...signals.views.map((v) => v.id),
    ...Object.keys(signals.cart),
  ]);

  const eligible = pool.filter((p) => !excluded.has(p.id));
  if (!eligible.length) return { products: [], source: "fallback" };

  // Session-stable base order: ties never reshuffle mid-session.
  const seed = getRotationSeed();
  const rand = mulberry32(seed ^ 0x51ab3f2d);
  const shuffled = [...eligible];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = shuffled[i] as CatalogProduct;
    shuffled[i] = shuffled[j] as CatalogProduct;
    shuffled[j] = tmp;
  }

  let personalized: CatalogProduct[] | null = null;
  if (signalList.length > 0) {
    const scored = shuffled
      .map((candidate) => ({
        candidate,
        score: scoreCandidate(candidate, signalList, signals.categories),
      }))
      .filter((s) => s.score > 0)
      // Array#sort is stable: equal scores keep the shuffled (session-stable) order.
      .sort(
        (a, b) =>
          b.score - a.score || (b.candidate.totalStock ?? 0) - (a.candidate.totalStock ?? 0),
      )
      .slice(0, limit)
      .map((s) => s.candidate);
    if (scored.length > 0) personalized = scored;
  }
  if (personalized) return { products: personalized, source: "personalized" };

  // Fallback: diverse + recent. Newest first, interleaved round-robin
  // across sellers so several storefronts get seen.
  const byDate = [...eligible].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const groups = new Map<string, CatalogProduct[]>();
  for (const product of byDate) {
    const key = sellerKeyOf(product);
    const group = groups.get(key);
    if (group) group.push(product);
    else groups.set(key, [product]);
  }
  const sellerOrder = [...groups.keys()];
  const srand = mulberry32(seed ^ 0x1b873593);
  for (let i = sellerOrder.length - 1; i > 0; i--) {
    const j = Math.floor(srand() * (i + 1));
    const tmp = sellerOrder[i] as string;
    sellerOrder[i] = sellerOrder[j] as string;
    sellerOrder[j] = tmp;
  }
  const queues = sellerOrder.map((key) => groups.get(key) as CatalogProduct[]);
  const out: CatalogProduct[] = [];
  let remaining = true;
  while (remaining && out.length < limit) {
    remaining = false;
    for (const queue of queues) {
      const next = queue.shift();
      if (next !== undefined) {
        out.push(next);
        remaining = true;
        if (out.length >= limit) break;
      }
    }
  }
  return { products: out, source: "fallback" };
}

/**
 * React hook for the "Recommandé pour vous" section.
 * Recomputes when candidates change or when wishlist/recommendation
 * signals change (same-tab events + cross-tab storage events).
 */
export function useRecommendations(
  candidates: readonly CatalogProduct[],
  limit = 8,
): RecommendationResult {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener("wishlist-change", bump);
    window.addEventListener("recommendations-change", bump);
    window.addEventListener("storage", (event) => {
      if (event.key === SIGNALS_KEY) bump();
    });
    return () => {
      window.removeEventListener("wishlist-change", bump);
      window.removeEventListener("recommendations-change", bump);
      window.removeEventListener("storage", bump);
    };
  }, []);
  return useMemo(
    () => scoreRecommendations(candidates, limit),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [candidates, limit, version],
  );
}
