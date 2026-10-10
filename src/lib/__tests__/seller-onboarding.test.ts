/**
 * Seller onboarding validation tests.
 *
 * Uses Node's native test runner (node:test) — zero new dependencies.
 * Tests real validation and patch-building behavior from
 * src/lib/seller-onboarding.schemas.ts.
 *
 * NOTE: These are unit tests with no database. They verify input
 * validation and patch construction logic only — they do NOT prove
 * the live database accepts the writes.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildSellerProfilePatch,
  personalInfoInput,
  updateSellerProfileInput,
} from "../seller-onboarding.schemas.ts";

describe("personalInfoInput (merchant onboarding step 1)", () => {
  it("accepts valid input with wilaya and address", () => {
    const result = personalInfoInput.parse({
      firstName: "Amine",
      lastName: "Benali",
      email: "amine@example.com",
      phone: "0550123456",
      wilaya: "Alger",
      address: "Rue Didouche Mourad 12",
    });
    assert.equal(result.wilaya, "Alger");
    assert.equal(result.address, "Rue Didouche Mourad 12");
  });

  it("rejects missing wilaya (required)", () => {
    assert.throws(() =>
      personalInfoInput.parse({
        firstName: "Amine",
        lastName: "Benali",
        email: "amine@example.com",
        phone: "0550123456",
        address: "Rue 1",
      }),
    );
  });

  it("rejects empty wilaya string", () => {
    assert.throws(() =>
      personalInfoInput.parse({
        firstName: "Amine",
        lastName: "Benali",
        email: "amine@example.com",
        phone: "0550123456",
        wilaya: "",
      }),
    );
  });

  it("defaults address to empty string when omitted", () => {
    const result = personalInfoInput.parse({
      firstName: "Amine",
      lastName: "Benali",
      email: "amine@example.com",
      phone: "0550123456",
      wilaya: "Oran",
    });
    assert.equal(result.address, "");
  });

  it("strips idCardNumber (not stored)", () => {
    const result = personalInfoInput.parse({
      firstName: "Amine",
      lastName: "Benali",
      email: "amine@example.com",
      phone: "0550123456",
      wilaya: "Alger",
      idCardNumber: "123456789",
    });
    assert.ok(!("idCardNumber" in result), "idCardNumber must not survive validation");
  });
});

describe("updateSellerProfileInput (guided wizard)", () => {
  it("accepts wilaya and address as optional", () => {
    const result = updateSellerProfileInput.parse({
      legalName: "Amine Benali",
      wilaya: "Constantine",
      address: "Avenue de l'ALN",
    });
    assert.equal(result.wilaya, "Constantine");
    assert.equal(result.address, "Avenue de l'ALN");
  });

  it("accepts input without wilaya/address (both optional)", () => {
    const result = updateSellerProfileInput.parse({ legalName: "Amine Benali" });
    assert.equal(result.wilaya, undefined);
    assert.equal(result.address, undefined);
  });

  it("rejects empty wilaya when provided", () => {
    assert.throws(() =>
      updateSellerProfileInput.parse({ legalName: "AB", wilaya: "  " }),
    );
  });

  it("trims wilaya whitespace", () => {
    const result = updateSellerProfileInput.parse({
      legalName: "AB",
      wilaya: "  Alger  ",
    });
    assert.equal(result.wilaya, "Alger");
  });
});

describe("buildSellerProfilePatch", () => {
  it("includes wilaya and address when provided", () => {
    const patch = buildSellerProfilePatch({
      legalName: "Amine Benali",
      wilaya: "Alger",
      address: "Rue 1",
    });
    assert.equal(patch.wilaya, "Alger");
    assert.equal(patch.address, "Rue 1");
  });

  it("omits wilaya/address when undefined (existing data untouched)", () => {
    const patch = buildSellerProfilePatch({ legalName: "Amine Benali" });
    assert.ok(!("wilaya" in patch), "wilaya must not be in patch");
    assert.ok(!("address" in patch), "address must not be in patch");
  });

  it("converts empty address to null", () => {
    const patch = buildSellerProfilePatch({
      legalName: "AB",
      address: "",
    });
    assert.equal(patch.address, null);
  });

  it("preserves existing address when only wilaya is updated", () => {
    // Simulates UI sending wilaya without address: address key absent,
    // so the database keeps its current value.
    const patch = buildSellerProfilePatch({
      legalName: "AB",
      wilaya: "Oran",
      address: undefined,
    });
    assert.equal(patch.wilaya, "Oran");
    assert.ok(!("address" in patch));
  });
});
