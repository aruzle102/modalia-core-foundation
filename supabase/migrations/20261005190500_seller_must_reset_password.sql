-- Seller OS Phase 2 (worker 3/4): secure onboarding — forced password rotation.
-- The admin provisions a seller with a temporary password shown once; the
-- owner must set a new password on first sign-in before working.
-- New migration (never edits older ones).
ALTER TABLE public.sellers ADD COLUMN IF NOT EXISTS must_reset_password boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.sellers.must_reset_password IS
'True while the owner must rotate their password (set by admin provisioning; cleared after the seller sets a new password).';
