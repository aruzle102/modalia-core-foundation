/**
 * Fair rotation unit tests (`src/lib/rotation.ts`).
 *
 * Verifies the properties the storefront depends on:
 * 1. Seeded shuffle is deterministic (same seed → same order).
 * 2. Different seeds give different orders (fresh visit → fresh order).
 * 3. Seller-fair interleave: no seller dominates the head of a section.
 * 4. Input arrays are never mutated.
 * 5. rotationApplies() never overrides user-selected sorts or searches.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  getRotationSeed,
  mulberry32,
  seededShuffle,
  sellerKeyOf,
  interleaveBySeller,
  rotateProducts,
  rotationApplies,
} from "../rotation.ts";

type P = { id: string; storeId?: string | null; storeName?: string | null; totalStock?: number };

function makeProducts(): P[] {
  // 3 sellers: A ×4, B ×2, C ×1
  return [
    { id: "a1", storeId: "seller-a" },
    { id: "a2", storeId: "seller-a" },
    { id: "a3", storeId: "seller-a" },
    { id: "a4", storeId: "seller-a" },
    { id: "b1", storeId: "seller-b" },
    { id: "b2", storeId: "seller-b" },
    { id: "c1", storeId: "seller-c" },
  ];
}

describe("mulberry32 / seededShuffle", () => {
  it("is deterministic for the same seed", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    assert.deepEqual(seededShuffle(items, 42), seededShuffle(items, 42));
  });

  it("differs across seeds (fresh visit → fresh order)", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const orders = new Set([11, 22, 33].map((seed) => seededShuffle(items, seed).join(",")));
    assert.ok(orders.size > 1, "expected distinct orders across seeds");
  });

  it("never mutates the input array", () => {
    const items = makeProducts();
    const snapshot = items.map((p) => p.id);
    rotateProducts(items, { seed: 7 });
    assert.deepEqual(
      items.map((p) => p.id),
      snapshot,
    );
  });

  it("mulberry32 produces values in [0, 1)", () => {
    const rand = mulberry32(123);
    for (let i = 0; i < 100; i++) {
      const v = rand();
      assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
    }
  });
});

describe("sellerKeyOf", () => {
  it("prefers storeId, falls back to storeName, then unknown", () => {
    assert.equal(sellerKeyOf({ storeId: "s1", storeName: "Shop" }), "id:s1");
    assert.equal(sellerKeyOf({ storeId: null, storeName: "Shop" }), "name:Shop");
    assert.equal(sellerKeyOf({}), "unknown");
    assert.equal(sellerKeyOf({ storeId: "", storeName: "  " }), "unknown");
  });
});

describe("interleaveBySeller (fairness)", () => {
  it("round-robins so the head of the section shows distinct sellers", () => {
    const out = interleaveBySeller(makeProducts(), 99);
    assert.equal(out.length, 7);
    const headKeys = out.slice(0, 3).map(sellerKeyOf);
    assert.equal(new Set(headKeys).size, 3, `head should show 3 sellers, got ${headKeys}`);
  });

  it("is session-stable: same seed → same order", () => {
    const a = interleaveBySeller(makeProducts(), 5).map((p) => p.id);
    const b = interleaveBySeller(makeProducts(), 5).map((p) => p.id);
    assert.deepEqual(a, b);
  });

  it("keeps every product exactly once (no dupes, no drops)", () => {
    const out = interleaveBySeller(makeProducts(), 5)
      .map((p) => p.id)
      .sort();
    assert.deepEqual(out, ["a1", "a2", "a3", "a4", "b1", "b2", "c1"]);
  });

  it("single seller → plain seeded shuffle", () => {
    const single = [
      { id: "x1", storeId: "s" },
      { id: "x2", storeId: "s" },
    ];
    assert.deepEqual(
      interleaveBySeller(single, 3).map((p) => p.id),
      seededShuffle(single, 3).map((p) => p.id),
    );
  });

  it("groups unknown sellers into one bucket", () => {
    const items: P[] = [{ id: "u1" }, { id: "u2" }, { id: "k1", storeId: "known" }];
    const out = interleaveBySeller(items, 1);
    const headKeys = out.slice(0, 2).map(sellerKeyOf);
    assert.equal(new Set(headKeys).size, 2);
  });
});

describe("rotateProducts", () => {
  it("defaults to seller-fair interleaving", () => {
    const out = rotateProducts(makeProducts(), { seed: 99 });
    const headKeys = out.slice(0, 3).map(sellerKeyOf);
    assert.equal(new Set(headKeys).size, 3);
  });

  it("sellerFair:false → plain seeded shuffle", () => {
    const out = rotateProducts(makeProducts(), { seed: 9, sellerFair: false });
    assert.deepEqual(
      out.map((p) => p.id),
      seededShuffle(makeProducts(), 9).map((p) => p.id),
    );
  });

  it("handles empty / singleton arrays", () => {
    assert.deepEqual(rotateProducts([], { seed: 1 }), []);
    const one: P[] = [{ id: "only" }];
    assert.deepEqual(
      rotateProducts(one, { seed: 1 }).map((p) => p.id),
      ["only"],
    );
  });
});

describe("rotationApplies (never override shopper intent)", () => {
  it("applies with no sort and no search (discovery sections)", () => {
    assert.equal(rotationApplies({}), true);
    assert.equal(rotationApplies({ sort: null }), true);
    assert.equal(rotationApplies({ sort: "" }), true);
  });

  it("never applies with a user-selected sort", () => {
    for (const sort of ["newest", "price_asc", "price_desc", "popular"]) {
      assert.equal(rotationApplies({ sort }), false, `sort=${sort}`);
    }
  });

  it("never applies for search results", () => {
    assert.equal(rotationApplies({ isSearch: true }), false);
    assert.equal(rotationApplies({ sort: "", isSearch: true }), false);
  });
});

describe("getRotationSeed (session stability)", () => {
  beforeEach(() => {
    // Fresh in-memory sessionStorage stub per test.
    const store = new Map<string, string>();
    (globalThis as Record<string, unknown>)["window"] = {
      sessionStorage: {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    };
  });

  it("generates once and reuses within the session", () => {
    const first = getRotationSeed();
    const second = getRotationSeed();
    assert.equal(first, second, "seed must be stable within a session");
    assert.ok(Number.isInteger(first));
  });

  it("a new session (cleared storage) generates and persists a fresh seed", () => {
    // Install a dedicated stub so this test owns its storage map.
    const store = new Map<string, string>();
    const install = (map: Map<string, string>) => {
      (globalThis as Record<string, unknown>)["window"] = {
        sessionStorage: {
          getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
          setItem: (k: string, v: string) => void map.set(k, v),
          removeItem: (k: string) => void map.delete(k),
        },
      };
    };
    install(store);
    const first = getRotationSeed();
    // The seed is persisted to sessionStorage for the rest of the session.
    assert.equal(store.get("modalia-rotation-seed-v1"), String(first));

    // Simulate a new session: empty storage generates a fresh integer seed
    // and persists it for the new session.
    const freshStore = new Map<string, string>();
    install(freshStore);
    const second = getRotationSeed();
    assert.ok(Number.isInteger(second), "seed must be an integer");
    assert.equal(freshStore.get("modalia-rotation-seed-v1"), String(second));
    assert.equal(getRotationSeed(), second, "fresh seed is stable within the new session");
  });
});
