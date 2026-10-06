/**
 * Buy-now intent store (client only).
 *
 * "Buy now" jumps straight to an express checkout without touching the cart.
 * The chosen line is captured as a single-use intent in sessionStorage (never
 * localStorage — it must not survive the tab), with a 30-minute TTL. The
 * checkout page reads the intent and consumes it; a refresh of the checkout
 * tab can re-read it, but once consumed it is gone.
 */
import type { CartLine } from "@/lib/cart-store";

const STORAGE_KEY = "modalia-buynow-intent";
const TTL_MS = 30 * 60 * 1000;

type StoredIntent = {
  id: string;
  items: CartLine[];
  createdAt: number;
};

/**
 * Store a single buy-now line. Single-use semantics: there is ever at most
 * one pending intent — creating a new one replaces the previous.
 * Returns the intent id (crypto.randomUUID).
 */
export function createBuyNowIntent(item: CartLine): string {
  const id = crypto.randomUUID();
  const stored: StoredIntent = { id, items: [item], createdAt: Date.now() };
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  return id;
}

/**
 * Read an intent's lines without consuming them.
 * Returns null when missing, foreign, or expired.
 */
export function readBuyNowIntent(id: string): CartLine[] | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredIntent;
    if (parsed.id !== id) return null;
    if (!Array.isArray(parsed.items) || parsed.items.length === 0) return null;
    if (Date.now() - parsed.createdAt > TTL_MS) return null;
    return parsed.items;
  } catch {
    return null;
  }
}

/** Remove the intent so it can never be applied twice. */
export function consumeBuyNowIntent(id: string): void {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as StoredIntent;
    if (parsed.id === id) sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage already gone — nothing to consume.
  }
}
