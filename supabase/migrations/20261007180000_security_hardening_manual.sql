-- MODALIA — Security hardening (manual fixes for Lovable Security tab findings)
-- Applied manually per owner instruction (never use Lovable auto-fix).
--
-- Fixed:
-- 1. store_views INSERT: was WITH CHECK (true) allowing fake view injection.
--    Now requires the store to exist and be active.
-- 2. problem-reports storage bucket: was public. Now private (admin-only via signed URLs).
--
-- Intentionally unchanged (false positives for e-commerce):
-- - partnership_requests / problem_reports public INSERT: public contact forms by design.
--   SELECT is admin-only; personal data is never exposed publicly.
-- - carts / cart_items / anonymous_wishlists session policies: guest commerce requires
--   session-token access. Tokens are cryptographically random and unguessable.
-- - review-images bucket public: product review photos are public content by design.

-- Ensure store_views hardening is in place (idempotent)
DROP POLICY IF EXISTS store_views_insert ON public.store_views;
CREATE POLICY store_views_insert ON public.store_views FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_views.store_id
        AND s.status = 'active'
    )
  );

-- Ensure problem-reports bucket is private
UPDATE storage.buckets SET public = false WHERE id = 'problem-reports';
