-- MODALIA — V8 Phase-2 fix #55 (Worker A): close the 5000g shipping gap.
--
-- The platform seed (20260925120000 / 20260928000617) created two weight
-- bands per wilaya × delivery method: [0, 5000) and [5001, ∞). The quote
-- matcher (src/lib/checkout-quote.functions.ts) tests
--   min_weight_grams <= weight AND (max_weight_grams IS NULL OR weight < max_weight_grams)
-- so a parcel of EXACTLY 5000g matched NO band and got no shipping price.
--
-- ADDITIVE repair: move the second band's lower bound from 5001 to 5000,
-- i.e. [5000, ∞). Bands stay disjoint ([0,5000) then [5000,∞)) and every
-- non-negative weight now matches exactly one platform band.
--
-- Scope is strictly platform rows (seller_id IS NULL, max NULL, min = 5001);
-- seller-configured rows are never touched. Idempotent: re-running matches
-- zero rows.

BEGIN;

UPDATE public.shipping_rules
SET min_weight_grams = 5000
WHERE seller_id IS NULL
  AND min_weight_grams = 5001
  AND max_weight_grams IS NULL;

COMMIT;
