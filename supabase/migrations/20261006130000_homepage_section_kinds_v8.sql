-- Extend homepage_section_kind with the V8 homepage section kinds
-- (sport edit, fashion edit, collections, showcase, limited drops,
-- customer reviews, newsletter).
-- Enum values cannot be added inside a transaction, so the type is recreated
-- and the column is switched over with a USING cast instead (same proven
-- pattern as 20261005230100_homepage_section_kinds.sql).
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
  'app_banner',
  'sport_edit',
  'fashion_edit',
  'collections',
  'showcase',
  'limited_drops',
  'customer_reviews',
  'newsletter'
);

ALTER TABLE public.homepage_sections
  ALTER COLUMN kind TYPE public.homepage_section_kind_new
  USING kind::text::public.homepage_section_kind_new;

DROP TYPE public.homepage_section_kind;
ALTER TYPE public.homepage_section_kind_new RENAME TO homepage_section_kind;
