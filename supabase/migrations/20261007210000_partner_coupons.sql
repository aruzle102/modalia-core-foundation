-- MODALIA — Partner coupons (V10.1)
-- Extends the existing coupons table with a coupon_type discriminator and
-- partner-specific fields, plus a coupon_tiers table for tiered fixed
-- discounts based on cart merchandise subtotal.
--
-- Architecture (per spec §46):
--   coupon_type: 'platform' | 'seller' | 'partner'
--     - 'seller'  = legacy seller coupon (seller_id set, per-seller math)
--     - 'platform' = platform-wide coupon
--     - 'partner'  = platform-wide partner promotion with tiered discounts
--   coupon_tiers: tiered fixed discount rules for partner coupons
--   funding_model: who funds the discount — 'platform' | 'seller' | 'mixed'
--     (default 'platform'; preserved on the order at checkout time)
--   is_mandatory: partner coupon that sellers cannot opt out of

-- 1. Extend coupons ------------------------------------------------------------
ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS coupon_type TEXT NOT NULL DEFAULT 'seller'
    CHECK (coupon_type IN ('platform', 'seller', 'partner')),
  ADD COLUMN IF NOT EXISTS partner_name TEXT,
  ADD COLUMN IF NOT EXISTS partner_logo TEXT,
  ADD COLUMN IF NOT EXISTS funding_model TEXT NOT NULL DEFAULT 'platform'
    CHECK (funding_model IN ('platform', 'seller', 'mixed')),
  ADD COLUMN IF NOT EXISTS is_mandatory BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_coupons_type_status
  ON public.coupons (coupon_type, status);
CREATE INDEX IF NOT EXISTS idx_coupons_code_type
  ON public.coupons (code, coupon_type);

-- 2. Tiered discounts ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coupon_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id UUID NOT NULL REFERENCES public.coupons (id) ON DELETE CASCADE,
  min_subtotal NUMERIC(12, 2) NOT NULL CHECK (min_subtotal >= 0),
  max_subtotal NUMERIC(12, 2) CHECK (max_subtotal IS NULL OR max_subtotal > min_subtotal),
  discount_amount NUMERIC(12, 2) NOT NULL CHECK (discount_amount > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT coupon_tiers_discount_lt_min
    CHECK (discount_amount < min_subtotal)
);
CREATE INDEX IF NOT EXISTS idx_coupon_tiers_coupon
  ON public.coupon_tiers (coupon_id, sort_order);

COMMENT ON TABLE public.coupon_tiers IS
  'Tiered fixed discounts for partner coupons: first tier whose range contains the eligible cart subtotal wins. max_subtotal NULL = open-ended top tier.';
COMMENT ON COLUMN public.coupons.coupon_type IS
  'seller = legacy seller coupon, platform = platform-wide, partner = tiered partner promotion';
COMMENT ON COLUMN public.coupons.funding_model IS
  'Who funds the discount: platform | seller | mixed. Snapshotted on the order at checkout.';

-- 3. RLS: admin-only for coupon_tiers ------------------------------------------
ALTER TABLE public.coupon_tiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coupon_tiers_admin_all ON public.coupon_tiers;
CREATE POLICY coupon_tiers_admin_all ON public.coupon_tiers FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- NOTE: the existing coupons table keeps its coupons_seller_or_admin policy;
-- partner-coupon reads for validation happen server-side (service role) so no
-- new public SELECT policy is required. Direct client access to coupon_tiers
-- is denied for everyone except super admins.
