-- Seller application lifecycle: add `under_review` and `converted` to
-- public.seller_application_status.
--
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block, so the enum
-- is rebuilt transaction-safely via a new type instead.
--
-- Lifecycle: pending -> under_review -> approved -> converted
--                                   \-> rejected
-- (rejected applications may be reopened to under_review by an admin;
--  suspended remains available for abuse/fraud holds.)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'seller_application_status'
      AND e.enumlabel = 'under_review'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'seller_application_status'
      AND e.enumlabel = 'converted'
  ) THEN
    CREATE TYPE public.seller_application_status_new AS ENUM (
      'pending',
      'under_review',
      'approved',
      'rejected',
      'converted',
      'suspended'
    );

    ALTER TABLE public.seller_applications
      ALTER COLUMN status TYPE public.seller_application_status_new
      USING status::text::public.seller_application_status_new;

    DROP TYPE public.seller_application_status;
    ALTER TYPE public.seller_application_status_new
      RENAME TO seller_application_status;
  END IF;
END
$$;
