BEGIN;

-- Replace caller-controlled guest session header policies with server-only cart operations.
DROP POLICY IF EXISTS "anonymous_wishlists_session_owned" ON public.anonymous_wishlists;
DROP POLICY IF EXISTS "carts_guest_session" ON public.carts;
DROP POLICY IF EXISTS "cart_items_guest_session" ON public.cart_items;

-- Restrict role and permission catalogues to verified super administrators.
DROP POLICY IF EXISTS "role_permissions_read" ON public.role_permissions;
CREATE POLICY "role_permissions_super_admin_read"
ON public.role_permissions
FOR SELECT
TO authenticated
USING (public.is_super_admin());

DROP POLICY IF EXISTS "roles_read" ON public.roles;
CREATE POLICY "roles_super_admin_read"
ON public.roles
FOR SELECT
TO authenticated
USING (public.is_super_admin());

DROP POLICY IF EXISTS "permissions_read" ON public.permissions;
CREATE POLICY "permissions_super_admin_read"
ON public.permissions
FOR SELECT
TO authenticated
USING (public.is_super_admin());

-- Keep storefront configuration readable only through narrow, server-side allowlists.
DROP POLICY IF EXISTS "settings_public_read" ON public.site_settings;
CREATE POLICY "settings_public_allowlist_read"
ON public.site_settings
FOR SELECT
TO anon, authenticated
USING (
  key IN (
    'contact_email',
    'contact_phone',
    'contact_address',
    'contact_hours',
    'instagram_url',
    'facebook_url',
    'tiktok_url',
    'whatsapp_number',
    'seo_title',
    'seo_description',
    'seo_keywords',
    'seo_robots_index',
    'analytics_enabled'
  )
);

-- Prevent direct public writes; validated server functions use privileged writes.
DROP POLICY IF EXISTS "partnership_public_insert" ON public.partnership_requests;
DROP POLICY IF EXISTS "problem_reports_public_insert" ON public.problem_reports;

-- The review-images client policy is an explicit deny, not a broad mutable policy.
DROP POLICY IF EXISTS "No direct writes to review images" ON storage.objects;
CREATE POLICY "No direct writes to review images"
ON storage.objects
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

-- Product media is intentionally public only when connected to a public product.
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
    WHERE image.storage_path = storage.objects.name
      AND product.status = 'active'
      AND product.publication_status = 'published'
      AND product.moderation_status = 'approved'
      AND product.visibility = 'public'
  )
);

-- Retain a single, approved-review-only public read path for review images.
DROP POLICY IF EXISTS "Public read access for review images" ON storage.objects;
DROP POLICY IF EXISTS "Review images public for approved reviews" ON storage.objects;
CREATE POLICY "Review images public for approved reviews"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'review-images'
  AND EXISTS (
    SELECT 1
    FROM public.reviews review
    WHERE review.image_path = storage.objects.name
      AND review.moderation_status = 'approved'
  )
);

COMMIT;