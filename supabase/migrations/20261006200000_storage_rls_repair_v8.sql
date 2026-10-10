-- MODALIA — V8 Section 57 (Worker D): storage RLS repair.
--
-- FIX #1 (HIGH): 20261006080000_security_hardening.sql:87 used
-- `storage.objects.name #>> '{}'` — the `#>>` operator requires jsonb but
-- `storage.objects.name` is text, so every row evaluated through the
-- "Public can view active product media" policy raised a runtime SQL error
-- (operator does not exist: text #>> unknown).
--
-- The older copy in 20260910001442_4ceee0ca-c043-412f-9769-016618aa128b.sql:24
-- (`image.storage_path = name #>> '{}'`) has the same defect. Both use the
-- same policy name ("Public can view active product media"), so dropping by
-- name repairs both regardless of which migration the database applied.
--
-- The policy is recreated with a plain text comparison:
--   image.storage_path = storage.objects.name
-- keeping the hardened conditions from the Phase 6/6 migration
-- (status + publication_status + moderation_status + visibility).
--
-- Idempotent: guarded by pg_policies checks, so it applies cleanly whether
-- neither, one, or both of the older migrations ran, and is safe to re-run.

BEGIN;

-- 1) Drop the broken policy by name (covers both the original and the
--    hardened definition, which share the name).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public can view active product media'
  ) THEN
    DROP POLICY "Public can view active product media" ON storage.objects;
  END IF;
END $$;

-- 2) Recreate it with a correct text-to-text comparison.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public can view active product media'
  ) THEN
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
  END IF;
END $$;

COMMIT;
