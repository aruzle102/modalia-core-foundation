-- MODALIA V8 — Sections 27+28: seller shipping config + delivery offices entity.
-- ADDITIVE ONLY. Applies on Supabase / Lovable sync.
--
-- 1) public.seller_shipping_settings — per-seller shipping config (currently
--    just the office-delivery master switch). Stored in a dedicated table
--    (NOT stores.settings: normalizeStoreSettings() drops unknown keys, so a
--    shipping key inside stores.settings would be wiped by Store Studio
--    writes). Absence of a row means defaults: office_enabled = true.
-- 2) public.seller_offices — the seller's pickup points for "office"
--    (desk-pickup) delivery. Checkout reads name/address/phone of ACTIVE
--    offices, so active rows are publicly readable; all writes are
--    owner-or-admin.
--
-- Design notes for Sec 29–32 (checkout):
--   * getSellerOffices({ sellerId, wilayaId }) (src/lib/seller-offices.functions.ts)
--     returns active offices for a seller+wilaya via the public SELECT policy.
--   * office_enabled is consumed server-side: when a seller disables office
--     delivery, setShippingSettings() also flips their office shipping_rules
--     to enabled=false, so the checkout_cart RPC (which only looks at
--     shipping_rules) refuses office checkout with its standard
--     "Delivery is not available…" error. The RPC itself is untouched.
--   * Offices are referenced at checkout-time only via snapshots; no orders
--     table holds an office FK, so hard deletes are safe.

-- ---------------------------------------------------------------------------
-- 1) seller_shipping_settings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.seller_shipping_settings (
  seller_id uuid PRIMARY KEY REFERENCES public.sellers(id) ON DELETE CASCADE,
  office_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.seller_shipping_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "seller_shipping_settings_owner" ON public.seller_shipping_settings;
CREATE POLICY "seller_shipping_settings_owner"
  ON public.seller_shipping_settings
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.sellers s
      WHERE s.id = seller_shipping_settings.seller_id AND s.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.sellers s
      WHERE s.id = seller_shipping_settings.seller_id AND s.owner_id = auth.uid()
    )
  );

DROP TRIGGER IF EXISTS seller_shipping_settings_updated_at ON public.seller_shipping_settings;
CREATE TRIGGER seller_shipping_settings_updated_at
  BEFORE UPDATE ON public.seller_shipping_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2) seller_offices
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.seller_offices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) >= 2 AND char_length(name) <= 120),
  wilaya_id uuid NOT NULL REFERENCES public.wilayas(id),
  commune_id uuid REFERENCES public.communes(id),
  address text CHECK (address IS NULL OR char_length(address) <= 500),
  phone text CHECK (phone IS NULL OR char_length(phone) <= 24),
  -- Plain text opening hours (no structured-hours convention exists in the
  -- codebase; codebase ethos is plain text, never HTML).
  opening_hours text CHECK (opening_hours IS NULL OR char_length(opening_hours) <= 300),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS seller_offices_seller_id_idx ON public.seller_offices (seller_id);
CREATE INDEX IF NOT EXISTS seller_offices_wilaya_active_idx ON public.seller_offices (wilaya_id, active);

ALTER TABLE public.seller_offices ENABLE ROW LEVEL SECURITY;

-- Owner (or super admin) full access. Staff members go through the
-- service-role server functions (requireSeller "store.manage"), same as
-- shipping_rules.
DROP POLICY IF EXISTS "seller_offices_owner" ON public.seller_offices;
CREATE POLICY "seller_offices_owner"
  ON public.seller_offices
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.sellers s
      WHERE s.id = seller_offices.seller_id AND s.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.sellers s
      WHERE s.id = seller_offices.seller_id AND s.owner_id = auth.uid()
    )
  );

-- Public read of ACTIVE offices only: checkout / storefront office pickers
-- need name, address and phone of active offices. Inactive offices and
-- seller_id stay visible only to the owner/admin via the policy above.
DROP POLICY IF EXISTS "seller_offices_public_read" ON public.seller_offices;
CREATE POLICY "seller_offices_public_read"
  ON public.seller_offices
  FOR SELECT TO anon, authenticated
  USING (active = true);

GRANT SELECT ON public.seller_offices TO anon, authenticated;

DROP TRIGGER IF EXISTS seller_offices_updated_at ON public.seller_offices;
CREATE TRIGGER seller_offices_updated_at
  BEFORE UPDATE ON public.seller_offices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
