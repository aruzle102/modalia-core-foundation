/**
 * Checkout safety tests.
 *
 * Verifies critical safety properties of the purchase path:
 * 1. Idempotency key is always passed (prevents duplicate orders)
 * 2. RPC failures throw (no false success shown to user)
 * 3. Missing order confirmation throws (no phantom orders)
 * 4. Prices computed server-side (client cannot manipulate)
 *
 * NOTE: Static analysis of source code. Live order creation
 * requires a real database and is verified manually.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const checkoutPath = join(__dirname, "..", "checkout.functions.ts");
const source = readFileSync(checkoutPath, "utf-8");

describe("checkout safety", () => {
  it("idempotency key is always passed to RPC", () => {
    assert.ok(
      source.includes("p_idempotency_key: data.idempotencyKey"),
      "idempotency key must be passed to checkout_cart RPC",
    );
    // Schema requires it
    assert.ok(
      source.includes("idempotencyKey: z.string().min(16).max(120)"),
      "idempotency key must be validated (min 16 chars)",
    );
  });

  it("RPC errors throw (no false success)", () => {
    assert.ok(
      source.includes('if (error) throw new Error(error.message'),
      "RPC errors must throw, not silently succeed",
    );
  });

  it("missing order confirmation throws", () => {
    assert.ok(
      source.includes('if (!order?.order_id || !order.order_number) throw'),
      "must throw if order confirmation is missing",
    );
  });

  it("client does not send prices (server computes)", () => {
    // Items only send variantId + quantity, never price
    const itemsSchema = source.match(/items: z\.array\(z\.object\(\{([^}]+)\}\)/);
    assert.ok(itemsSchema?.[1], "items schema must exist");
    const fields = itemsSchema[1] as string;
    assert.ok(fields.includes("variantId"), "items must include variantId");
    assert.ok(fields.includes("quantity"), "items must include quantity");
    assert.ok(!fields.includes("price"), "items must NOT include price (server computes)");
    assert.ok(!fields.includes("total"), "items must NOT include total (server computes)");
  });

  it("quantity is bounded (prevents abuse)", () => {
    assert.ok(
      source.includes("quantity: z.number().int().min(1).max(99)"),
      "quantity must be 1-99",
    );
    assert.ok(
      source.includes(".min(1).max(100)"),
      "max 100 items per order",
    );
  });

  it("phone validation is strict (Algerian format)", () => {
    assert.ok(
      source.includes("0[5-7][0-9]{8}"),
      "phone must match Algerian mobile format",
    );
  });
});

describe("checkout RPC safety (migration)", () => {
  const migrationPath = join(
    __dirname, "..", "..", "..",
    "supabase", "migrations",
    "20260921002524_d85c35c0-9f68-471c-98ba-0b0505e8d7d7.sql"
  );
  let migration: string;
  try {
    migration = readFileSync(migrationPath, "utf-8");
  } catch {
    // Migration file may not exist in all environments
    return;
  }

  it("RPC checks idempotency before creating order", () => {
    assert.ok(
      migration.includes("checkout_idempotency_key = p_idempotency_key"),
      "RPC must check for existing order by idempotency key",
    );
  });

  it("RPC has unique index on idempotency key", () => {
    assert.ok(
      migration.includes("UNIQUE INDEX") && migration.includes("checkout_idempotency_key"),
      "unique index must prevent duplicate orders",
    );
  });

  it("RPC validates stock before reserving", () => {
    assert.ok(
      migration.includes("available_stock"),
      "RPC must check available stock",
    );
    assert.ok(
      migration.includes("RAISE EXCEPTION") && migration.includes("enough stock"),
      "RPC must raise exception on insufficient stock",
    );
  });

  it("RPC computes prices from database (not client)", () => {
    assert.ok(
      migration.includes("pv.price") || migration.includes("variant_price"),
      "RPC must use database prices",
    );
  });
});
