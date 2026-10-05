-- Modalia notifications (DB-first): in-app notification center + preferences.
-- No email/SMS provider: notifications are rows that the UI reads.
-- Recipients: exactly one of (user_id, seller_id, is_admin).
--   user_id   -> customer notifications, keyed on auth.users id.
--   seller_id -> seller notifications, visible to the store owner + active staff.
--   is_admin  -> broadcast to super admins (server functions only, no RLS read).
--
-- A legacy `notifications` table (id, user_id, type, title, body, read_at,
-- created_at) may already exist from an early migration; this file creates the
-- full table on fresh databases and evolves the legacy one in place.

-- ---------------------------------------------------------------------------
-- Helper: seller id for the current auth user (owner or active staff).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_seller_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id
  FROM public.sellers s
  WHERE s.owner_id = auth.uid()
    AND s.account_status = 'active'
  UNION ALL
  SELECT ss.seller_id
  FROM public.seller_staff ss
  JOIN public.sellers s ON s.id = ss.seller_id
  WHERE ss.user_id = auth.uid()
    AND ss.active IS NOT FALSE
    AND s.account_status = 'active'
  LIMIT 1
$$;

REVOKE EXECUTE ON FUNCTION public.current_seller_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_seller_id() TO authenticated;

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL,
  seller_id uuid NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  is_admin boolean NOT NULL DEFAULT false,
  type text NOT NULL,
  -- Localized content: { "ar": "...", "fr": "...", "en": "..." }.
  title jsonb NOT NULL DEFAULT '{}'::jsonb,
  body jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Structured params used to render the notification (order_id, order_number,
  -- status, product name...). Never trust this client-side for authorization.
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Optional in-app destination, e.g. "/account/orders/123".
  link text NULL,
  read_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Evolve the legacy table when it already exists.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS seller_id uuid REFERENCES public.sellers(id) ON DELETE CASCADE;
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS link text;
ALTER TABLE public.notifications
  ALTER COLUMN user_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_recipient_check') THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_recipient_check CHECK (
        (CASE WHEN user_id IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN seller_id IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN is_admin THEN 1 ELSE 0 END) = 1
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_seller_created_idx
  ON public.notifications (seller_id, created_at DESC)
  WHERE seller_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_admin_created_idx
  ON public.notifications (is_admin, created_at DESC)
  WHERE is_admin;
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications (user_id)
  WHERE user_id IS NOT NULL AND read_at IS NULL;
CREATE INDEX IF NOT EXISTS notifications_seller_unread_idx
  ON public.notifications (seller_id)
  WHERE seller_id IS NOT NULL AND read_at IS NULL;
CREATE INDEX IF NOT EXISTS notifications_admin_unread_idx
  ON public.notifications (is_admin)
  WHERE is_admin AND read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

-- Replace the legacy self-read policies with scope-aware ones.
DROP POLICY IF EXISTS "notifications_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_own_update" ON public.notifications;
DROP POLICY IF EXISTS "notifications_own_read" ON public.notifications;
DROP POLICY IF EXISTS "notifications_customer_select" ON public.notifications;
DROP POLICY IF EXISTS "notifications_customer_update" ON public.notifications;
DROP POLICY IF EXISTS "notifications_seller_select" ON public.notifications;
DROP POLICY IF EXISTS "notifications_seller_update" ON public.notifications;

-- Customers read/update only their own rows.
CREATE POLICY "notifications_customer_select" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND seller_id IS NULL AND is_admin = false);

CREATE POLICY "notifications_customer_update" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND seller_id IS NULL AND is_admin = false)
  WITH CHECK (user_id = auth.uid() AND seller_id IS NULL AND is_admin = false);

-- Sellers read/update only their store's rows (owner + active staff).
CREATE POLICY "notifications_seller_select" ON public.notifications
  FOR SELECT TO authenticated
  USING (
    seller_id IS NOT NULL
    AND user_id IS NULL
    AND is_admin = false
    AND seller_id = public.current_seller_id()
  );

CREATE POLICY "notifications_seller_update" ON public.notifications
  FOR UPDATE TO authenticated
  USING (
    seller_id IS NOT NULL
    AND user_id IS NULL
    AND is_admin = false
    AND seller_id = public.current_seller_id()
  )
  WITH CHECK (
    seller_id IS NOT NULL
    AND user_id IS NULL
    AND is_admin = false
    AND seller_id = public.current_seller_id()
  );

-- No INSERT/DELETE policies: rows are created by server functions (service
-- role) from real order/product/inventory events only. is_admin rows have no
-- client read policy on purpose; admins read them via server functions.

-- ---------------------------------------------------------------------------
-- notification_preferences: one row per customer user or per seller.
-- prefs is a flat map of preference key -> boolean; missing keys default true.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL,
  seller_id uuid NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  prefs jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_preferences_scope_check CHECK (
    (CASE WHEN user_id IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN seller_id IS NOT NULL THEN 1 ELSE 0 END) = 1
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_preferences_user_unique
  ON public.notification_preferences (user_id)
  WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS notification_preferences_seller_unique
  ON public.notification_preferences (seller_id)
  WHERE seller_id IS NOT NULL;

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;

DROP POLICY IF EXISTS "notification_preferences_customer_all" ON public.notification_preferences;
DROP POLICY IF EXISTS "notification_preferences_seller_all" ON public.notification_preferences;

CREATE POLICY "notification_preferences_customer_all" ON public.notification_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "notification_preferences_seller_all" ON public.notification_preferences
  FOR ALL TO authenticated
  USING (seller_id IS NOT NULL AND seller_id = public.current_seller_id())
  WITH CHECK (seller_id IS NOT NULL AND seller_id = public.current_seller_id());
