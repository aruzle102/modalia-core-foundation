-- MODALIA — Store verification request system
-- Conditions: 50+ sales in last 30 days AND 5000+ unique store views
-- Views deduplicated by device (one count per device per store)

-- 1. Store views tracking (deduplicated by device)
CREATE TABLE IF NOT EXISTS public.store_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  device_hash TEXT NOT NULL,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, device_hash)
);
CREATE INDEX IF NOT EXISTS idx_store_views_store ON public.store_views(store_id);
CREATE INDEX IF NOT EXISTS idx_store_views_viewed ON public.store_views(viewed_at);

-- 2. Verification requests
CREATE TABLE IF NOT EXISTS public.verification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  sales_30d INTEGER NOT NULL DEFAULT 0,
  unique_views INTEGER NOT NULL DEFAULT 0,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  review_notes TEXT,
  UNIQUE (store_id, status) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX IF NOT EXISTS idx_verif_req_store ON public.verification_requests(store_id);
CREATE INDEX IF NOT EXISTS idx_verif_req_status ON public.verification_requests(status);

-- 3. Record a store view (idempotent per device)
CREATE OR REPLACE FUNCTION public.record_store_view(p_store_id UUID, p_device_hash TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.store_views (store_id, device_hash)
  VALUES (p_store_id, p_device_hash)
  ON CONFLICT (store_id, device_hash) DO NOTHING;
  RETURN FOUND;
END;
$$;

-- 4. Get verification eligibility for a store
CREATE OR REPLACE FUNCTION public.get_store_verification_eligibility(p_store_id UUID)
RETURNS TABLE (sales_30d BIGINT, unique_views BIGINT, eligible BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sales BIGINT;
  v_views BIGINT;
BEGIN
  -- Count delivered/paid orders in last 30 days for this store's seller
  SELECT COUNT(*) INTO v_sales
  FROM public.seller_orders so
  JOIN public.sellers s ON s.id = so.seller_id
  JOIN public.stores st ON st.seller_id = s.id
  WHERE st.id = p_store_id
    AND so.status IN ('delivered', 'paid', 'completed')
    AND so.created_at >= now() - INTERVAL '30 days';

  -- Count unique device views
  SELECT COUNT(*) INTO v_views
  FROM public.store_views
  WHERE store_id = p_store_id;

  RETURN QUERY SELECT v_sales, v_views, (v_sales >= 50 AND v_views >= 5000);
END;
$$;

-- 5. RLS
ALTER TABLE public.store_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;

-- Store views: public can insert (tracking), sellers can read their own
DROP POLICY IF EXISTS store_views_insert ON public.store_views;
CREATE POLICY store_views_insert ON public.store_views FOR INSERT
  WITH CHECK (true);
DROP POLICY IF EXISTS store_views_seller_read ON public.store_views;
CREATE POLICY store_views_seller_read ON public.store_views FOR SELECT
  USING (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.stores st
      JOIN public.sellers s ON s.id = st.seller_id
      WHERE st.id = store_views.store_id
        AND (s.owner_id = auth.uid() OR public.is_active_seller_staff(s.id, auth.uid()))
    )
  );

-- Verification requests: sellers can create/read own, admins can manage
DROP POLICY IF EXISTS verif_req_seller ON public.verification_requests;
CREATE POLICY verif_req_seller ON public.verification_requests FOR ALL
  USING (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.sellers s
      WHERE s.id = verification_requests.seller_id
        AND (s.owner_id = auth.uid() OR public.is_active_seller_staff(s.id, auth.uid()))
    )
  )
  WITH CHECK (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.sellers s
      WHERE s.id = verification_requests.seller_id
        AND (s.owner_id = auth.uid() OR public.is_active_seller_staff(s.id, auth.uid()))
    )
  );
