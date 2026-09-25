CREATE TYPE public.seller_application_status AS ENUM ('pending', 'approved', 'rejected', 'suspended');
CREATE TYPE public.seller_account_status AS ENUM ('pending', 'active', 'suspended', 'disabled');
CREATE TYPE public.store_verification_status AS ENUM ('unverified', 'verified');
CREATE TYPE public.seller_settlement_status AS ENUM ('pending', 'approved', 'paid', 'rejected', 'cancelled');
CREATE TYPE public.seller_support_status AS ENUM ('open', 'in_progress', 'resolved', 'closed');

CREATE TABLE public.seller_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name text NOT NULL CHECK (char_length(trim(first_name)) BETWEEN 2 AND 100),
  last_name text NOT NULL CHECK (char_length(trim(last_name)) BETWEEN 2 AND 100),
  phone text NOT NULL CHECK (char_length(trim(phone)) BETWEEN 8 AND 30),
  email text NOT NULL CHECK (char_length(trim(email)) BETWEEN 5 AND 255),
  proposed_store_name text NOT NULL CHECK (char_length(trim(proposed_store_name)) BETWEEN 2 AND 160),
  product_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  business_description text NOT NULL CHECK (char_length(trim(business_description)) BETWEEN 20 AND 2000),
  status public.seller_application_status NOT NULL DEFAULT 'pending',
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rejection_reason text,
  admin_notes text,
  seller_id uuid REFERENCES public.sellers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seller_application_reviewed_check CHECK ((status = 'pending' AND reviewed_at IS NULL AND reviewed_by IS NULL) OR status <> 'pending'),
  CONSTRAINT seller_application_rejection_reason_check CHECK (status <> 'rejected' OR rejection_reason IS NOT NULL)
);
GRANT SELECT, INSERT ON public.seller_applications TO authenticated;
GRANT ALL ON public.seller_applications TO service_role;
ALTER TABLE public.seller_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seller_applications_own_read" ON public.seller_applications FOR SELECT TO authenticated USING (applicant_id = auth.uid() OR public.is_super_admin());
CREATE POLICY "seller_applications_create_own" ON public.seller_applications FOR INSERT TO authenticated WITH CHECK (applicant_id = auth.uid() AND status = 'pending' AND reviewed_at IS NULL AND reviewed_by IS NULL AND rejection_reason IS NULL AND admin_notes IS NULL AND seller_id IS NULL);
CREATE INDEX seller_applications_applicant_idx ON public.seller_applications(applicant_id, created_at DESC);
CREATE INDEX seller_applications_review_queue_idx ON public.seller_applications(status, created_at DESC);
CREATE TRIGGER seller_applications_updated_at BEFORE UPDATE ON public.seller_applications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.sellers
  ADD COLUMN first_name text,
  ADD COLUMN last_name text,
  ADD COLUMN phone text,
  ADD COLUMN email text,
  ADD COLUMN account_status public.seller_account_status NOT NULL DEFAULT 'pending',
  ADD COLUMN commission_rate numeric(5,4) NOT NULL DEFAULT 0.1000 CHECK (commission_rate >= 0 AND commission_rate <= 1),
  ADD COLUMN approved_at timestamptz;

ALTER TABLE public.stores
  ADD COLUMN contact_email text,
  ADD COLUMN contact_phone text,
  ADD COLUMN verification_status public.store_verification_status NOT NULL DEFAULT 'unverified',
  ADD COLUMN settings jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE public.seller_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE RESTRICT,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'DZD',
  period_start date,
  period_end date,
  status public.seller_settlement_status NOT NULL DEFAULT 'pending',
  payment_method text,
  payment_reference text,
  payment_proof_path text,
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at timestamptz,
  settled_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seller_settlements_period_check CHECK (period_end IS NULL OR period_start IS NULL OR period_end >= period_start)
);
GRANT SELECT ON public.seller_settlements TO authenticated;
GRANT ALL ON public.seller_settlements TO service_role;
ALTER TABLE public.seller_settlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seller_settlements_isolated_read" ON public.seller_settlements FOR SELECT TO authenticated USING (public.is_super_admin() OR EXISTS (SELECT 1 FROM public.sellers s WHERE s.id = seller_settlements.seller_id AND s.owner_id = auth.uid()));
CREATE INDEX seller_settlements_seller_status_idx ON public.seller_settlements(seller_id, status, created_at DESC);
CREATE TRIGGER seller_settlements_updated_at BEFORE UPDATE ON public.seller_settlements FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.seller_support_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  subject text NOT NULL CHECK (char_length(trim(subject)) BETWEEN 3 AND 200),
  message text NOT NULL CHECK (char_length(trim(message)) BETWEEN 10 AND 4000),
  status public.seller_support_status NOT NULL DEFAULT 'open',
  admin_response text,
  responded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.seller_support_requests TO authenticated;
GRANT ALL ON public.seller_support_requests TO service_role;
ALTER TABLE public.seller_support_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seller_support_requests_isolated" ON public.seller_support_requests FOR SELECT TO authenticated USING (public.is_super_admin() OR EXISTS (SELECT 1 FROM public.sellers s WHERE s.id = seller_support_requests.seller_id AND s.owner_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = seller_support_requests.seller_id AND ss.user_id = auth.uid() AND (ss.permissions ? 'settings.manage')));
CREATE POLICY "seller_support_requests_create" ON public.seller_support_requests FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.sellers s WHERE s.id = seller_support_requests.seller_id AND s.owner_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = seller_support_requests.seller_id AND ss.user_id = auth.uid() AND (ss.permissions ? 'settings.manage')));
CREATE INDEX seller_support_requests_seller_status_idx ON public.seller_support_requests(seller_id, status, created_at DESC);
CREATE TRIGGER seller_support_requests_updated_at BEFORE UPDATE ON public.seller_support_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.seller_can(_seller_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.sellers s WHERE s.id = _seller_id AND s.owner_id = auth.uid() AND s.account_status = 'active')
    OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = _seller_id AND ss.user_id = auth.uid() AND ss.permissions ? _permission);
$$;
REVOKE EXECUTE ON FUNCTION public.seller_can(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seller_can(uuid, text) TO service_role;

DROP POLICY IF EXISTS "seller_owner_or_admin" ON public.sellers;
CREATE POLICY "seller_owner_or_admin" ON public.sellers FOR SELECT TO authenticated USING (owner_id = auth.uid() OR public.is_super_admin() OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = sellers.id AND ss.user_id = auth.uid()));
CREATE POLICY "seller_owner_update" ON public.sellers FOR UPDATE TO authenticated USING (owner_id = auth.uid() OR public.is_super_admin()) WITH CHECK (owner_id = auth.uid() OR public.is_super_admin());

DROP POLICY IF EXISTS "stores_public_active" ON public.stores;
CREATE POLICY "stores_public_active" ON public.stores FOR SELECT TO anon, authenticated USING (status = 'active' OR public.is_super_admin() OR EXISTS (SELECT 1 FROM public.sellers s WHERE s.id = stores.seller_id AND s.owner_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = stores.seller_id AND ss.user_id = auth.uid()));
DROP POLICY IF EXISTS "stores_seller_update" ON public.stores;
CREATE POLICY "stores_seller_update" ON public.stores FOR UPDATE TO authenticated USING (public.is_super_admin() OR EXISTS (SELECT 1 FROM public.sellers s WHERE s.id = stores.seller_id AND s.owner_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = stores.seller_id AND ss.user_id = auth.uid() AND ss.permissions ? 'store.edit')) WITH CHECK (public.is_super_admin() OR EXISTS (SELECT 1 FROM public.sellers s WHERE s.id = stores.seller_id AND s.owner_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = stores.seller_id AND ss.user_id = auth.uid() AND ss.permissions ? 'store.edit'));

DROP POLICY IF EXISTS "products_seller_write" ON public.products;
CREATE POLICY "products_seller_write" ON public.products FOR ALL TO authenticated
USING (
  public.is_super_admin()
  OR EXISTS (SELECT 1 FROM public.sellers s WHERE s.id = products.seller_id AND s.owner_id = auth.uid() AND s.account_status = 'active')
  OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = products.seller_id AND ss.user_id = auth.uid() AND (ss.permissions ? 'products.edit' OR ss.permissions ? 'products.create' OR ss.permissions ? 'products.delete'))
)
WITH CHECK (
  public.is_super_admin()
  OR EXISTS (SELECT 1 FROM public.sellers s WHERE s.id = products.seller_id AND s.owner_id = auth.uid() AND s.account_status = 'active')
  OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = products.seller_id AND ss.user_id = auth.uid() AND (ss.permissions ? 'products.edit' OR ss.permissions ? 'products.create'))
);

CREATE INDEX seller_staff_user_seller_idx ON public.seller_staff(user_id, seller_id);
CREATE INDEX products_seller_store_created_idx ON public.products(seller_id, store_id, created_at DESC);
CREATE INDEX stores_seller_status_idx ON public.stores(seller_id, status);

INSERT INTO public.permissions(key, description) VALUES
 ('products.view', 'View seller products'),
 ('products.create', 'Create seller products'),
 ('products.edit', 'Edit seller products'),
 ('products.delete', 'Delete seller products'),
 ('inventory.view', 'View inventory'),
 ('inventory.edit', 'Edit inventory'),
 ('orders.view', 'View seller orders'),
 ('orders.update', 'Update seller orders'),
 ('analytics.view', 'View seller analytics'),
 ('store.edit', 'Edit store settings'),
 ('discounts.manage', 'Manage discounts'),
 ('staff.manage', 'Manage staff'),
 ('settings.manage', 'Manage seller settings')
ON CONFLICT (key) DO NOTHING;