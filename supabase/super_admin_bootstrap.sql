-- =============================================================================
-- Modalia — Super Admin Bootstrap
-- -----------------------------------------------------------------------------
-- PURPOSE
--   Grant the very first `super_admin` role to a user account so that user can
--   open /admin. Run this file ONCE, manually, in the Supabase Dashboard ->
--   SQL Editor, while signed in as the project OWNER (service_role or a
--   database owner bypasses RLS, so do not hand this to anyone else).
--
--   This file lives OUTSIDE supabase/migrations/ on purpose. It must NEVER be
--   applied automatically by `supabase db push` or by CI — it is a manual,
--   one-off, human-run script.
--
-- HOW TO FIND YOUR USER ID
--   1. Supabase Dashboard -> Authentication -> Users.
--   2. Open the user who should become super admin and copy the "User UID".
--   3. Replace 'PASTE_USER_ID_HERE' below with that UID (keep the quotes).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- SECURITY WARNING
-- ---------------------------------------------------------------------------
-- Anyone holding the `super_admin` role can approve sellers, moderate every
-- product, change homepage content and read private marketplace data.
--   * Grant it only to people you fully trust.
--   * Keep the number of super admins as small as possible.
--   * Never commit a real user id into version control.
--   * Revoke it when someone no longer needs it:
--         DELETE FROM public.user_roles
--         WHERE user_id = '<user-id>' AND role = 'super_admin';
-- ---------------------------------------------------------------------------

-- 1) Grant the role. Idempotent: ON CONFLICT makes it safe to re-run.
INSERT INTO public.user_roles (user_id, role)
VALUES ('PASTE_USER_ID_HERE', 'super_admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- 2) Verify the grant took effect (should return exactly one row).
SELECT user_id, role, created_at
FROM public.user_roles
WHERE user_id = 'PASTE_USER_ID_HERE'
  AND role = 'super_admin';

-- 3) Optional: list every super admin currently in the project.
-- SELECT ur.user_id, u.email, ur.created_at
-- FROM public.user_roles AS ur
-- JOIN auth.users AS u ON u.id = ur.user_id
-- WHERE ur.role = 'super_admin'
-- ORDER BY ur.created_at;
