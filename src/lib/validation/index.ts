import { z } from "zod";
import { phonePattern } from "@/lib/localization";
export const productSchema = z.object({ name: z.record(z.string().min(1)), slug: z.string().min(3).max(120).regex(/^[a-z0-9-]+$/), basePrice: z.number().nonnegative(), currency: z.string().length(3), sellerId: z.string().uuid() });
export const productEditorSchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: z.string().trim().min(3).max(120).regex(/^[a-z0-9-]+$/),
  categoryId: z.string().uuid(),
  brandId: z.string().uuid().optional().or(z.literal("")),
  description: z.string().trim().max(8000).optional(),
  shortDescription: z.string().trim().max(320).optional(),
  sku: z.string().trim().min(2).max(80).regex(/^[A-Za-z0-9_-]+$/),
  price: z.coerce.number().positive(),
  compareAtPrice: z.coerce.number().nonnegative().optional(),
  weightGrams: z.coerce.number().int().positive(),
  visibility: z.enum(["private", "hidden", "public"]),
  inventory: z.coerce.number().int().nonnegative(),
  imageUrls: z.array(z.string().url()).max(12),
}).superRefine((value, context) => {
  if (value.compareAtPrice !== undefined && value.compareAtPrice > 0 && value.compareAtPrice <= value.price) context.addIssue({ code: z.ZodIssueCode.custom, path: ["compareAtPrice"], message: "Original price must be higher than the current price." });
});
export type ProductEditorValues = z.infer<typeof productEditorSchema>;
export const sellerSchema = z.object({ legalName: z.string().min(2).max(160) });
export const customerSchema = z.object({ email: z.string().email().optional(), phone: z.string().regex(phonePattern()).optional() }).refine((value) => value.email || value.phone, "An email or phone number is required");
export const addressSchema = z.object({ fullName: z.string().min(2), phone: z.string().regex(phonePattern()), wilayaId: z.string().uuid(), communeId: z.string().uuid(), addressLine: z.string().min(4) });
export const inventorySchema = z.object({ quantity: z.number().int().nonnegative() });
export const reviewSchema = z.object({ rating: z.number().int().min(1).max(5), body: z.string().max(2000).optional() });
export const couponSchema = z.object({ code: z.string().trim().min(3).max(64).regex(/^[A-Z0-9-]+$/), discountValue: z.number().positive() });
