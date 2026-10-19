/**
 * Fair product rotation — session-stable, seller-fair.
 *
 * Goals (homepage "discovery" sections):
 *  - Same order for the whole browser session (no reshuffle on every render).
 *  - Different order on a new visit / reload (fresh session seed).
 *  - No single seller dominates a section: products are interleaved
 *    round-robin across sellers (seeded order of sellers, seeded order
 *    of products inside each seller).
 *
 * The rotation NEVER overrides an explicit ordering chosen by the shopper:
 * use `rotationApplies()` to gate it — any user-selected sort, any search
 * query, and any price sorting bypass rotation entirely.
 *
 * Pure client-side: no database, no network, no personal data. Only the
 * random session seed is kept in sessionStorage.
 */

const SEED_KEY = "modalia-rotation-seed-v1";

/** Products this utility can rotate. Only the seller identity is needed. */
export type RotatableProduct = {
  storeId?: string | null;
  storeName?: string | null;
  /** Present when the source query computed it; absent = unknown (kept, never guessed). */
  totalStock?: number;
};

/** True on the client; the seed falls back to a per-call random value during SSR. */
function isClient(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

/**
 * Session seed, generated once per browser session and reused until the tab
 * (session) ends. A reload creates a NEW session → a new seed → a fresh order.
 */
export function getRotationSeed(): number {
  if (!isClient()) return Math.floor(Math.random() * 2 ** 31);
  try {
    const existing = window.sessionStorage.getItem(SEED_KEY);
    if (existing !== null) {
      const parsed = Number(existing);
      if (Number.isFinite(parsed)) return parsed;
    }
    const seed = Math.floor(Math.random() * 2 ** 31);
    window.sessionStorage.setItem(SEED_KEY, String(seed));
    return seed;
  } catch {
    return Math.floor(Math.random() * 2 ** 31);
  }
}

/** Deterministic PRNG (mulberry32). Same seed → same sequence, always. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher–Yates shuffle driven by a seeded PRNG. Pure: never mutates input.
 * Same (items, seed) → same output, on every device and every render.
 */
export function seededShuffle<T>(items: readonly T[], seed?: number): T[] {
  const result = [...items];
  const rand = mulberry32(seed ?? getRotationSeed());
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = result[i] as T;
    result[i] = result[j] as T;
    result[j] = tmp;
  }
  return result;
}

/**
 * Stable seller identity for fairness grouping. Prefers the store id;
 * falls back to the (localized) store name; unknown sellers share one
 * bucket rather than each becoming a "seller".
 */
export function sellerKeyOf(product: RotatableProduct): string {
  const id = product.storeId;
  if (typeof id === "string" && id.length > 0) return `id:${id}`;
  const name = product.storeName;
  if (typeof name === "string" && name.trim().length > 0) return `name:${name.trim()}`;
  return "unknown";
}

/**
 * Round-robin interleave across sellers (session-stable).
 *
 * 1. Sellers are ordered by a seeded shuffle (stable for the session).
 * 2. Products inside each seller are seeded-shuffled (stable for the session).
 * 3. Output takes one product per seller in turn, cycling until exhausted —
 *    so with N sellers the first N cards always show N different sellers.
 *
 * In-stock filtering is the caller's job (pass only sellable products);
 * items with unknown stock are kept, never dropped.
 */
export function interleaveBySeller<T extends RotatableProduct>(
  products: readonly T[],
  seed?: number,
): T[] {
  const effectiveSeed = seed ?? getRotationSeed();
  const groups = new Map<string, T[]>();
  for (const product of products) {
    const key = sellerKeyOf(product);
    const group = groups.get(key);
    if (group) group.push(product);
    else groups.set(key, [product]);
  }
  if (groups.size <= 1) return seededShuffle(products, effectiveSeed);

  const sellerKeys = seededShuffle([...groups.keys()], effectiveSeed);
  const queues = sellerKeys.map(
    (key) => seededShuffle(groups.get(key) as T[], effectiveSeed ^ 0x9e3779b9),
  );
  const out: T[] = [];
  let remaining = true;
  while (remaining) {
    remaining = false;
    for (const queue of queues) {
      const next = queue.shift();
      if (next !== undefined) {
        out.push(next);
        remaining = true;
      }
    }
  }
  return out;
}

export type RotateOptions = {
  /** Override the session seed (tests, previews). Defaults to the session seed. */
  seed?: number;
  /** Interleave round-robin across sellers. Default true. */
  sellerFair?: boolean;
};

/**
 * Session-stable fair rotation. Pure — never mutates the input array.
 */
export function rotateProducts<T extends RotatableProduct>(
  products: readonly T[],
  opts?: RotateOptions,
): T[] {
  if (products.length <= 1) return [...products];
  const seed = opts?.seed ?? getRotationSeed();
  const sellerFair = opts?.sellerFair ?? true;
  return sellerFair ? interleaveBySeller(products, seed) : seededShuffle(products, seed);
}

/**
 * Gate: rotation applies ONLY when the shopper has not chosen an ordering.
 * - Any explicit sort (price asc/desc, newest selected, …) → false.
 * - Any search query → false.
 * - No sort / no search (discovery sections, homepage rails) → true.
 *
 * Callers pass the raw search/sort params they already hold; when in doubt,
 * pass the sort through — rotation stays off rather than overriding intent.
 */
export function rotationApplies(opts: {
  sort?: string | null;
  isSearch?: boolean;
}): boolean {
  if (opts.isSearch) return false;
  const sort = (opts.sort ?? "").trim();
  if (sort.length > 0) return false;
  return true;
}
