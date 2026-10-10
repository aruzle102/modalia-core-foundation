/**
 * Seller onboarding validation schemas.
 *
 * Pure zod schemas with no framework imports, so they can be unit-tested
 * with Node's native test runner without pulling in TanStack Start.
 */
import { z } from "zod";

/** Step 1 of the merchant onboarding: personal info (seller-onboarding.functions.ts). */
export const personalInfoInput = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().max(255),
  phone: z.string().min(6).max(30),
  wilaya: z.string().min(1).max(100),
  address: z.string().max(500).optional().default(""),
  // NOTE: idCardNumber removed 2026-10-10 — not persisted until KYC
  // requirement defines its purpose, readers, and retention policy.
});

/** Seller profile update (guided onboarding wizard, seller-support.functions.ts). */
export const updateSellerProfileInput = z.object({
  legalName: z.string().min(2).max(160),
  // Optional identity fields for the guided onboarding wizard
  // (Section 21); omitted fields are left untouched.
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email().max(160).optional(),
  wilaya: z.string().trim().min(1).max(100).optional(),
  address: z.string().trim().max(500).optional(),
});

/**
 * Build the sellers-table patch for updateSellerProfile.
 * Only includes fields that were explicitly provided (undefined = untouched).
 * Empty strings from the UI are normalized to undefined by callers before
 * reaching this function.
 */
export function buildSellerProfilePatch(data: {
  legalName: string;
  phone?: string | null | undefined;
  firstName?: string | undefined;
  lastName?: string | undefined;
  wilaya?: string | undefined;
  address?: string | undefined;
}): {
  legal_name: string;
  phone: string | null;
  first_name?: string;
  last_name?: string;
  wilaya?: string;
  address?: string | null;
} {
  const patch: {
    legal_name: string;
    phone: string | null;
    first_name?: string;
    last_name?: string;
    wilaya?: string;
    address?: string | null;
  } = { legal_name: data.legalName, phone: data.phone?.trim() || null };
  if (data.firstName !== undefined) patch.first_name = data.firstName;
  if (data.lastName !== undefined) patch.last_name = data.lastName;
  if (data.wilaya !== undefined) patch.wilaya = data.wilaya;
  if (data.address !== undefined) patch.address = data.address || null;
  return patch;
}
