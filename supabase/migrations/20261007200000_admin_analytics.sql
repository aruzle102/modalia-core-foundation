-- MODALIA — Admin commerce analytics RPCs (V10.1).
--
-- Real financial analytics computed in SQL from the commerce tables
-- (orders / seller_orders / order_items). analytics_events is used ONLY
-- for funnel behavior (visitors, views, cart, checkout) — never as the
-- source of financial truth.
--
-- COMMISSION RULE (critical): platform commission ALWAYS comes from
-- seller_orders.commission_total — the historical snapshot written at order
-- time. The CURRENT sellers.commission_rate is NEVER used for historical
-- math; it is exposed read-only for display next to the historical numbers.
--
-- Status semantics (order_status / seller_order_status enums):
--   eligible (revenue-recognized): delivered, fulfilled, received
--   cancelled: cancelled
--   returned: returned, refunded
--   active (pending fulfillment): everything else
--
-- NOTE: there is currently no settlements table, so settled commission is
-- returned as NULL (honest) rather than invented. "Pending" commission =
-- commission on active (non-delivered, non-cancelled) seller orders.
--
-- Security: every function is SECURITY DEFINER and raises 'forbidden'
-- unless public.is_super_admin() is true for the caller (fail closed).
-- EXECUTE is granted to `authenticated` only.

-- ---------------------------------------------------------------------------
-- Internal: admin guard, or raise 'forbidden'.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._admin_analytics_guard()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._admin_analytics_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._admin_analytics_guard() TO authenticated;

-- ---------------------------------------------------------------------------
-- Overview KPIs for [p_start, p_end).
-- Financial truth from orders / seller_orders / order_items; funnel from
-- analytics_events.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_analytics_overview(p_start timestamptz, p_end timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public._admin_analytics_guard();

  WITH
  po AS (
    SELECT id, grand_total, subtotal, discount_total, shipping_total,
           status::text AS status, cancelled_at
    FROM public.orders
    WHERE created_at >= p_start AND created_at < p_end
  ),
  po_live AS (
    SELECT * FROM po WHERE status <> 'cancelled' AND cancelled_at IS NULL
  ),
  so AS (
    SELECT id, order_id, seller_id, store_id, status::text AS status,
           subtotal, commission_total
    FROM public.seller_orders
    WHERE created_at >= p_start AND created_at < p_end
  ),
  so_elig AS (SELECT * FROM so WHERE status IN ('delivered', 'fulfilled', 'received')),
  so_active AS (SELECT * FROM so WHERE status NOT IN ('cancelled', 'returned', 'refunded', 'delivered', 'fulfilled', 'received')),
  oi AS (
    SELECT COALESCE(SUM(oi.quantity), 0)::bigint AS units
    FROM public.order_items oi
    JOIN so_elig s ON s.id = oi.seller_order_id
  ),
  ev AS (
    SELECT
      COUNT(DISTINCT anon_id) FILTER (
        WHERE event_type IN ('page_view', 'product_view', 'store_view', 'category_view')
      )::bigint AS visitors,
      COUNT(*) FILTER (WHERE event_type = 'product_view')::bigint AS product_views,
      COUNT(*) FILTER (WHERE event_type = 'add_to_cart')::bigint AS add_to_cart,
      COUNT(*) FILTER (WHERE event_type = 'checkout_started')::bigint AS checkout_started,
      COUNT(*) FILTER (WHERE event_type = 'checkout_completed')::bigint AS checkout_completed
    FROM public.analytics_events
    WHERE created_at >= p_start AND created_at < p_end
  )
  SELECT jsonb_build_object(
    -- commerce KPIs
    'orders_placed',        (SELECT COUNT(*) FROM po)::bigint,
    'orders_live',          (SELECT COUNT(*) FROM po_live)::bigint,
    'gmv',                  COALESCE((SELECT SUM(grand_total) FROM po_live), 0),
    'merchandise_subtotal', COALESCE((SELECT SUM(subtotal) FROM po_live), 0),
    'discounts',            COALESCE((SELECT SUM(discount_total) FROM po_live), 0),
    'shipping_total',       COALESCE((SELECT SUM(shipping_total) FROM po_live), 0),
    'delivered_orders',     (SELECT COUNT(*) FROM so_elig)::bigint,
    'cancelled_orders',     (SELECT COUNT(*) FROM so WHERE status = 'cancelled')::bigint,
    'returned_orders',      (SELECT COUNT(*) FROM so WHERE status IN ('returned', 'refunded'))::bigint,
    'active_orders',        (SELECT COUNT(*) FROM so_active)::bigint,
    'units_sold',           (SELECT units FROM oi)::bigint,
    'aov',                  CASE
                              WHEN (SELECT COUNT(*) FROM so_elig) > 0
                              THEN COALESCE((SELECT SUM(subtotal) FROM so_elig), 0)
                                   / (SELECT COUNT(*) FROM so_elig)
                              ELSE 0
                            END,
    -- commission: ALWAYS from the historical per-order snapshot
    'platform_commission',  COALESCE((SELECT SUM(commission_total) FROM so_elig), 0),
    'commission_pending',   COALESCE((SELECT SUM(commission_total) FROM so_active), 0),
    'settled_commission',   NULL,
    'seller_net',           COALESCE((SELECT SUM(subtotal - commission_total) FROM so_elig), 0),
    -- funnel (behavior only)
    'visitors',             (SELECT visitors FROM ev)::bigint,
    'product_views',        (SELECT product_views FROM ev)::bigint,
    'add_to_cart',          (SELECT add_to_cart FROM ev)::bigint,
    'checkout_started',     (SELECT checkout_started FROM ev)::bigint,
    'checkout_completed',   (SELECT checkout_completed FROM ev)::bigint,
    'conversion_rate',      CASE
                              WHEN (SELECT visitors FROM ev) > 0
                              THEN (SELECT checkout_completed FROM ev)::numeric
                                   / (SELECT visitors FROM ev)
                              ELSE 0
                            END,
    'cart_abandonment',     CASE
                              WHEN (SELECT add_to_cart FROM ev) > 0
                              THEN 1 - (SELECT checkout_completed FROM ev)::numeric
                                     / (SELECT add_to_cart FROM ev)
                              ELSE 0
                            END
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_analytics_overview(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_analytics_overview(timestamptz, timestamptz) TO authenticated;

-- ---------------------------------------------------------------------------
-- Time series: gmv / orders / commission per day or week bucket in range.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_analytics_timeseries(
  p_start timestamptz,
  p_end timestamptz,
  p_granularity text
)
RETURNS TABLE(bucket timestamptz, gmv numeric, orders_count bigint, commission numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_trunc text := CASE WHEN p_granularity = 'week' THEN 'week' ELSE 'day' END;
BEGIN
  PERFORM public._admin_analytics_guard();

  RETURN QUERY
  WITH buckets AS (
    SELECT generate_series(
      date_trunc(v_trunc, p_start),
      date_trunc(v_trunc, p_end - interval '1 microsecond'),
      ('1 ' || v_trunc)::interval
    ) AS b
  )
  SELECT
    bk.b AS bucket,
    COALESCE(
      SUM(o.grand_total) FILTER (
        WHERE o.status::text <> 'cancelled' AND o.cancelled_at IS NULL
      ), 0
    ) AS gmv,
    COUNT(o.id) FILTER (
      WHERE o.status::text <> 'cancelled' AND o.cancelled_at IS NULL
    ) AS orders_count,
    COALESCE(
      SUM(so.commission_total) FILTER (
        WHERE so.status::text IN ('delivered', 'fulfilled', 'received')
      ), 0
    ) AS commission
  FROM buckets bk
  LEFT JOIN public.orders o
    ON date_trunc(v_trunc, o.created_at) = bk.b
   AND o.created_at >= p_start AND o.created_at < p_end
  LEFT JOIN public.seller_orders so ON so.order_id = o.id
  GROUP BY bk.b
  ORDER BY bk.b;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_analytics_timeseries(timestamptz, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_analytics_timeseries(timestamptz, timestamptz, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Per-seller analytics in range. Financials from seller_orders snapshots.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_analytics_by_seller(p_start timestamptz, p_end timestamptz)
RETURNS TABLE(
  seller_id uuid,
  legal_name text,
  email text,
  commission_rate numeric,
  orders_placed bigint,
  gmv numeric,
  units_sold bigint,
  commission numeric,
  seller_net numeric,
  aov numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public._admin_analytics_guard();

  RETURN QUERY
  WITH so AS (
    SELECT
      so2.seller_id,
      so2.id,
      so2.status::text AS status,
      so2.subtotal,
      so2.commission_total,
      COALESCE(oi.units, 0)::bigint AS units
    FROM public.seller_orders so2
    LEFT JOIN (
      SELECT seller_order_id, SUM(quantity)::bigint AS units
      FROM public.order_items
      GROUP BY seller_order_id
    ) oi ON oi.seller_order_id = so2.id
    WHERE so2.created_at >= p_start AND so2.created_at < p_end
  )
  SELECT
    s.id,
    s.legal_name,
    s.email,
    s.commission_rate,
    COUNT(so.id) FILTER (WHERE so.status <> 'cancelled') AS orders_placed,
    COALESCE(SUM(so.subtotal) FILTER (WHERE so.status IN ('delivered', 'fulfilled', 'received')), 0) AS gmv,
    COALESCE(SUM(so.units) FILTER (WHERE so.status IN ('delivered', 'fulfilled', 'received')), 0)::bigint AS units_sold,
    COALESCE(SUM(so.commission_total) FILTER (WHERE so.status IN ('delivered', 'fulfilled', 'received')), 0) AS commission,
    COALESCE(SUM(so.subtotal - so.commission_total) FILTER (WHERE so.status IN ('delivered', 'fulfilled', 'received')), 0) AS seller_net,
    CASE
      WHEN COUNT(so.id) FILTER (WHERE so.status IN ('delivered', 'fulfilled', 'received')) > 0
      THEN COALESCE(SUM(so.subtotal) FILTER (WHERE so.status IN ('delivered', 'fulfilled', 'received')), 0)
           / COUNT(so.id) FILTER (WHERE so.status IN ('delivered', 'fulfilled', 'received'))
      ELSE 0
    END AS aov
  FROM public.sellers s
  LEFT JOIN so ON so.seller_id = s.id
  GROUP BY s.id, s.legal_name, s.email, s.commission_rate
  ORDER BY gmv DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_analytics_by_seller(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_analytics_by_seller(timestamptz, timestamptz) TO authenticated;

-- ---------------------------------------------------------------------------
-- Commission breakdown: per seller per month (eligible orders only).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_commission_breakdown(p_start timestamptz, p_end timestamptz)
RETURNS TABLE(
  seller_id uuid,
  legal_name text,
  month date,
  sales numeric,
  commission numeric,
  order_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public._admin_analytics_guard();

  RETURN QUERY
  SELECT
    s.id AS seller_id,
    s.legal_name,
    date_trunc('month', so.created_at)::date AS month,
    COALESCE(SUM(so.subtotal), 0) AS sales,
    COALESCE(SUM(so.commission_total), 0) AS commission,
    COUNT(so.id) AS order_count
  FROM public.sellers s
  JOIN public.seller_orders so ON so.seller_id = s.id
  WHERE so.created_at >= p_start
    AND so.created_at < p_end
    AND so.status::text IN ('delivered', 'fulfilled', 'received')
  GROUP BY s.id, s.legal_name, date_trunc('month', so.created_at)
  ORDER BY month DESC, commission DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_commission_breakdown(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_commission_breakdown(timestamptz, timestamptz) TO authenticated;
