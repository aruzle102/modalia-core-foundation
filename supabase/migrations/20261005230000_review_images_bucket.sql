-- MODALIA FINALIZATION — Phase 5/8 (Customer commerce)
--
-- Public storage bucket for guest/customer review photos. Uploads are ONLY
-- possible through server-minted signed URLs (createReviewImageUpload), so
-- there is no anonymous INSERT policy — anyone with a signed URL can upload
-- to it, which is exactly the intended flow. Public read for approved
-- reviews displayed on product pages.

BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES ('review-images', 'review-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read access for review images" ON storage.objects;
CREATE POLICY "Public read access for review images"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'review-images');

-- Belt and suspenders: even though there is no anon INSERT policy, explicitly
-- block direct inserts/updates/deletes so the signed-URL flow stays the only
-- upload path. Service role bypasses RLS anyway.
DROP POLICY IF EXISTS "No direct writes to review images" ON storage.objects;
CREATE POLICY "No direct writes to review images"
ON storage.objects
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

COMMIT;
