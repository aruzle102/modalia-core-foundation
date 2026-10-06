/**
 * Buy-now variant data (public server function).
 *
 * Returns the minimum a variant sheet needs to let a shopper pick a real
 * purchasable variant for a product: public-visible options (localized),
 * option values with per-value availability, and variants with inventory-
 * derived availability. Nothing here is invented: option values report
 * available only when at least one in-stock variant carries them, and
 * defaultVariantId is only set for products with no required options.
 */
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database, Json } from "@/integrations/supabase/types";
import { getLocale, getTranslations } from "@/lib/i18n";

type LocalizedText = Json | null;

export type BuyOptionValue = {
  id: string;
  value: string;
  label: string;
  hex: string | null;
  available: boolean;
};

export type BuyOption = {
  id: string;
  code: string;
  name: string;
  required: boolean;
  values: BuyOptionValue[];
};

export type BuyVariant = {
  id: string;
  price: number;
  compareAtPrice: number | null;
  available: boolean;
  stock: number;
  optionValueIds: string[];
};

export type ProductBuyOptions =
  | { available: false }
  | {
      available: true;
      product: { id: string; name: string; slug: string };
      options: BuyOption[];
      variants: BuyVariant[];
      defaultVariantId: string | null;
    };

function localized(value: LocalizedText, locale: string, fallback: string) {
  if (!value || Array.isArray(value)) return fallback;
  const record = value as Record<string, Json | undefined>;
  const text = record[locale] ?? record["fr"] ?? record["en"] ?? record["ar"];
  return typeof text === "string" ? text : fallback;
}

/** Same public-client pattern as product.functions.ts: publishable key, no session. */
function createPublicClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("The product catalogue is unavailable.");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

export const getProductBuyOptions = createServerFn({ method: "GET" })
  .validator((data) =>
    z.object({ productId: z.string().uuid(), locale: z.string().optional() }).parse(data),
  )
  .handler(async ({ data }): Promise<ProductBuyOptions> => {
    const { rateLimitEndpoint } = await import("@/lib/rate-limit");
    rateLimitEndpoint("getProductBuyOptions", 240);
    const supabase = createPublicClient();
    const locale = getLocale(data.locale);

    const productResult = await supabase
      .from("products")
      .select("id,slug,name")
      .eq("id", data.productId)
      .eq("status", "active")
      .eq("publication_status", "published")
      .eq("moderation_status", "approved")
      .eq("visibility", "public")
      .maybeSingle();
    if (productResult.error) throw new Error("The product could not be loaded.");
    if (!productResult.data) return { available: false };
    const product = productResult.data;

    const [optionsResult, valuesResult, variantsResult, optionLinksResult] = await Promise.all([
      supabase
        .from("product_options")
        .select("id,code,name,required")
        .eq("product_id", product.id)
        .order("sort_order"),
      supabase
        .from("product_option_values")
        .select("id,product_option_id,value,label,colors(hex_value)")
        .order("sort_order"),
      supabase
        .from("product_variants")
        .select("id,price,compare_at_price,available")
        .eq("product_id", product.id)
        .eq("status", "active")
        .order("sort_order"),
      supabase.from("variant_option_values").select("variant_id,product_option_value_id"),
    ]);
    if (optionsResult.error || valuesResult.error || variantsResult.error || optionLinksResult.error) {
      throw new Error("The product options could not be loaded.");
    }

    const inventories = await Promise.all(
      (variantsResult.data ?? []).map((variant) =>
        supabase
          .from("inventory")
          .select("quantity,reserved_quantity")
          .eq("variant_id", variant.id)
          .maybeSingle(),
      ),
    );

    const optionIds = new Set((optionsResult.data ?? []).map((option) => option.id));
    const values = (valuesResult.data ?? []).filter((value) => optionIds.has(value.product_option_id));
    const links = optionLinksResult.data ?? [];

    const variants: BuyVariant[] = (variantsResult.data ?? []).map((variant, index) => {
      const inventory = inventories[index]?.data;
      const stock = inventory ? Math.max(0, inventory.quantity - inventory.reserved_quantity) : 0;
      return {
        id: variant.id,
        price: Number(variant.price),
        compareAtPrice: variant.compare_at_price != null ? Number(variant.compare_at_price) : null,
        available: Boolean(variant.available) && stock > 0,
        stock,
        optionValueIds: links
          .filter((link) => link.variant_id === variant.id)
          .map((link) => link.product_option_value_id),
      };
    });

    const options: BuyOption[] = (optionsResult.data ?? []).map((option) => ({
      id: option.id,
      code: option.code,
      name: localized(option.name, locale, option.code),
      required: option.required,
      values: values
        .filter((value) => value.product_option_id === option.id)
        .map((value) => {
          const color = Array.isArray(value.colors) ? value.colors[0] : value.colors;
          const matchingVariants = variants.filter((variant) =>
            variant.optionValueIds.includes(value.id),
          );
          return {
            id: value.id,
            value: value.value,
            label: localized(value.label, locale, value.value),
            hex: color?.hex_value ?? null,
            available: matchingVariants.some((variant) => variant.available),
          };
        }),
    }));

    // A direct buy/add is only honest when no choice is required: take the
    // first available variant. With required options the shopper must choose.
    const hasRequiredOptions = options.some((option) => option.required);
    const defaultVariantId = hasRequiredOptions
      ? null
      : (variants.find((variant) => variant.available)?.id ?? null);

    return {
      available: true,
      product: {
        id: product.id,
        name: localized(product.name, locale, product.slug),
        slug: product.slug,
      },
      options,
      variants,
      defaultVariantId,
    };
  });
