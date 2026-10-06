-- Backfill default rows for the original homepage section kinds so every
-- storefront section is manageable from Admin → Homepage Builder.
-- Idempotent: only inserts a kind when no row of that kind exists yet, so it
-- never duplicates rows an admin already created (section_key stays unique).
INSERT INTO public.homepage_sections (section_key, kind, title, subtitle, content, sort_order, enabled)
SELECT k.key, k.kind::public.homepage_section_kind, NULL, NULL, '{}'::jsonb, k.ord, TRUE
FROM (VALUES
  ('hero',            'hero',             0),
  ('categories',      'categories',       10),
  ('trending',        'trending',         20),
  ('best_sellers',    'best_sellers',     30),
  ('new_arrivals',    'new_arrivals',     40),
  ('flash_sale',      'flash_sale',       50),
  ('stores',          'stores',           60),
  ('recommendations', 'recommendations',  70),
  ('editorial',       'editorial',        80),
  ('blog',            'blog',             90),
  ('app_banner',      'app_banner',       95)
) AS k(key, kind, ord)
WHERE NOT EXISTS (
  SELECT 1 FROM public.homepage_sections s WHERE s.kind = k.kind::public.homepage_section_kind
)
ON CONFLICT (section_key) DO NOTHING;
