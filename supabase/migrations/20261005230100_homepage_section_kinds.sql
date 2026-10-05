-- Extend homepage_section_kind with the new editorial section kinds used by
-- the redesigned storefront (editorial campaign, journal/blog, app banner).
-- Enum values cannot be added inside a transaction, so the type is recreated
-- and the column is switched over with a USING cast instead.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'homepage_section_kind'
      AND typnamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION 'public.homepage_section_kind does not exist';
  END IF;
END $$;

CREATE TYPE public.homepage_section_kind_new AS ENUM (
  'hero',
  'categories',
  'trending',
  'best_sellers',
  'new_arrivals',
  'flash_sale',
  'stores',
  'recommendations',
  'editorial',
  'blog',
  'app_banner'
);

ALTER TABLE public.homepage_sections
  ALTER COLUMN kind TYPE public.homepage_section_kind_new
  USING kind::text::public.homepage_section_kind_new;

DROP TYPE public.homepage_section_kind;
ALTER TYPE public.homepage_section_kind_new RENAME TO homepage_section_kind;
