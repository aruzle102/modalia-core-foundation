-- MODALIA — FINAL REBUILD PROGRAM Phase 6/6
-- Security hardening: surgical RLS policy fixes from the security audit.
--
-- 1) Prevent seller owners from modifying their own commission_rate via
--    direct Supabase REST PATCH (the seller_owner_update RLS policy allows
--    row updates; PostgreSQL RLS has no column-level UPDATE policies, so a
--    trigger enforces the column restriction).
-- 2) Drop the unconditional public-read policy on review-images that
--    defeated the approved-only policy; re-assert approved-only reads.
-- 3) Tighten product-media public reads to fully published/approved/public
--    products (status + publication_status + moderation_status + visibility).
--
-- All changes are additive/defensive: existing legitimate flows (admin
-- service-role writes, approved review reads, published product media)
-- keep working.

BEGIN;

-- ============================================================
-- 1) Commission rate self-modification guard
-- ============================================================
-- sellers.commission_rate must only change via the admin-only
-- updateCommissionRate server function (service role) or a super_admin
-- session. A BEFORE UPDATE trigger is used because PostgreSQL RLS
-- policies cannot restrict individual columns on UPDATE.
CREATE OR REPLACE FUNCTION public.prevent_seller_commission_rate_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.commission_rate IS DISTINCT FROM OLD.commission_rate
     AND auth.uid() IS NOT NULL
     AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only administrators can modify commission_rate'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sellers_commission_rate_guard ON public.sellers;
CREATE TRIGGER sellers_commission_rate_guard
BEFORE UPDATE OF commission_rate ON public.sellers
FOR EACH ROW
EXECUTE FUNCTION public.prevent_seller_commission_rate_change();

-- ============================================================
-- 2) Review images: approved-only public reads
-- ============================================================
-- The unconditional policy below OR-stacked with (and defeated) the
-- approved-only policy from 20261005230000_customer_commerce_reviews_stock.
DROP POLICY IF EXISTS "Public read access for review images" ON storage.objects;

-- Re-assert the approved-only policy (idempotent: the original migration
-- created it, but re-creating here guarantees the fixed state even if that
-- migration was edited or partially applied).
DROP POLICY IF EXISTS "Review images public for approved reviews" ON storage.objects;
CREATE POLICY "Review images public for approved reviews"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'review-images'
  AND EXISTS (
    SELECT 1 FROM public.reviews r
    WHERE r.image_path = storage.objects.name
      AND r.moderation_status = 'approved'
  )
);

-- ============================================================
-- 3) Product media: require fully published products
-- ============================================================
DROP POLICY IF EXISTS "Public can view active product media" ON storage.objects;
CREATE POLICY "Public can view active product media"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'product-media'
  AND EXISTS (
    SELECT 1
    FROM public.product_images image
    JOIN public.products product ON product.id = image.product_id
    WHERE image.storage_path = storage.objects.name #>> '{}'
      AND product.status = 'active'
      AND product.publication_status = 'published'
      AND product.moderation_status = 'approved'
      AND product.visibility = 'public'
  )
);

COMMIT;
