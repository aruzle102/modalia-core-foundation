-- MODALIA FINALIZATION — Phase 5/8 (Complete Customer Commerce Experience)
--
-- 1) `review-images` storage bucket for guest/customer review photos.
--    Uploads go through signed upload URLs minted by the public
--    createReviewImageUpload server function (service role); browsers never
--    write directly. Objects are world-readable only once the linked review is
--    approved, mirroring the product-media pattern. Paths are
--    `reviews/<productId>/<uuid>.<ext>` (unguessable).
-- 2) `back_in_stock_subscriptions.unsubscribe_token` so guests can cancel
--    their own "notify me" subscription without an account, plus partial
--    unique indexes so subscribe calls are idempotent per contact.

BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES ('review-images', 'review-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Review images public for approved reviews" ON storage.objects;
CREATE POLICY "Review images public for approved reviews"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'review-images'
  AND EXISTS (
    SELECT 1 FROM public.reviews r
    WHERE r.image_path = name
      AND r.moderation_status = 'approved'
  )
);

DROP POLICY IF EXISTS "No direct uploads to review-images" ON storage.objects;
-- There is intentionally no INSERT policy for review-images: uploads are
-- issued through signed URLs by createReviewImageUpload (service role).
-- Service role bypasses RLS.

ALTER TABLE public.back_in_stock_subscriptions
  ADD COLUMN IF NOT EXISTS unsubscribe_token text UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex');

UPDATE public.back_in_stock_subscriptions
SET unsubscribe_token = encode(gen_random_bytes(16), 'hex')
WHERE unsubscribe_token IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS back_in_stock_customer_variant_uidx
  ON public.back_in_stock_subscriptions (variant_id, customer_id)
  WHERE customer_id IS NOT NULL AND notified_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS back_in_stock_email_variant_uidx
  ON public.back_in_stock_subscriptions (variant_id, lower(email))
  WHERE email IS NOT NULL AND notified_at IS NULL;

COMMIT;
