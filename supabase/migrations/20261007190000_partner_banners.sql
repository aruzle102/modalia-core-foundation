-- MODALIA — Partner banners (rotating ads)
-- Admin-managed rectangular banners shown at top of homepage.
-- Each banner: image + link + optional title. Displayed in rotation.

CREATE TABLE IF NOT EXISTS public.partner_banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  image_url TEXT NOT NULL,
  link_url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_banners_active ON public.partner_banners(is_active, sort_order);

ALTER TABLE public.partner_banners ENABLE ROW LEVEL SECURITY;

-- Public can read active banners; admin manages all
DROP POLICY IF EXISTS partner_banners_public_read ON public.partner_banners;
CREATE POLICY partner_banners_public_read ON public.partner_banners FOR SELECT
  USING (is_active = true AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at >= now()));
DROP POLICY IF EXISTS partner_banners_admin ON public.partner_banners;
CREATE POLICY partner_banners_admin ON public.partner_banners FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());
