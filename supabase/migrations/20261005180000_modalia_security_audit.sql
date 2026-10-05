-- Modalia security audit (Phase 4/4, Worker 6): spam hardening.
--
-- One review per customer per product. The public reviews table allows a
-- customer to insert their own reviews (reviews_own_create); without a
-- uniqueness guard a single customer could flood a product with ratings.
-- Guest rows (customer_id IS NULL) are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS reviews_product_customer_unique
  ON public.reviews (product_id, customer_id)
  WHERE customer_id IS NOT NULL;
