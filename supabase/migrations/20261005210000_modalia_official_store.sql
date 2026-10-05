-- MODALIA FINALIZATION — Phase 4/8, worker 1/4: Official Modalia Store.
--
-- Creates the platform-owned official store:
--   * slug = 'modalia'
--   * stores.settings.official = true  (consumed by admin-ops getOfficialStore via
--     .contains("settings", { official: true }))
--   * verification_status = 'verified'  (drives the blue VerifiedBadge on the storefront)
--   * status = 'active' so getStoreDetail serves it publicly
--
-- Ownership: stores.seller_id is NOT NULL, so the store is attached to a dedicated
-- platform "system" seller (self-owned, commission 0) rather than a NULL or a
-- real merchant. Fixed UUIDs keep the row stable across environments.
--
-- Brand rule: the name "Modalia" is never translated — it stays "Modalia Official
-- Store" in every locale.
--
-- Idempotent: safe to re-run; existing rows keep their merchandising settings and
-- only gain official=true / verified / active.

DO $$
DECLARE
  system_seller_id uuid := '11111111-1111-1111-1111-111111111111';
  official_store_id uuid := '22222222-2222-2222-2222-222222222222';
  default_settings jsonb := '{
    "official": true,
    "accent": "ink",
    "featured_product_ids": [],
    "featured_category_ids": [],
    "sections": [
      {"id": "featured", "kind": "featured", "title": {"fr": "Sélection", "en": "Featured picks", "ar": "مختارات"}, "enabled": true},
      {"id": "categories", "kind": "categories", "title": {"fr": "Catégories", "en": "Categories", "ar": "الفئات"}, "enabled": true},
      {"id": "new", "kind": "new", "title": {"fr": "Nouveautés", "en": "New arrivals", "ar": "وصل حديثاً"}, "enabled": true},
      {"id": "offers", "kind": "offers", "title": {"fr": "Offres", "en": "Special offers", "ar": "العروض"}, "enabled": true},
      {"id": "best", "kind": "best", "title": {"fr": "Meilleures ventes", "en": "Best sellers", "ar": "الأكثر مبيعاً"}, "enabled": true}
    ],
    "announcement": {"fr": "", "en": "", "ar": ""}
  }'::jsonb;
BEGIN
  -- Platform system seller (owner = itself; no real merchant behind it).
  INSERT INTO public.sellers (id, owner_id, legal_name, status, account_status, commission_rate, approved_at)
  VALUES (system_seller_id, system_seller_id, 'Modalia', 'active', 'active', 0, now())
  ON CONFLICT (id) DO UPDATE SET
    legal_name = EXCLUDED.legal_name,
    status = 'active',
    account_status = 'active',
    updated_at = now();

  -- The official store.
  INSERT INTO public.stores (id, seller_id, slug, name, description, status, verification_status, settings)
  VALUES (
    official_store_id,
    system_seller_id,
    'modalia',
    'Modalia Official Store',
    'The official Modalia store: the platform''s own curated picks, with cash on delivery across Algeria.',
    'active',
    'verified',
    default_settings
  )
  ON CONFLICT (slug) DO UPDATE SET
    verification_status = 'verified',
    status = 'active',
    settings = COALESCE(public.stores.settings, '{}'::jsonb) || '{"official": true}'::jsonb,
    updated_at = now();
END $$;
