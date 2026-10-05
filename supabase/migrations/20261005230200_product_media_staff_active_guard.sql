-- Modalia security audit (Phase 8/8): harden product-media direct write policies.
--
-- Gap found: the storage.objects INSERT/UPDATE/DELETE policies for the
-- `product-media` bucket (created in 20260910001442) only checked that the
-- caller is listed in `seller_staff` for the seller prefix -- they did NOT
-- check `seller_staff.active`. A deactivated staff member (or staff without
-- media permissions) could still write/delete objects directly through the
-- Supabase Storage API under `<sellerId>/...`, bypassing the fail-closed
-- deactivation enforced in `requireSeller` (src/lib/seller-auth.ts).
--
-- The intended upload path (server-minted signed URLs + magic-bytes
-- validation in finalizeSellerMediaUpload) is unaffected: it uses the
-- service role, which bypasses RLS. These policies only govern the legacy
-- direct-API path, so tightening them cannot break working uploads.
--
-- Fix: direct writes now require an ACTIVE staff row AND the
-- `products.edit` permission (matching the server-side upload flow, which
-- calls requireSeller(..., "products.edit")).

DROP POLICY IF EXISTS "Seller staff can upload own media" ON storage.objects;
CREATE POLICY "Seller staff can upload own media"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'product-media'
  AND public.media_seller_id(name) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.seller_staff staff
    WHERE staff.seller_id = public.media_seller_id(name)
      AND staff.user_id = auth.uid()
      AND staff.active IS NOT FALSE
      AND (staff.permissions ? 'products.edit')
  )
);

DROP POLICY IF EXISTS "Seller staff can update own media" ON storage.objects;
CREATE POLICY "Seller staff can update own media"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'product-media'
  AND public.media_seller_id(name) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.seller_staff staff
    WHERE staff.seller_id = public.media_seller_id(name)
      AND staff.user_id = auth.uid()
      AND staff.active IS NOT FALSE
      AND (staff.permissions ? 'products.edit')
  )
)
WITH CHECK (
  bucket_id = 'product-media'
  AND public.media_seller_id(name) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.seller_staff staff
    WHERE staff.seller_id = public.media_seller_id(name)
      AND staff.user_id = auth.uid()
      AND staff.active IS NOT FALSE
      AND (staff.permissions ? 'products.edit')
  )
);

DROP POLICY IF EXISTS "Seller staff can delete own media" ON storage.objects;
CREATE POLICY "Seller staff can delete own media"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'product-media'
  AND public.media_seller_id(name) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.seller_staff staff
    WHERE staff.seller_id = public.media_seller_id(name)
      AND staff.user_id = auth.uid()
      AND staff.active IS NOT FALSE
      AND (staff.permissions ? 'products.edit')
  )
);
