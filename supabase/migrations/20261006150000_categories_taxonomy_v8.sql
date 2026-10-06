-- Modalia V8 Section 12: category taxonomy extensions (ADDITIVE ONLY).
-- Gives the admin taxonomy UI the merchandising fields it needs:
--   image_url       full https URL of the category hero image (same convention as product media)
--   gender          optional merchandising facet: men | women | kids | unisex
--   featured        surfaced on the public category experience / homepage
--   seo_title       admin-controlled SEO title (falls back to name)
--   seo_description admin-controlled SEO description (falls back to generated copy)
-- Existing rows untouched. Applies on Supabase/Lovable sync.

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS seo_title text,
  ADD COLUMN IF NOT EXISTS seo_description text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'categories_gender_check') THEN
    ALTER TABLE public.categories
      ADD CONSTRAINT categories_gender_check
      CHECK (gender IS NULL OR gender IN ('men', 'women', 'kids', 'unisex'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS categories_featured_idx
  ON public.categories (featured) WHERE featured = true;
