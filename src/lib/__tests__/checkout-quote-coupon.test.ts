/**
 * Checkout quote per_customer_limit tests (F6, Phase B1).
 *
 * The checkout_cart RPC rejects a coupon when the buyer's prior usages reach
 * the coupon's per_customer_limit — but getCheckoutQuote previously ignored
 * that limit, so the coupon showed as "applied" in the quote and then failed
 * at submit. These tests pin the quote's mirrored logic:
 *
 * 1. The quote reads id + per_customer_limit from the coupons row.
 * 2. When a buyer phone is supplied, the quote counts coupon_usages rows for
 *    (coupon_id, guest_phone) — the guest-phone branch of the RPC's identity
 *    predicate — after normalizing the phone exactly like the submit path.
 * 3. The rejection uses the existing couponError shape ({ reason }), with a
 *    reason already inside the CouponReason union (checkout.tsx maps the
 *    union exhaustively — a new reason would break tsc there).
 * 4. The RPC migration that owns the authoritative check still raises on the
 *    same >= comparison with the same exception message.
 * 5. Without a buyer phone the check is skipped (no fake identity on a public
 *    quote) — the RPC stays authoritative at submit.
 *
 * NOTE: Static analysis of source code. Live per-customer counting requires
 * a real database and is verified manually.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const quotePath = join(__dirname, "..", "checkout-quote.functions.ts");
const source = readFileSync(quotePath, "utf-8");
const migrationPath = join(
  __dirname, "..", "..", "..",
  "supabase", "migrations",
  "20261006180000_checkout_coupons_tracking_v8.sql",
);
let migration = "";
try {
  migration = readFileSync(migrationPath, "utf-8");
} catch {
  // Migration file may not exist in all environments
}

describe("quote per_customer_limit (mirrors checkout_cart RPC)", () => {
  it("coupon row select includes id and per_customer_limit", () => {
    assert.ok(
      source.includes('"id,code,status,discount_type,discount_value,starts_at,ends_at,usage_limit,usage_count,per_customer_limit,'),
      "quote must read id + per_customer_limit from the coupons row",
    );
  });

  it("quote accepts an optional buyer phone (strict Algerian format)", () => {
    assert.ok(
      source.includes("buyerPhone"),
      "quote input must carry the buyer phone for per-customer checks",
    );
    assert.ok(
      source.includes("0[5-7][0-9]{8}|\\+213[5-7][0-9]{8}") || source.includes("0[5-7][0-9]{8}|\\+213[5-7][0-9]"),
      "buyerPhone must use the same strict Algerian phone format as checkout",
    );
    assert.ok(
      source.includes(".optional()"),
      "buyerPhone must stay optional (public quote has no identity by default)",
    );
  });

  it("quote counts prior usages from coupon_usages by coupon_id + guest_phone", () => {
    assert.ok(
      source.includes('.from("coupon_usages"'),
      "quote must read the coupon_usages ledger",
    );
    assert.ok(
      source.includes('.eq("coupon_id", coupon.id)'),
      "quote must scope the count to this coupon",
    );
    assert.ok(
      source.includes('.eq("guest_phone", normalizedPhone)'),
      "quote must scope the count to the normalized buyer phone (guest-phone branch of the RPC predicate)",
    );
    assert.ok(
      source.includes('count: "exact"'),
      "quote must use an exact count, like the RPC's count(*)",
    );
  });

  it("quote normalizes the phone exactly like the submit path", () => {
    assert.ok(
      source.includes('buyerPhone.startsWith("0") ? "+213" + buyerPhone.slice(1) : buyerPhone'),
      "quote must normalize 0… -> +213… exactly like createGuestOrder's p_phone",
    );
    const submitSource = readFileSync(join(__dirname, "..", "checkout.functions.ts"), "utf-8");
    assert.ok(
      submitSource.includes('data.phone.startsWith("0") ? "+213" + data.phone.slice(1) : data.phone'),
      "submit path must normalize the same way (source of truth)",
    );
  });

  it("quote rejects with the existing couponError shape when the limit is reached", () => {
    assert.ok(
      source.includes("(priorUses ?? 0) >= coupon.per_customer_limit"),
      "quote must reject on the same >= comparison as the RPC",
    );
    assert.ok(
      source.includes('return { valid: false, reason: "usage_limit" };'),
      "rejection must surface as couponError with an existing CouponReason",
    );
    assert.ok(
      !source.includes('reason: "per_customer_limit"'),
      "no new reason code — checkout.tsx maps CouponReason exhaustively",
    );
  });

  it("check is skipped without a buyer phone (RPC stays authoritative)", () => {
    assert.ok(
      source.includes("coupon.per_customer_limit != null && buyerPhone"),
      "check must require both a limit and buyer identity; skipped otherwise",
    );
    assert.ok(
      source.includes("data.buyerPhone ?? null"),
      "handler must pass the optional phone through to validation",
    );
  });
});

describe("RPC per_customer_limit (source of truth)", () => {
  it("migration is present", () => {
    assert.ok(migration.length > 0, "RPC migration must be readable");
  });

  it("RPC guards on per_customer_limit being set", () => {
    assert.ok(
      migration.includes("IF v_coupon.per_customer_limit IS NOT NULL THEN"),
      "RPC must only check when the coupon has a per-customer limit",
    );
  });

  it("RPC counts coupon_usages by coupon_id and customer identity", () => {
    assert.ok(
      migration.includes("FROM public.coupon_usages"),
      "RPC must count from coupon_usages",
    );
    assert.ok(
      migration.includes("WHERE coupon_id = v_coupon.id"),
      "RPC must scope to the coupon",
    );
    assert.ok(
      migration.includes("guest_phone IS NOT NULL AND guest_phone = p_phone"),
      "RPC guest-phone branch must match the quote's query predicate",
    );
  });

  it("RPC raises on the same >= comparison with the same message", () => {
    assert.ok(
      migration.includes("IF v_usage_used >= v_coupon.per_customer_limit THEN"),
      "RPC must reject when prior uses reach the limit (>=)",
    );
    assert.ok(
      migration.includes("RAISE EXCEPTION 'You have already used this coupon the maximum number of times.'"),
      "RPC exception message is the submit-time message",
    );
  });
});
