/**
 * Recommendation signal + scoring unit tests
 * (`src/lib/recommendations-client.ts`).
 *
 * Verifies the rule-based engine the "Recommandé pour vous" section uses:
 * 1. Signals are recorded (views, wishlist, categories, cart) and readable.
 * 2. Scoring weights: same category +3, same seller +2, same brand +1.
 * 3. Viewed and in-cart products are excluded.
 * 4. No signals → diverse + recent fallback (never empty, never fabricated).
 * 5. clearRecommendationData() wipes everything (privacy reset).
 * 6. SSR-safe: every public function works without window/localStorage.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  recordProductView,
  recordWishlistAdd,
  recordWishlistRemove,
  recordCategoryBrowse,
  recordCartAdd,
  clearRecommendationData,
  getRecommendationSignals,
  hasRecommendationData,
  scoreRecommendations,
} from "@/lib/recommendations-client.ts";
import type { CatalogProduct } from "@/lib/catalog.functions.ts";

function product(overrides: Partial<CatalogProduct> & { id: string }): CatalogProduct {
  return {
    slug: overrides.id,
    name: `Product ${overrides.id}`,
    price: 1000,
    storeName: "Store",
    categorySlug: null,
    imagePath: null,
    imageAlt: "",
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  } as CatalogProduct;
}

/** Fresh in-memory localStorage + sessionStorage stub per test. */
function stubBrowser() {
  const ls = new Map<string, string>();
  const ss = new Map<string, string>();
  (globalThis as Record<string, unknown>)["window"] = {
    localStorage: {
      getItem: (k: string) => (ls.has(k) ? ls.get(k)! : null),
      setItem: (k: string, v: string) => void ls.set(k, v),
      removeItem: (k: string) => void ls.delete(k),
    },
    sessionStorage: {
      getItem: (k: string) => (ss.has(k) ? ss.get(k)! : null),
      setItem: (k: string, v: string) => void ss.set(k, v),
      removeItem: (k: string) => void ss.delete(k),
    },
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  return { ls, ss };
}

describe("signal recording", () => {
  beforeEach(() => stubBrowser());

  it("records product views (latest-first, deduped, capped)", () => {
    recordProductView({ id: "p1", categorySlug: "shoes" });
    recordProductView({ id: "p2", categorySlug: "bags" });
    recordProductView({ id: "p1", categorySlug: "shoes" }); // revisit → most recent
    const signals = getRecommendationSignals();
    assert.deepEqual(
      signals.views.map((v) => v.id),
      ["p1", "p2"],
    );
    assert.ok(hasRecommendationData());
  });

  it("records wishlist add/remove", () => {
    recordWishlistAdd({ id: "w1", categorySlug: "watches" });
    assert.ok(getRecommendationSignals().wishlist["w1"]);
    recordWishlistRemove("w1");
    assert.ok(!getRecommendationSignals().wishlist["w1"]);
  });

  it("records category browses with counts", () => {
    recordCategoryBrowse("shoes");
    recordCategoryBrowse("shoes");
    recordCategoryBrowse("  SHOES  "); // normalized
    assert.equal(getRecommendationSignals().categories["shoes"], 3);
  });

  it("records cart additions", () => {
    recordCartAdd({ id: "c1", storeId: "s1" });
    assert.ok(getRecommendationSignals().cart["c1"]);
    assert.ok(hasRecommendationData());
  });

  it("clearRecommendationData() wipes everything", () => {
    recordProductView({ id: "p1" });
    recordWishlistAdd({ id: "w1" });
    recordCategoryBrowse("shoes");
    recordCartAdd({ id: "c1" });
    assert.ok(hasRecommendationData());
    clearRecommendationData();
    assert.ok(!hasRecommendationData());
    assert.deepEqual(getRecommendationSignals().views, []);
  });

  it("is SSR-safe without window", () => {
    (globalThis as Record<string, unknown>)["window"] = undefined;
    assert.doesNotThrow(() => {
      recordProductView({ id: "p1" });
      recordWishlistAdd({ id: "w1" });
      recordCategoryBrowse("shoes");
      recordCartAdd({ id: "c1" });
      clearRecommendationData();
    });
    assert.deepEqual(getRecommendationSignals().views, []);
    assert.equal(hasRecommendationData(), false);
    const { products } = scoreRecommendations([product({ id: "a" })], 4);
    assert.equal(products.length, 1, "fallback still works without storage");
  });
});

describe("scoreRecommendations", () => {
  beforeEach(() => stubBrowser());

  it("weights: same category +3, same seller +2, same brand +1", () => {
    recordProductView({
      id: "seen",
      categorySlug: "shoes",
      storeId: "store-a",
      brandSlug: "nike",
    });
    const candidates = [
      product({ id: "cat-only", categorySlug: "shoes", storeId: "store-b", brandSlug: "adidas" }),
      product({ id: "seller-only", categorySlug: "bags", storeId: "store-a", brandSlug: "adidas" }),
      product({ id: "brand-only", categorySlug: "bags", storeId: "store-b", brandSlug: "nike" }),
      product({ id: "all-three", categorySlug: "shoes", storeId: "store-a", brandSlug: "nike" }),
      product({ id: "none", categorySlug: "bags", storeId: "store-b", brandSlug: "adidas" }),
    ];
    const { products, source } = scoreRecommendations(candidates, 5);
    assert.equal(source, "personalized");
    // all-three: 3+2+1=6 (+1 category browse from the view) → first
    // cat-only: 3 (+1 browse) → second; seller-only: 2 → third; brand-only: 1 → fourth
    assert.deepEqual(
      products.map((p) => p.id),
      ["all-three", "cat-only", "seller-only", "brand-only"],
    );
  });

  it("excludes viewed and in-cart products", () => {
    recordProductView({ id: "viewed", categorySlug: "shoes" });
    recordCartAdd({ id: "incart", categorySlug: "shoes" });
    const candidates = [
      product({ id: "viewed", categorySlug: "shoes" }),
      product({ id: "incart", categorySlug: "shoes" }),
      product({ id: "ok", categorySlug: "shoes" }),
    ];
    const { products } = scoreRecommendations(candidates, 5);
    assert.deepEqual(
      products.map((p) => p.id),
      ["ok"],
    );
  });

  it("wishlist signals score without excluding the product", () => {
    recordWishlistAdd({ id: "liked", categorySlug: "watches", storeId: "store-w" });
    const candidates = [
      product({ id: "liked", categorySlug: "watches", storeId: "store-w" }),
      product({ id: "similar", categorySlug: "watches", storeId: "store-w" }),
    ];
    const { products } = scoreRecommendations(candidates, 5);
    // Both score; the wishlisted item itself stays eligible (shoppers buy
    // what they saved), the similar one ranks alongside.
    assert.ok(products.some((p) => p.id === "similar"));
  });

  it("falls back to diverse + recent when there are no signals", () => {
    const candidates = [
      product({ id: "old-a", storeId: "s1", createdAt: "2025-01-01T00:00:00Z" }),
      product({ id: "new-a", storeId: "s1", createdAt: "2026-06-01T00:00:00Z" }),
      product({ id: "new-b", storeId: "s2", createdAt: "2026-05-01T00:00:00Z" }),
    ];
    const { products, source } = scoreRecommendations(candidates, 3);
    assert.equal(source, "fallback");
    assert.equal(products.length, 3);
    // Round-robin across sellers: first two must be different sellers.
    assert.notEqual(products[0]?.storeId, products[1]?.storeId);
  });

  it("falls back when signals match nothing", () => {
    recordProductView({ id: "seen", categorySlug: "shoes" });
    const candidates = [product({ id: "x", categorySlug: "bags", storeId: "s9" })];
    const { products, source } = scoreRecommendations(candidates, 3);
    assert.equal(source, "fallback");
    assert.equal(products.length, 1);
  });

  it("excludes out-of-stock products but keeps unknown stock", () => {
    recordProductView({ id: "seen", categorySlug: "shoes" });
    const candidates = [
      product({ id: "oos", categorySlug: "shoes", totalStock: 0 }),
      product({ id: "unknown-stock", categorySlug: "shoes" }),
      product({ id: "in-stock", categorySlug: "shoes", totalStock: 4 }),
    ];
    const { products } = scoreRecommendations(candidates, 5);
    const ids = products.map((p) => p.id);
    assert.ok(!ids.includes("oos"), "out-of-stock must be excluded");
    assert.ok(ids.includes("unknown-stock"), "unknown stock must be kept");
    assert.ok(ids.includes("in-stock"));
  });

  it("is session-stable: same order across calls in one session", () => {
    recordProductView({ id: "seen", categorySlug: "shoes" });
    const candidates = [
      product({ id: "a", categorySlug: "shoes" }),
      product({ id: "b", categorySlug: "shoes" }),
      product({ id: "c", categorySlug: "shoes" }),
    ];
    const first = scoreRecommendations(candidates, 3).products.map((p) => p.id);
    const second = scoreRecommendations(candidates, 3).products.map((p) => p.id);
    assert.deepEqual(first, second);
  });

  it("returns empty (not fabricated) when nothing is sellable", () => {
    const { products } = scoreRecommendations([], 5);
    assert.deepEqual(products, []);
    const { products: oos } = scoreRecommendations([product({ id: "x", totalStock: 0 })], 5);
    assert.deepEqual(oos, []);
  });
});
