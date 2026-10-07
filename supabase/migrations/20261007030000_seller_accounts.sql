-- MODALIA — Seller identity model (Spec Section 8).
--
-- Username-based seller login with real-email transition:
--   1. Admin provisions a seller -> the system generates a globally-unique
--      username (seller_ + 5 unambiguous chars, e.g. seller_8K29Q) and a
--      temporary password.
--   2. A Supabase Auth user is created with the SYNTHETIC email
--      {username}@seller.modalia.internal (never shown to the seller).
--   3. The seller logs in with USERNAME + temp password; the login page
--      deterministically maps the username to the synthetic auth email.
--   4. After first login the seller provides a real email, verifies it
--      through the Supabase Auth email-change flow, and
--      seller_accounts.login_method flips to 'email'. The username stays
--      reserved forever (UNIQUE, never reused).
--
-- Backward compatibility: existing sellers keep logging in with their real
-- email. The backfill below creates seller_accounts rows for them with
-- login_method='email' and a reserved generated username, so nothing about
-- their current authentication changes.

CREATE TABLE IF NOT EXISTS public.seller_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  auth_user_id uuid NOT NULL UNIQUE,
  login_method text NOT NULL DEFAULT 'username' CHECK (login_method IN ('username', 'email')),
  email text NULL,
  email_verified_at timestamptz NULL,
  must_change_password boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deactivated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS seller_accounts_seller_id_idx ON public.seller_accounts (seller_id);
CREATE INDEX IF NOT EXISTS seller_accounts_username_idx ON public.seller_accounts (username);
CREATE INDEX IF NOT EXISTS seller_accounts_auth_user_id_idx ON public.seller_accounts (auth_user_id);
CREATE INDEX IF NOT EXISTS seller_accounts_email_idx ON public.seller_accounts (email);

-- Keep updated_at fresh (same convention as sellers/stores/profiles).
DROP TRIGGER IF EXISTS seller_accounts_updated_at ON public.seller_accounts;
CREATE TRIGGER seller_accounts_updated_at
  BEFORE UPDATE ON public.seller_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.seller_accounts ENABLE ROW LEVEL SECURITY;

-- A seller reads their own identity row; admins read all rows.
-- There are deliberately NO insert/update/delete policies: writes go through
-- the service role only (admin provisioning + verified email transitions).
DROP POLICY IF EXISTS seller_accounts_select_own ON public.seller_accounts;
CREATE POLICY seller_accounts_select_own ON public.seller_accounts
  FOR SELECT
  USING (auth.uid() = auth_user_id OR public.is_super_admin());

COMMENT ON TABLE public.seller_accounts IS
  'Seller identity mapping (Spec Section 8): seller_id <-> username <-> auth_user_id. Usernames are globally unique and never reused. login_method flips username->email after the seller verifies a real email via Supabase Auth.';

-- ---------------------------------------------------------------------------
-- Backfill: one seller_accounts row per existing seller.
--
-- Existing sellers were provisioned with a real email as their Auth email, so
-- login_method='email' preserves their current login exactly. The generated
-- username is reserved for them (never reused by new sellers).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  uname text;
  tries int;
BEGIN
  FOR r IN
    SELECT s.id, s.owner_id, s.email, s.email_verified_at,
           COALESCE(s.must_reset_password, false) AS must_reset,
           COALESCE(s.account_status, 'active') AS acct
    FROM public.sellers s
    WHERE s.owner_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.seller_accounts sa WHERE sa.seller_id = s.id)
  LOOP
    -- Deterministic base from the seller id; md5 hex never contains O/I/L,
    -- only 0 and 1 are ambiguous -> map them to X/Y.
    uname := 'seller_' || translate(upper(substr(md5(r.id::text), 1, 5)), '01', 'XY');
    tries := 0;
    WHILE EXISTS (SELECT 1 FROM public.seller_accounts WHERE username = uname) LOOP
      tries := tries + 1;
      IF tries > 100 THEN
        RAISE EXCEPTION 'seller_accounts backfill: could not generate a unique username for seller %', r.id;
      END IF;
      uname := 'seller_' || translate(upper(substr(md5(r.id::text || tries::text), 1, 5)), '01', 'XY');
    END LOOP;

    INSERT INTO public.seller_accounts
      (seller_id, username, auth_user_id, login_method, email, email_verified_at, must_change_password, status)
    VALUES (
      r.id,
      uname,
      r.owner_id,
      'email',
      r.email,
      r.email_verified_at,
      r.must_reset,
      CASE r.acct WHEN 'suspended' THEN 'suspended' WHEN 'disabled' THEN 'deactivated' ELSE 'active' END
    );
  END LOOP;
END $$;
