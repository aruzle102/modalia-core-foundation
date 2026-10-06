-- Seed one default (disabled-by-default is FALSE here: enabled = true,
-- empty content means the storefront shows its honest empty state) row per
-- V8 homepage section kind. sort_order 100+ appends after the existing
-- sections. Idempotent: existing section_keys are left untouched.
INSERT INTO public.homepage_sections (section_key, kind, title, sort_order, enabled, content)
VALUES
  ('sport_edit', 'sport_edit', NULL, 100, true, '{}'::jsonb),
  ('fashion_edit', 'fashion_edit', NULL, 101, true, '{}'::jsonb),
  ('collections', 'collections', NULL, 102, true, '{}'::jsonb),
  ('showcase', 'showcase', NULL, 103, true, '{}'::jsonb),
  ('limited_drops', 'limited_drops', NULL, 104, true, '{}'::jsonb),
  ('customer_reviews', 'customer_reviews', NULL, 105, true, '{}'::jsonb),
  ('newsletter', 'newsletter', NULL, 106, true, '{}'::jsonb)
ON CONFLICT (section_key) DO NOTHING;
