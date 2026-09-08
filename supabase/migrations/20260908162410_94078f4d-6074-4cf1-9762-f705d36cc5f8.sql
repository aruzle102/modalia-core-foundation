CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE public.app_role AS ENUM ('customer', 'seller_owner', 'seller_staff', 'super_admin');
CREATE TYPE public.store_status AS ENUM ('draft', 'active', 'suspended', 'closed');
CREATE TYPE public.product_status AS ENUM ('draft', 'active', 'archived');
CREATE TYPE public.order_status AS ENUM ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded');
CREATE TYPE public.seller_order_status AS ENUM ('pending', 'accepted', 'processing', 'fulfilled', 'cancelled', 'refunded');

CREATE TABLE public.profiles (id uuid PRIMARY KEY, display_name text, phone text, preferred_locale text NOT NULL DEFAULT 'fr-DZ', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_own" ON public.profiles FOR ALL TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE TABLE public.roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key public.app_role NOT NULL UNIQUE, label text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.roles TO authenticated;
GRANT ALL ON public.roles TO service_role;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roles_read" ON public.roles FOR SELECT TO authenticated USING (true);

CREATE TABLE public.permissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key text NOT NULL UNIQUE, description text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.permissions TO authenticated;
GRANT ALL ON public.permissions TO service_role;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "permissions_read" ON public.permissions FOR SELECT TO authenticated USING (true);

CREATE TABLE public.role_permissions (role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE, permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE, PRIMARY KEY (role_id, permission_id));
GRANT SELECT ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "role_permissions_read" ON public.role_permissions FOR SELECT TO authenticated USING (true);

CREATE TABLE public.user_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, role public.app_role NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (user_id, role));
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles_own_read" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role); $$;
CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT public.has_role(auth.uid(), 'super_admin'); $$;

CREATE TABLE public.sellers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL, legal_name text NOT NULL, status public.store_status NOT NULL DEFAULT 'draft', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(owner_id));
GRANT SELECT, INSERT, UPDATE ON public.sellers TO authenticated;
GRANT ALL ON public.sellers TO service_role;
ALTER TABLE public.sellers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seller_owner_or_admin" ON public.sellers FOR ALL TO authenticated USING (owner_id = auth.uid() OR public.is_super_admin()) WITH CHECK (owner_id = auth.uid() OR public.is_super_admin());

CREATE TABLE public.stores (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), seller_id uuid NOT NULL UNIQUE REFERENCES public.sellers(id) ON DELETE CASCADE, slug text NOT NULL UNIQUE, name text NOT NULL, description text, logo_path text, banner_path text, status public.store_status NOT NULL DEFAULT 'draft', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.stores TO anon, authenticated;
GRANT INSERT, UPDATE ON public.stores TO authenticated;
GRANT ALL ON public.stores TO service_role;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stores_public_active" ON public.stores FOR SELECT TO anon, authenticated USING (status = 'active' OR public.is_super_admin() OR EXISTS (SELECT 1 FROM public.sellers WHERE sellers.id = stores.seller_id AND sellers.owner_id = auth.uid()));
CREATE POLICY "stores_seller_write" ON public.stores FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.sellers WHERE sellers.id = seller_id AND sellers.owner_id = auth.uid()) OR public.is_super_admin());
CREATE POLICY "stores_seller_update" ON public.stores FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.sellers WHERE sellers.id = seller_id AND sellers.owner_id = auth.uid()) OR public.is_super_admin());

CREATE TABLE public.seller_staff (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE, user_id uuid NOT NULL, role public.app_role NOT NULL DEFAULT 'seller_staff', permissions jsonb NOT NULL DEFAULT '[]'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (seller_id, user_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seller_staff TO authenticated;
GRANT ALL ON public.seller_staff TO service_role;
ALTER TABLE public.seller_staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seller_staff_isolated" ON public.seller_staff FOR ALL TO authenticated USING (public.is_super_admin() OR EXISTS (SELECT 1 FROM public.sellers WHERE sellers.id = seller_staff.seller_id AND sellers.owner_id = auth.uid()) OR user_id = auth.uid()) WITH CHECK (public.is_super_admin() OR EXISTS (SELECT 1 FROM public.sellers WHERE sellers.id = seller_staff.seller_id AND sellers.owner_id = auth.uid()));

CREATE TABLE public.categories (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), parent_id uuid REFERENCES public.categories(id) ON DELETE SET NULL, slug text NOT NULL UNIQUE, name jsonb NOT NULL, status text NOT NULL DEFAULT 'active', sort_order integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories_public_read" ON public.categories FOR SELECT TO anon, authenticated USING (status = 'active' OR public.is_super_admin());

CREATE TABLE public.brands (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text NOT NULL UNIQUE, name text NOT NULL, status text NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.brands TO anon, authenticated;
GRANT ALL ON public.brands TO service_role;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brands_public_read" ON public.brands FOR SELECT TO anon, authenticated USING (status = 'active' OR public.is_super_admin());

CREATE TABLE public.products (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE RESTRICT, category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL, brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL, slug text NOT NULL UNIQUE, name jsonb NOT NULL, description jsonb, status public.product_status NOT NULL DEFAULT 'draft', currency text NOT NULL DEFAULT 'DZD', base_price numeric(14,2) NOT NULL CHECK (base_price >= 0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.products TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products_public_or_owner" ON public.products FOR SELECT TO anon, authenticated USING (status = 'active' OR public.is_super_admin() OR EXISTS (SELECT 1 FROM public.sellers WHERE sellers.id = products.seller_id AND sellers.owner_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.seller_staff WHERE seller_staff.seller_id = products.seller_id AND seller_staff.user_id = auth.uid()));
CREATE POLICY "products_seller_write" ON public.products FOR ALL TO authenticated USING (public.is_super_admin() OR EXISTS (SELECT 1 FROM public.sellers WHERE sellers.id = products.seller_id AND sellers.owner_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.seller_staff WHERE seller_staff.seller_id = products.seller_id AND seller_staff.user_id = auth.uid())) WITH CHECK (public.is_super_admin() OR EXISTS (SELECT 1 FROM public.sellers WHERE sellers.id = products.seller_id AND sellers.owner_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.seller_staff WHERE seller_staff.seller_id = products.seller_id AND seller_staff.user_id = auth.uid()));

CREATE TABLE public.product_variants (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE, sku text NOT NULL UNIQUE, attributes jsonb NOT NULL DEFAULT '{}'::jsonb, price numeric(14,2), status text NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.product_variants TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_variants TO authenticated;
GRANT ALL ON public.product_variants TO service_role;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "variants_catalog_or_owner" ON public.product_variants FOR SELECT TO anon, authenticated USING (EXISTS (SELECT 1 FROM public.products WHERE products.id = product_variants.product_id AND (products.status = 'active' OR public.is_super_admin() OR EXISTS (SELECT 1 FROM public.sellers WHERE sellers.id = products.seller_id AND sellers.owner_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.seller_staff WHERE seller_staff.seller_id = products.seller_id AND seller_staff.user_id = auth.uid()))));
CREATE POLICY "variants_seller_write" ON public.product_variants FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.products JOIN public.sellers ON sellers.id = products.seller_id WHERE products.id = product_variants.product_id AND (sellers.owner_id = auth.uid() OR public.is_super_admin()))) WITH CHECK (EXISTS (SELECT 1 FROM public.products JOIN public.sellers ON sellers.id = products.seller_id WHERE products.id = product_variants.product_id AND (sellers.owner_id = auth.uid() OR public.is_super_admin())));

CREATE TABLE public.product_images (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE, storage_path text NOT NULL, alt_text jsonb, sort_order integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.product_images TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_images TO authenticated;
GRANT ALL ON public.product_images TO service_role;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "images_catalog_or_owner" ON public.product_images FOR SELECT TO anon, authenticated USING (EXISTS (SELECT 1 FROM public.products WHERE products.id = product_images.product_id AND (products.status = 'active' OR public.is_super_admin() OR EXISTS (SELECT 1 FROM public.sellers WHERE sellers.id = products.seller_id AND sellers.owner_id = auth.uid()))));
CREATE POLICY "images_seller_write" ON public.product_images FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.products JOIN public.sellers ON sellers.id = products.seller_id WHERE products.id = product_images.product_id AND (sellers.owner_id = auth.uid() OR public.is_super_admin()))) WITH CHECK (EXISTS (SELECT 1 FROM public.products JOIN public.sellers ON sellers.id = products.seller_id WHERE products.id = product_images.product_id AND (sellers.owner_id = auth.uid() OR public.is_super_admin())));

CREATE TABLE public.inventory (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), variant_id uuid NOT NULL UNIQUE REFERENCES public.product_variants(id) ON DELETE CASCADE, quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0), reserved_quantity integer NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE ON public.inventory TO authenticated;
GRANT ALL ON public.inventory TO service_role;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inventory_seller_only" ON public.inventory FOR ALL TO authenticated USING (public.is_super_admin() OR EXISTS (SELECT 1 FROM public.product_variants JOIN public.products ON products.id = product_variants.product_id JOIN public.sellers ON sellers.id = products.seller_id WHERE product_variants.id = inventory.variant_id AND sellers.owner_id = auth.uid())) WITH CHECK (public.is_super_admin() OR EXISTS (SELECT 1 FROM public.product_variants JOIN public.products ON products.id = product_variants.product_id JOIN public.sellers ON sellers.id = products.seller_id WHERE product_variants.id = inventory.variant_id AND sellers.owner_id = auth.uid()));

CREATE TABLE public.customers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), profile_id uuid UNIQUE REFERENCES public.profiles(id) ON DELETE SET NULL, email text, phone text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customers_own" ON public.customers FOR ALL TO authenticated USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());

CREATE TABLE public.carts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE, session_token text UNIQUE, currency text NOT NULL DEFAULT 'DZD', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), CHECK (customer_id IS NOT NULL OR session_token IS NOT NULL));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.carts TO anon, authenticated;
GRANT ALL ON public.carts TO service_role;
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "carts_customer_own" ON public.carts FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.customers WHERE customers.id = carts.customer_id AND customers.profile_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.customers WHERE customers.id = carts.customer_id AND customers.profile_id = auth.uid()));

CREATE TABLE public.cart_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cart_id uuid NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE, variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT, quantity integer NOT NULL CHECK (quantity > 0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (cart_id, variant_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cart_items TO authenticated;
GRANT ALL ON public.cart_items TO service_role;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cart_items_owner" ON public.cart_items FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.carts JOIN public.customers ON customers.id = carts.customer_id WHERE carts.id = cart_items.cart_id AND customers.profile_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.carts JOIN public.customers ON customers.id = carts.customer_id WHERE carts.id = cart_items.cart_id AND customers.profile_id = auth.uid()));

CREATE TABLE public.orders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_number text NOT NULL UNIQUE, customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL, guest_email text, guest_phone text, currency text NOT NULL DEFAULT 'DZD', status public.order_status NOT NULL DEFAULT 'pending', subtotal numeric(14,2) NOT NULL DEFAULT 0, shipping_total numeric(14,2) NOT NULL DEFAULT 0, discount_total numeric(14,2) NOT NULL DEFAULT 0, grand_total numeric(14,2) NOT NULL DEFAULT 0, shipping_address jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_customer_or_admin" ON public.orders FOR SELECT TO authenticated USING (public.is_super_admin() OR EXISTS (SELECT 1 FROM public.customers WHERE customers.id = orders.customer_id AND customers.profile_id = auth.uid()));

CREATE TABLE public.seller_orders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE, seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE RESTRICT, status public.seller_order_status NOT NULL DEFAULT 'pending', subtotal numeric(14,2) NOT NULL DEFAULT 0, shipping_total numeric(14,2) NOT NULL DEFAULT 0, commission_total numeric(14,2) NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (order_id, seller_id));
GRANT SELECT ON public.seller_orders TO authenticated;
GRANT ALL ON public.seller_orders TO service_role;
ALTER TABLE public.seller_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seller_orders_isolated" ON public.seller_orders FOR SELECT TO authenticated USING (public.is_super_admin() OR EXISTS (SELECT 1 FROM public.sellers WHERE sellers.id = seller_orders.seller_id AND sellers.owner_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.orders JOIN public.customers ON customers.id = orders.customer_id WHERE orders.id = seller_orders.order_id AND customers.profile_id = auth.uid()));

CREATE TABLE public.order_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), seller_order_id uuid NOT NULL REFERENCES public.seller_orders(id) ON DELETE CASCADE, product_id uuid REFERENCES public.products(id) ON DELETE SET NULL, variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL, title jsonb NOT NULL, sku text, unit_price numeric(14,2) NOT NULL, quantity integer NOT NULL CHECK (quantity > 0), total numeric(14,2) NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_items_visible_with_seller_order" ON public.order_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.seller_orders WHERE seller_orders.id = order_items.seller_order_id AND (public.is_super_admin() OR EXISTS (SELECT 1 FROM public.sellers WHERE sellers.id = seller_orders.seller_id AND sellers.owner_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.orders JOIN public.customers ON customers.id = orders.customer_id WHERE orders.id = seller_orders.order_id AND customers.profile_id = auth.uid()))));

CREATE TABLE public.reviews (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE, customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL, rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5), body text, status text NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.reviews TO anon, authenticated;
GRANT INSERT, UPDATE ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reviews_public_approved" ON public.reviews FOR SELECT TO anon, authenticated USING (status = 'approved' OR public.is_super_admin() OR EXISTS (SELECT 1 FROM public.customers WHERE customers.id = reviews.customer_id AND customers.profile_id = auth.uid()));
CREATE POLICY "reviews_own_create" ON public.reviews FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.customers WHERE customers.id = customer_id AND customers.profile_id = auth.uid()));
CREATE POLICY "reviews_own_update" ON public.reviews FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.customers WHERE customers.id = reviews.customer_id AND customers.profile_id = auth.uid()));

CREATE TABLE public.wishlists (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE, product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (customer_id, product_id));
GRANT SELECT, INSERT, DELETE ON public.wishlists TO authenticated;
GRANT ALL ON public.wishlists TO service_role;
ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wishlists_own" ON public.wishlists FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.customers WHERE customers.id = wishlists.customer_id AND customers.profile_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.customers WHERE customers.id = wishlists.customer_id AND customers.profile_id = auth.uid()));

CREATE TABLE public.coupons (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), seller_id uuid REFERENCES public.sellers(id) ON DELETE CASCADE, code text NOT NULL UNIQUE, discount_type text NOT NULL, discount_value numeric(14,2) NOT NULL CHECK (discount_value >= 0), starts_at timestamptz, ends_at timestamptz, usage_limit integer, status text NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupons TO authenticated;
GRANT ALL ON public.coupons TO service_role;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coupons_seller_or_admin" ON public.coupons FOR ALL TO authenticated USING (public.is_super_admin() OR EXISTS (SELECT 1 FROM public.sellers WHERE sellers.id = coupons.seller_id AND sellers.owner_id = auth.uid())) WITH CHECK (public.is_super_admin() OR EXISTS (SELECT 1 FROM public.sellers WHERE sellers.id = coupons.seller_id AND sellers.owner_id = auth.uid()));

CREATE TABLE public.wilayas (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE, name jsonb NOT NULL, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.wilayas TO anon, authenticated;
GRANT ALL ON public.wilayas TO service_role;
ALTER TABLE public.wilayas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wilayas_public_read" ON public.wilayas FOR SELECT TO anon, authenticated USING (active OR public.is_super_admin());

CREATE TABLE public.communes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), wilaya_id uuid NOT NULL REFERENCES public.wilayas(id) ON DELETE CASCADE, code text NOT NULL UNIQUE, name jsonb NOT NULL, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.communes TO anon, authenticated;
GRANT ALL ON public.communes TO service_role;
ALTER TABLE public.communes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "communes_public_read" ON public.communes FOR SELECT TO anon, authenticated USING (active OR public.is_super_admin());

CREATE TABLE public.shipping_rules (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), seller_id uuid REFERENCES public.sellers(id) ON DELETE CASCADE, wilaya_id uuid REFERENCES public.wilayas(id) ON DELETE SET NULL, commune_id uuid REFERENCES public.communes(id) ON DELETE SET NULL, delivery_method text NOT NULL, price numeric(14,2) NOT NULL CHECK (price >= 0), status text NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shipping_rules TO authenticated;
GRANT ALL ON public.shipping_rules TO service_role;
ALTER TABLE public.shipping_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shipping_rules_seller_or_admin" ON public.shipping_rules FOR ALL TO authenticated USING (public.is_super_admin() OR EXISTS (SELECT 1 FROM public.sellers WHERE sellers.id = shipping_rules.seller_id AND sellers.owner_id = auth.uid())) WITH CHECK (public.is_super_admin() OR EXISTS (SELECT 1 FROM public.sellers WHERE sellers.id = shipping_rules.seller_id AND sellers.owner_id = auth.uid()));

CREATE TABLE public.notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, type text NOT NULL, title jsonb NOT NULL, body jsonb, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_own" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notifications_own_update" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.audit_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid, action text NOT NULL, resource text NOT NULL, resource_id uuid, metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_logs_admin_only" ON public.audit_logs FOR SELECT TO authenticated USING (public.is_super_admin());

CREATE TABLE public.site_settings (key text PRIMARY KEY, value jsonb NOT NULL, updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.site_settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.site_settings TO authenticated;
GRANT ALL ON public.site_settings TO service_role;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings_public_read" ON public.site_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "settings_admin_write" ON public.site_settings FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE INDEX products_seller_id_idx ON public.products(seller_id);
CREATE INDEX products_category_id_idx ON public.products(category_id);
CREATE INDEX products_status_idx ON public.products(status);
CREATE INDEX product_variants_product_id_idx ON public.product_variants(product_id);
CREATE INDEX product_images_product_id_idx ON public.product_images(product_id);
CREATE INDEX seller_orders_seller_id_idx ON public.seller_orders(seller_id);
CREATE INDEX seller_orders_order_id_idx ON public.seller_orders(order_id);
CREATE INDEX order_items_seller_order_id_idx ON public.order_items(seller_order_id);
CREATE INDEX carts_customer_id_idx ON public.carts(customer_id);
CREATE INDEX notifications_user_id_idx ON public.notifications(user_id);
CREATE INDEX audit_logs_resource_idx ON public.audit_logs(resource, resource_id);
CREATE INDEX communes_wilaya_id_idx ON public.communes(wilaya_id);

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER sellers_updated_at BEFORE UPDATE ON public.sellers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER stores_updated_at BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER brands_updated_at BEFORE UPDATE ON public.brands FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER product_variants_updated_at BEFORE UPDATE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER carts_updated_at BEFORE UPDATE ON public.carts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER cart_items_updated_at BEFORE UPDATE ON public.cart_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER seller_orders_updated_at BEFORE UPDATE ON public.seller_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER reviews_updated_at BEFORE UPDATE ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER coupons_updated_at BEFORE UPDATE ON public.coupons FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER wilayas_updated_at BEFORE UPDATE ON public.wilayas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER communes_updated_at BEFORE UPDATE ON public.communes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER shipping_rules_updated_at BEFORE UPDATE ON public.shipping_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();