-- MODALIA — Seller email verification tracking (Section 9: email/Auth sync fix).
--
-- Adds sellers.email_verified_at to track when a seller's email was verified
-- through the Supabase Auth email-change flow.
--
--   email_verified_at timestamptz NULL
--     - Set when the seller's email is confirmed via Supabase Auth
--       (auth.users.email_confirmed_at is non-null and matches sellers.email).
--     - NULL means unverified or verification pending.
--     - Reset to NULL whenever the email is changed, until re-verified.
--
-- This column is the database-side record that sellers.email is in sync with
-- auth.users.email. The application must NEVER write sellers.email directly;
-- email changes go through supabaseAdmin.auth.admin.updateUserById() and the
-- shared changeSellerEmail() helper, which keeps both in sync.
--
-- Additive only; existing rows keep NULL (unknown/legacy state).

ALTER TABLE public.sellers
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz NULL;

COMMENT ON COLUMN public.sellers.email_verified_at IS
  'When the seller email was last verified via the Supabase Auth email-change flow. NULL = unverified or verification pending. Reset to NULL on every email change until re-verified.';
