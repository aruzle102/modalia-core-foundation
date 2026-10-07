-- MODALIA — Seller dashboard aggregation RPCs (Spec Section 3, performance hardening).
--
-- Replaces row-fetch + Node.js reduce (up to 50,000 rows per table) with
-- server-side SQL aggregation (GROUP BY / SUM / COUNT). Same return shapes,
-- same numbers, fraction of the data transfer.
--
-- Security: every function is SECURITY DEFINER and resolves the caller's
-- seller from the session (auth.uid()) — owner of an active seller, or active
-- staff holding the "analytics.view" permission. Never from client input.
-- Anything else raises 'forbidden' (fail closed). EXECUTE is granted to
-- `authenticated` only.

-- ---------------------------------------------------------------------------
-- Internal: resolve the caller's seller id, or raise 'forbidden'.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._seller_dashboard_resolve()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_seller_id uuid;
BEGIN
  -- Owner of an active seller (flagged must-reset owners stay denied, mirroring requireSeller).
  SELECT s.id INTO v_seller_id
  FROM public.sellers s
  WHERE s.owner_id = auth.uid()
    AND s.account_status = 'active'
    AND COALESCE(s.must_reset_password, false) = false
  LIMIT 1;

  -- Active staff with the analytics.view permission.
  IF v_seller_id IS NULL THEN
    SELECT st.seller_id INTO v_seller_id
    FROM public.seller_staff st
    JOIN public.sellers s ON s.id = st.seller_id
    WHERE st.user_id = auth.uid()
      AND st.active IS NOT FALSE
      AND s.account_status = 'active'
      AND st.permissions @> '["analytics.view"]'::jsonb
    LIMIT 1;
  END IF;

  IF v_seller_id IS NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN v_seller_id;
END;
$$;

REVOKE ALL ON FUNCTION public._seller_dashboard_resolve() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._seller_dashboard_resolve() TO authenticated;

-- ---------------------------------------------------------------------------
-- Overview KPIs: one round-trip, all aggregates computed in SQL.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seller_dashboard_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_seller_id uuid := public._seller_dashboard_resolve();
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'order_rows', COALESCE((
      SELECT jsonb_agg(t)
      FROM (
        SELECT so.status::text AS status,
               COUNT(*)::bigint AS cnt,
               COALESCE(SUM(so.subtotal + so.shipping_total), 0)::numeric AS sales,
               COALESCE(SUM(so.commission_total), 0)::numeric AS commission
        FROM public.seller_orders so
        WHERE so.seller_id = v_seller_id
        GROUP BY so.status
      ) t
    ), '[]'::jsonb),
    'settled_amount', COALESCE((
      SELECT SUM(ss.amount) FROM public.seller_settlements ss
      WHERE ss.seller_id = v_seller_id AND ss.status IN ('approved', 'paid')
    ), 0)::numeric,
    'pending_settlement_amount', COALESCE((
      SELECT SUM(ss.amount) FROM public.seller_settlements ss
      WHERE ss.seller_id = v_seller_id AND ss.status = 'pending'
    ), 0)::numeric,
    'products_count', (
      SELECT COUNT(*)::bigint FROM public.products p WHERE p.seller_id = v_seller_id
    ),
    'low_stock_count', (
      SELECT COUNT(*)::bigint
      FROM public.inventory i
      JOIN public.product_variants pv ON pv.id = i.variant_id
      JOIN public.products p ON p.id = pv.product_id
      WHERE p.seller_id = v_seller_id
        AND i.quantity > 0
        AND i.quantity <= COALESCE(i.low_stock_threshold, 3)
        AND (i.quantity - COALESCE(i.reserved_quantity, 0)) > 0
    ),
    'out_of_stock_count', (
      SELECT COUNT(*)::bigint
      FROM public.inventory i
      JOIN public.product_variants pv ON pv.id = i.variant_id
      JOIN public.products p ON p.id = pv.product_id
      WHERE p.seller_id = v_seller_id
        AND (i.quantity - COALESCE(i.reserved_quantity, 0)) <= 0
    ),
    'low_stock_alerts', COALESCE((
      SELECT jsonb_agg(t ORDER BY t.qty ASC)
      FROM (
        SELECT pv.sku AS sku,
               p.name AS name,
               p.slug AS slug,
               i.quantity::bigint AS qty,
               COALESCE(i.low_stock_threshold, 3)::bigint AS threshold,
               (i.quantity - COALESCE(i.reserved_quantity, 0))::bigint AS available
        FROM public.inventory i
        JOIN public.product_variants pv ON pv.id = i.variant_id
        JOIN public.products p ON p.id = pv.product_id
        WHERE p.seller_id = v_seller_id
          AND i.quantity <= COALESCE(i.low_stock_threshold, 3)
        ORDER BY i.quantity ASC
        LIMIT 8
      ) t
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.seller_dashboard_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seller_dashboard_overview() TO authenticated;

-- ---------------------------------------------------------------------------
-- Today stats: UTC calendar day aggregates for the caller's seller.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seller_dashboard_today()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_seller_id uuid := public._seller_dashboard_resolve();
  v_day_start timestamptz := date_trunc('day', now()); -- DB runs UTC; matches documented UTC-day behavior
BEGIN
  RETURN (
    SELECT jsonb_build_object(
      'sales', COALESCE(SUM(so.subtotal + so.shipping_total) FILTER (WHERE so.status = 'delivered'), 0)::numeric,
      'delivered_count', COUNT(*) FILTER (WHERE so.status = 'delivered'),
      'orders_count', COUNT(*) FILTER (WHERE so.status <> 'cancelled')
    )
    FROM public.seller_orders so
    WHERE so.seller_id = v_seller_id
      AND so.created_at >= v_day_start
  );
END;
$$;

REVOKE ALL ON FUNCTION public.seller_dashboard_today() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seller_dashboard_today() TO authenticated;

-- ---------------------------------------------------------------------------
-- Sales series: per-day sales (delivered) + non-cancelled order counts.
-- Zero-filled for every day in the window, oldest -> newest.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seller_dashboard_sales_series(p_days int DEFAULT 30)
RETURNS TABLE (day date, sales numeric, orders bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_seller_id uuid := public._seller_dashboard_resolve();
  v_days int := GREATEST(1, LEAST(COALESCE(p_days, 30), 120));
BEGIN
  RETURN QUERY
  WITH days AS (
    SELECT (date_trunc('day', now())::date - (v_days - 1) + generate_series(0, v_days - 1)) AS d
  )
  SELECT d.d,
         COALESCE(SUM(so.subtotal + so.shipping_total) FILTER (WHERE so.status = 'delivered'), 0)::numeric,
         COUNT(so.id) FILTER (WHERE so.status <> 'cancelled')
  FROM days d
  LEFT JOIN public.seller_orders so
    ON so.seller_id = v_seller_id
   AND so.created_at >= d.d
   AND so.created_at < d.d + 1
  GROUP BY d.d
  ORDER BY d.d ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.seller_dashboard_sales_series(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seller_dashboard_sales_series(int) TO authenticated;

-- ---------------------------------------------------------------------------
-- Top products by revenue across non-cancelled seller orders.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seller_dashboard_top_products(p_limit int DEFAULT 5)
RETURNS TABLE (product_id uuid, title jsonb, product_snapshot jsonb, units bigint, revenue numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_seller_id uuid := public._seller_dashboard_resolve();
  v_limit int := GREATEST(1, LEAST(COALESCE(p_limit, 5), 25));
BEGIN
  RETURN QUERY
  SELECT oi.product_id,
         MIN(oi.title)::jsonb,
         MIN(oi.product_snapshot)::jsonb,
         SUM(oi.quantity)::bigint,
         SUM(oi.total)::numeric
  FROM public.order_items oi
  JOIN public.seller_orders so ON so.id = oi.seller_order_id
  WHERE so.seller_id = v_seller_id
    AND so.status <> 'cancelled'
    AND oi.product_id IS NOT NULL
  GROUP BY oi.product_id
  ORDER BY SUM(oi.total) DESC, oi.product_id
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.seller_dashboard_top_products(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seller_dashboard_top_products(int) TO authenticated;

-- ---------------------------------------------------------------------------
-- Top categories by revenue across non-cancelled seller orders.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seller_dashboard_top_categories(p_limit int DEFAULT 5)
RETURNS TABLE (category_id uuid, name jsonb, slug text, units bigint, revenue numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_seller_id uuid := public._seller_dashboard_resolve();
  v_limit int := GREATEST(1, LEAST(COALESCE(p_limit, 5), 25));
BEGIN
  RETURN QUERY
  SELECT c.id,
         c.name,
         c.slug,
         SUM(oi.quantity)::bigint,
         SUM(oi.total)::numeric
  FROM public.order_items oi
  JOIN public.seller_orders so ON so.id = oi.seller_order_id
  JOIN public.products p ON p.id = oi.product_id
  JOIN public.categories c ON c.id = p.category_id
  WHERE so.seller_id = v_seller_id
    AND so.status <> 'cancelled'
    AND oi.product_id IS NOT NULL
    AND p.category_id IS NOT NULL
  GROUP BY c.id, c.name, c.slug
  ORDER BY SUM(oi.total) DESC, c.id
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.seller_dashboard_top_categories(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seller_dashboard_top_categories(int) TO authenticated;

-- ---------------------------------------------------------------------------
-- Per-status order counts (single GROUP BY; statuses with zero rows omitted).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seller_dashboard_order_status_breakdown()
RETURNS TABLE (status text, order_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_seller_id uuid := public._seller_dashboard_resolve();
BEGIN
  RETURN QUERY
  SELECT so.status::text, COUNT(*)::bigint
  FROM public.seller_orders so
  WHERE so.seller_id = v_seller_id
  GROUP BY so.status
  ORDER BY COUNT(*) DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.seller_dashboard_order_status_breakdown() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seller_dashboard_order_status_breakdown() TO authenticated;
