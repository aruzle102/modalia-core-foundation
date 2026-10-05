import { z } from "zod";

/**
 * Localized messages for the public seller application form.
 * The client builds the schema with the visitor's locale; the server
 * function falls back to English (defense in depth behind client validation).
 */
export interface SellerApplicationMessages {
  required: string;
  min2: string;
  tooLong: string;
  email: string;
  phone: string;
  categories: string;
  description: string;
}

export const EN_SELLER_APPLICATION_MESSAGES: SellerApplicationMessages = {
  required: "Required",
  min2: "At least 2 characters",
  tooLong: "Text is too long",
  email: "Invalid email address",
  phone: "Use an Algerian mobile number, for example +213551234567.",
  categories: "Add at least one product category.",
  description: "Describe your business in at least 20 characters.",
};

const ALGERIAN_MOBILE = /^\+213[5-7][0-9]{8}$/;

function splitCategories(value: string): string[] {
  return value
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * Server-side schema: categories arrive as an array of clean values.
 */
export function createSellerApplicationSchema(
  m: SellerApplicationMessages = EN_SELLER_APPLICATION_MESSAGES,
) {
  return z.object({
    firstName: z.string({ required_error: m.required }).trim().min(2, m.min2).max(100, m.tooLong),
    lastName: z.string({ required_error: m.required }).trim().min(2, m.min2).max(100, m.tooLong),
    phone: z.string({ required_error: m.required }).trim().regex(ALGERIAN_MOBILE, m.phone),
    email: z.string({ required_error: m.required }).trim().email(m.email).max(255, m.tooLong),
    storeName: z.string({ required_error: m.required }).trim().min(2, m.min2).max(160, m.tooLong),
    categories: z
      .array(z.string().trim().min(1).max(80))
      .min(1, m.categories)
      .max(12, m.categories),
    description: z
      .string({ required_error: m.required })
      .trim()
      .min(20, m.description)
      .max(2000, m.tooLong), // matches the DB CHECK (char_length BETWEEN 20 AND 2000)
    additionalInformation: z.string().trim().max(2000, m.tooLong).optional(),
  });
}

/**
 * Client-side schema: categories are typed as a comma-separated string and
 * validated before being split into the array the server expects.
 */
export function createSellerApplicationFormSchema(
  m: SellerApplicationMessages = EN_SELLER_APPLICATION_MESSAGES,
) {
  return createSellerApplicationSchema(m).extend({
    categories: z
      .string({ required_error: m.required })
      .trim()
      .min(1, m.categories)
      .refine(
        (v) => splitCategories(v).every((x) => x.length <= 80),
        m.tooLong,
      )
      .refine((v) => splitCategories(v).length <= 12, m.categories),
  });
}

export type SellerApplicationData = z.infer<
  ReturnType<typeof createSellerApplicationSchema>
>;

export type SellerApplicationFormValues = z.infer<
  ReturnType<typeof createSellerApplicationFormSchema>
>;

export function toServerCategories(value: string): string[] {
  return splitCategories(value);
}
