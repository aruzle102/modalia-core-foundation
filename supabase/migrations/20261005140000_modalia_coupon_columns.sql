-- Modalia Super Admin OS: add coupon guardrail columns (Phase 1/4, Worker 5).
-- New columns only; no existing constraints touched.
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS min_order_amount numeric;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS max_discount_amount numeric;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS per_customer_limit integer;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS usage_count integer NOT NULL DEFAULT 0;
