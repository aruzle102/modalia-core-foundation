-- MODALIA — Manual verification control (extends existing verification system)
-- Extends store_verification_status enum: unverified | verified | manual | suspended
-- Adds audit columns on stores for manual verification tracking.

-- New enum values (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                 WHERE t.typname = 'store_verification_status' AND e.enumlabel = 'manual') THEN
    ALTER TYPE store_verification_status ADD VALUE 'manual';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                 WHERE t.typname = 'store_verification_status' AND e.enumlabel = 'suspended') THEN
    ALTER TYPE store_verification_status ADD VALUE 'suspended';
  END IF;
END $$;

-- Audit columns for manual verification (admin override)
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_note TEXT,
  ADD COLUMN IF NOT EXISTS verification_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_stores_verification_status ON public.stores(verification_status);
