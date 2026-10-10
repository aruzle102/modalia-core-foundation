-- MODALIA — Seller warnings (admin moderation notices)
-- When admin deletes/rejects a product for violation, a warning is recorded
-- and shown to the seller in their dashboard.

CREATE TABLE IF NOT EXISTS public.seller_warnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  action_taken TEXT NOT NULL DEFAULT 'notice' CHECK (action_taken IN ('notice','product_deleted','product_rejected','product_hidden')),
  issued_by UUID,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_seller_warnings_seller ON public.seller_warnings(seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_warnings_issued ON public.seller_warnings(issued_at DESC);

ALTER TABLE public.seller_warnings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS seller_warnings_isolated ON public.seller_warnings;
CREATE POLICY seller_warnings_isolated ON public.seller_warnings FOR ALL
  USING (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.sellers s
      WHERE s.id = seller_warnings.seller_id
        AND (s.owner_id = auth.uid() OR public.is_active_seller_staff(s.id, auth.uid()))
    )
  )
  WITH CHECK (is_super_admin());
