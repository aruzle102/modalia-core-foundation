CREATE OR REPLACE FUNCTION public.media_seller_id(object_name text)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN object_name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
      THEN split_part(object_name, '/', 1)::uuid
    ELSE NULL
  END;
$$;

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
    WHERE image.storage_path = name #>> '{}'
      AND product.status = 'active'
  )
);

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
  )
);

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
  )
);

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
  )
);

REVOKE EXECUTE ON FUNCTION public.media_seller_id(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.media_seller_id(text) TO authenticated, service_role;