-- Modalia V8 Sections 20-21: seller onboarding completion timestamp (ADDITIVE ONLY).
--   onboarded_at   timestamptz NULL — set when the seller owner completes (or
--                  explicitly skips) the guided onboarding wizard. NULL means
--                  the owner has not been onboarded yet and is routed to
--                  /seller/onboarding after sign-in / password rotation.
-- Existing rows untouched (NULL = not onboarded). The seller RLS policy
-- "seller_owner_or_admin" (FOR ALL, owner_id = auth.uid()) already permits the
-- owner to update their own row, so no new policy is needed.
-- Applies on Supabase/Lovable sync.

ALTER TABLE public.sellers
  ADD COLUMN IF NOT EXISTS onboarded_at timestamptz NULL;

COMMENT ON COLUMN public.sellers.onboarded_at IS
  'Set when the seller owner completes or skips the guided onboarding wizard (Sections 20-21). NULL = not yet onboarded.';
