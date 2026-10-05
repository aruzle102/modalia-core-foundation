-- Modalia real-event analytics (phase 4/4).
--
-- Sacred rule: never fabricate metrics. Every number shown in the admin and
-- seller dashboards is computed from rows in public.analytics_events, which
-- are recorded only from genuine storefront interactions. When there are no
-- rows, dashboards render honest empty states -- never zeros dressed up as
-- statistics and never synthetic charts.
--
-- Access model:
--   * No direct client access. RLS is enabled with NO policies for anon /
--     authenticated, so PostgREST reads/writes are denied by default.
--   * Writes go only through public.track_analytics_event() (SECURITY DEFINER,
--     strict validation, EXECUTE granted to anon + authenticated).
--   * Reads go through scoped SECURITY DEFINER RPCs:
--       - admin_analytics_events()      -> super_admin only
--       - seller_analytics_events()     -> the caller's own store only
--       - trending_products() / related_products() -> public aggregates only
--     Popular-search aggregates stay admin-side (search terms may contain
--     personal fragments); they are aggregated in the admin server function.

-- ---------------------------------------------------------------------------
-- Event type enum (restricted set; extend with ALTER TYPE ... ADD VALUE)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'analytics_event_type') THEN
    CREATE TYPE public.analytics_event_type AS ENUM (
      'page_view',
      'product_view',
      'search',
      'category_view',
      'add_to_cart',
      'wishlist_add',
      'checkout_started',
      'checkout_completed',
      'purchase',
      'store_view'
    );
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Events table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anon_id text NOT NULL,
  user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type public.analytics_event_type NOT NULL,
  entity_type text NULL,
  entity_id uuid NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT analytics_events_anon_id_length CHECK (char_length(anon_id) BETWEEN 8 AND 64),
  CONSTRAINT analytics_events_entity_type_length CHECK (entity_type IS NULL OR char_length(entity_type) <= 32)
);

CREATE INDEX IF NOT EXISTS analytics_events_event_time_idx
  ON public.analytics_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_anon_idx
  ON public.analytics_events (anon_id);
CREATE INDEX IF NOT EXISTS analytics_events_entity_idx
  ON public.analytics_events (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS analytics_events_created_idx
  ON public.analytics_events (created_at DESC);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Deny direct client access: no policies for anon/authenticated. The table is
-- writable/readable only via the SECURITY DEFINER functions below (and
-- service_role for operations).
GRANT ALL ON public.analytics_events TO service_role;
REVOKE ALL ON public.analytics_events FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ingest: the ONLY write path. Validates everything, stamps user_id from the
-- caller's JWT when present (null for anonymous visitors).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.track_analytics_event(
  p_anon_id text,
  p_event_type text,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_metadata jsonb;
BEGIN
  IF p_anon_id IS NULL OR char_length(p_anon_id) < 8 OR char_length(p_anon_id) > 64 THEN
    RAISE EXCEPTION 'invalid anon_id';
  END IF;

  IF p_event_type IS NULL OR p_event_type NOT IN (
    'page_view', 'product_view', 'search', 'category_view', 'add_to_cart',
    'wishlist_add', 'checkout_started', 'checkout_completed', 'purchase', 'store_view'
  ) THEN
    RAISE EXCEPTION 'invalid event_type';
  END IF;

  IF p_entity_type IS NOT NULL AND p_entity_type NOT IN ('product', 'category', 'store', 'order') THEN
    RAISE EXCEPTION 'invalid entity_type';
  END IF;

  v_metadata := COALESCE(p_metadata, '{}'::jsonb);
  IF octet_length(v_metadata::text) > 8192 THEN
    RAISE EXCEPTION 'metadata too large';
  END IF;

  INSERT INTO public.analytics_events (anon_id, user_id, event_type, entity_type, entity_id, metadata)
  VALUES (
    p_anon_id,
    auth.uid(),
    p_event_type::public.analytics_event_type,
    NULLIF(p_entity_type, ''),
    p_entity_id,
    v_metadata
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.track_analytics_event(text, text, text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_analytics_event(text, text, text, uuid, jsonb) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin read: super_admin only, bounded window, hard row cap.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_analytics_events(p_days int DEFAULT 30)
RETURNS TABLE (
  id uuid,
  anon_id text,
  event_type public.analytics_event_type,
  entity_type text,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT e.id, e.anon_id, e.event_type, e.entity_type, e.entity_id, e.metadata, e.created_at
  FROM public.analytics_events e
  WHERE e.created_at >= now() - make_interval(days => GREATEST(1, LEAST(COALESCE(p_days, 30), 90)))
  ORDER BY e.created_at DESC
  LIMIT 50000;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_analytics_events(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_analytics_events(int) TO authenticated;

-- ---------------------------------------------------------------------------
-- Seller read: strictly the caller's own store. The seller is resolved from
-- the session (auth.uid()) -- owner or active staff of an active seller --
-- never from client input. Only events attached to the seller's products or
-- store are returned.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seller_analytics_events(p_days int DEFAULT 30)
RETURNS TABLE (
  id uuid,
  anon_id text,
  event_type public.analytics_event_type,
  entity_type text,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_seller_id uuid;
BEGIN
  SELECT s.id INTO v_seller_id
  FROM public.sellers s
  WHERE s.owner_id = auth.uid()
    AND s.account_status = 'active'
  LIMIT 1;

  IF v_seller_id IS NULL THEN
    SELECT st.seller_id INTO v_seller_id
    FROM public.seller_staff st
    JOIN public.sellers s ON s.id = st.seller_id
    WHERE st.user_id = auth.uid()
      AND st.active
      AND s.account_status = 'active'
    LIMIT 1;
  END IF;

  IF v_seller_id IS NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT e.id, e.anon_id, e.event_type, e.entity_type, e.entity_id, e.metadata, e.created_at
  FROM public.analytics_events e
  WHERE e.created_at >= now() - make_interval(days => GREATEST(1, LEAST(COALESCE(p_days, 30), 90)))
    AND (
      (e.entity_type = 'product' AND e.entity_id IN (
        SELECT p.id FROM public.products p WHERE p.seller_id = v_seller_id
      ))
      OR
      (e.entity_type = 'store' AND e.entity_id IN (
        SELECT st.id FROM public.stores st WHERE st.seller_id = v_seller_id
      ))
    )
  ORDER BY e.created_at DESC
  LIMIT 50000;
END;
$$;

REVOKE ALL ON FUNCTION public.seller_analytics_events(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seller_analytics_events(int) TO authenticated;

-- ---------------------------------------------------------------------------
-- Public aggregates: counts only, no personal data leaves the database.
-- ---------------------------------------------------------------------------

-- Most-viewed products over the window. Used for "Popular right now".
CREATE OR REPLACE FUNCTION public.trending_products(p_days int DEFAULT 7, p_limit int DEFAULT 8)
RETURNS TABLE (product_id uuid, views bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT e.entity_id AS product_id, COUNT(*)::bigint AS views
  FROM public.analytics_events e
  WHERE e.event_type = 'product_view'
    AND e.entity_type = 'product'
    AND e.entity_id IS NOT NULL
    AND e.created_at >= now() - make_interval(days => GREATEST(1, LEAST(COALESCE(p_days, 7), 30)))
  GROUP BY e.entity_id
  ORDER BY views DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 8), 24));
$$;

REVOKE ALL ON FUNCTION public.trending_products(int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trending_products(int, int) TO anon, authenticated;

-- "Viewed together": products most often viewed by the same visitors who
-- viewed the given product (distinct-visitor co-views, 60-day window).
CREATE OR REPLACE FUNCTION public.related_products(p_product_id uuid, p_limit int DEFAULT 8)
RETURNS TABLE (product_id uuid, score bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH viewers AS (
    SELECT DISTINCT e.anon_id
    FROM public.analytics_events e
    WHERE e.event_type = 'product_view'
      AND e.entity_type = 'product'
      AND e.entity_id = p_product_id
      AND e.created_at >= now() - INTERVAL '60 days'
    LIMIT 5000
  )
  SELECT e.entity_id AS product_id, COUNT(DISTINCT e.anon_id)::bigint AS score
  FROM public.analytics_events e
  JOIN viewers v ON v.anon_id = e.anon_id
  WHERE e.event_type = 'product_view'
    AND e.entity_type = 'product'
    AND e.entity_id IS NOT NULL
    AND e.entity_id <> p_product_id
    AND e.created_at >= now() - INTERVAL '60 days'
  GROUP BY e.entity_id
  ORDER BY score DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 8), 24));
$$;

REVOKE ALL ON FUNCTION public.related_products(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.related_products(uuid, int) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Privacy preference: admins can disable event collection from site settings.
-- The ingest server function checks this key (default: enabled).
-- ---------------------------------------------------------------------------
INSERT INTO public.site_settings (key, value)
VALUES ('analytics_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;
