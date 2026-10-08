-- MODALIA — Seller-level manual verification control
-- Adds admin-override verification state on sellers (separate from the
-- store-level verification_status which tracks the normal requirements flow).
-- States: unverified | verified | manual | suspended
-- 'manual' = explicit admin override before normal requirements are met.

ALTER TABLE public.sellers
  ADD COLUMN IF NOT EXISTS verification_state TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_state IN ('unverified', 'verified', 'manual', 'suspended')),
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_note TEXT;

CREATE INDEX IF NOT EXISTS idx_sellers_verification_state ON public.sellers(verification_state);
