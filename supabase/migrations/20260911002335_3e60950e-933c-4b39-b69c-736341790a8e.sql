CREATE TYPE public.homepage_section_kind AS ENUM ('hero', 'categories', 'trending', 'best_sellers', 'new_arrivals', 'flash_sale', 'stores', 'recommendations');
CREATE TYPE public.discovery_event_kind AS ENUM ('product_view', 'category_view', 'search', 'wishlist', 'cart');

CREATE TABLE public.homepage_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key text NOT NULL UNIQUE,
  kind public.homepage_section_kind NOT NULL,
  title jsonb,
  subtitle jsonb,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  animation jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.homepage_sections TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.homepage_sections TO authenticated;
GRANT ALL ON public.homepage_sections TO service_role;
ALTER TABLE public.homepage_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "homepage_sections_public_visible" ON public.homepage_sections FOR SELECT TO anon, authenticated USING (enabled AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now()) OR public.is_super_admin());
CREATE POLICY "homepage_sections_admin_manage" ON public.homepage_sections FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE TABLE public.discovery_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name jsonb NOT NULL,
  description jsonb,
  media jsonb NOT NULL DEFAULT '{}'::jsonb,
  cta jsonb NOT NULL DEFAULT '{}'::jsonb,
  product_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  category_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  store_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.discovery_campaigns TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.discovery_campaigns TO authenticated;
GRANT ALL ON public.discovery_campaigns TO service_role;
ALTER TABLE public.discovery_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaigns_public_live" ON public.discovery_campaigns FOR SELECT TO anon, authenticated USING ((status = 'active' AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now())) OR public.is_super_admin());
CREATE POLICY "campaigns_admin_manage" ON public.discovery_campaigns FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE TABLE public.product_discovery_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  placement text NOT NULL,
  badge text,
  priority integer NOT NULL DEFAULT 0,
  starts_at timestamptz,
  ends_at timestamptz,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, placement)
);
GRANT SELECT ON public.product_discovery_overrides TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_discovery_overrides TO authenticated;
GRANT ALL ON public.product_discovery_overrides TO service_role;
ALTER TABLE public.product_discovery_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "overrides_public_live" ON public.product_discovery_overrides FOR SELECT TO anon, authenticated USING ((enabled AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now())) OR public.is_super_admin());
CREATE POLICY "overrides_admin_manage" ON public.product_discovery_overrides FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE TABLE public.discovery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid,
  profile_id uuid,
  event_kind public.discovery_event_kind NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  query text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.discovery_events TO anon, authenticated;
GRANT SELECT ON public.discovery_events TO authenticated;
GRANT ALL ON public.discovery_events TO service_role;
ALTER TABLE public.discovery_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events_public_contribute" ON public.discovery_events FOR INSERT TO anon, authenticated WITH CHECK (profile_id IS NULL OR profile_id = auth.uid());
CREATE POLICY "events_admin_read" ON public.discovery_events FOR SELECT TO authenticated USING (public.is_super_admin());

CREATE INDEX homepage_sections_visible_idx ON public.homepage_sections(enabled, sort_order);
CREATE INDEX discovery_campaigns_live_idx ON public.discovery_campaigns(status, starts_at, ends_at);
CREATE INDEX discovery_events_rank_idx ON public.discovery_events(event_kind, occurred_at DESC);
CREATE INDEX discovery_events_product_idx ON public.discovery_events(product_id, occurred_at DESC);
CREATE INDEX discovery_overrides_placement_idx ON public.product_discovery_overrides(placement, enabled, priority DESC);

CREATE TRIGGER homepage_sections_updated_at BEFORE UPDATE ON public.homepage_sections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER discovery_campaigns_updated_at BEFORE UPDATE ON public.discovery_campaigns FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER discovery_overrides_updated_at BEFORE UPDATE ON public.product_discovery_overrides FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();