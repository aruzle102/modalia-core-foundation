ALTER TABLE public.products
  ADD COLUMN store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  ADD COLUMN short_description jsonb,
  ADD COLUMN sku text,
  ADD COLUMN barcode text,
  ADD COLUMN compare_at_price numeric(14,2),
  ADD COLUMN cost_price numeric(14,2),
  ADD COLUMN publication_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN moderation_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN visibility text NOT NULL DEFAULT 'private',
  ADD COLUMN featured boolean NOT NULL DEFAULT false,
  ADD COLUMN published_at timestamptz,
  ADD COLUMN weight_grams integer,
  ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.products
  ADD CONSTRAINT products_price_comparison_check CHECK (compare_at_price IS NULL OR compare_at_price >= 0),
  ADD CONSTRAINT products_cost_price_check CHECK (cost_price IS NULL OR cost_price >= 0),
  ADD CONSTRAINT products_weight_grams_check CHECK (weight_grams IS NULL OR weight_grams > 0),
  ADD CONSTRAINT products_publication_status_check CHECK (publication_status IN ('draft', 'pending_review', 'approved', 'published', 'hidden', 'rejected', 'archived', 'out_of_stock')),
  ADD CONSTRAINT products_moderation_status_check CHECK (moderation_status IN ('pending', 'approved', 'rejected')),
  ADD CONSTRAINT products_visibility_check CHECK (visibility IN ('public', 'hidden', 'private'));

ALTER TABLE public.product_variants
  ADD COLUMN barcode text,
  ADD COLUMN compare_at_price numeric(14,2),
  ADD COLUMN available boolean NOT NULL DEFAULT true,
  ADD COLUMN weight_grams integer,
  ADD COLUMN image_id uuid,
  ADD COLUMN sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE public.product_variants
  ADD CONSTRAINT product_variants_compare_at_price_check CHECK (compare_at_price IS NULL OR compare_at_price >= 0),
  ADD CONSTRAINT product_variants_weight_grams_check CHECK (weight_grams IS NULL OR weight_grams > 0);

ALTER TABLE public.inventory
  ADD COLUMN low_stock_threshold integer NOT NULL DEFAULT 3,
  ADD COLUMN max_purchase_quantity integer;
ALTER TABLE public.inventory
  ADD CONSTRAINT inventory_low_stock_threshold_check CHECK (low_stock_threshold >= 0),
  ADD CONSTRAINT inventory_max_purchase_quantity_check CHECK (max_purchase_quantity IS NULL OR max_purchase_quantity > 0),
  ADD CONSTRAINT inventory_reservation_check CHECK (reserved_quantity <= quantity);

ALTER TABLE public.product_images
  ADD COLUMN variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  ADD COLUMN color_id uuid,
  ADD COLUMN is_primary boolean NOT NULL DEFAULT false,
  ADD COLUMN media_type text NOT NULL DEFAULT 'image',
  ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.product_images
  ADD CONSTRAINT product_images_media_type_check CHECK (media_type IN ('image', 'model_3d'));

CREATE TABLE public.size_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name jsonb NOT NULL,
  applies_to text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.size_groups TO anon, authenticated;
GRANT ALL ON public.size_groups TO service_role;
ALTER TABLE public.size_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "size_groups_public_read" ON public.size_groups FOR SELECT TO anon, authenticated USING (active OR public.is_super_admin());

CREATE TABLE public.sizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  size_group_id uuid NOT NULL REFERENCES public.size_groups(id) ON DELETE CASCADE,
  value text NOT NULL,
  label jsonb NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(size_group_id, value)
);
GRANT SELECT ON public.sizes TO anon, authenticated;
GRANT ALL ON public.sizes TO service_role;
ALTER TABLE public.sizes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sizes_public_read" ON public.sizes FOR SELECT TO anon, authenticated USING (active OR public.is_super_admin());

CREATE TABLE public.colors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name jsonb NOT NULL,
  hex_value text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT colors_hex_value_check CHECK (hex_value IS NULL OR hex_value ~ '^#[0-9A-Fa-f]{6}$')
);
GRANT SELECT ON public.colors TO anon, authenticated;
GRANT ALL ON public.colors TO service_role;
ALTER TABLE public.colors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "colors_public_read" ON public.colors FOR SELECT TO anon, authenticated USING (active OR public.is_super_admin());

ALTER TABLE public.product_images
  ADD CONSTRAINT product_images_color_id_fkey FOREIGN KEY (color_id) REFERENCES public.colors(id) ON DELETE SET NULL;
ALTER TABLE public.product_variants
  ADD CONSTRAINT product_variants_image_id_fkey FOREIGN KEY (image_id) REFERENCES public.product_images(id) ON DELETE SET NULL;

CREATE TABLE public.product_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  size_group_id uuid REFERENCES public.size_groups(id) ON DELETE SET NULL,
  name jsonb NOT NULL,
  code text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, code)
);
GRANT SELECT ON public.product_options TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_options TO authenticated;
GRANT ALL ON public.product_options TO service_role;
ALTER TABLE public.product_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "product_options_catalog_or_owner" ON public.product_options FOR SELECT TO anon, authenticated USING (EXISTS (SELECT 1 FROM public.products WHERE products.id = product_options.product_id AND ((products.status = 'active' AND products.publication_status = 'published' AND products.moderation_status = 'approved' AND products.visibility = 'public') OR public.is_super_admin() OR EXISTS (SELECT 1 FROM public.sellers WHERE sellers.id = products.seller_id AND sellers.owner_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.seller_staff WHERE seller_staff.seller_id = products.seller_id AND seller_staff.user_id = auth.uid()))));
CREATE POLICY "product_options_seller_write" ON public.product_options FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.products JOIN public.sellers ON sellers.id = products.seller_id WHERE products.id = product_options.product_id AND (sellers.owner_id = auth.uid() OR public.is_super_admin()))) WITH CHECK (EXISTS (SELECT 1 FROM public.products JOIN public.sellers ON sellers.id = products.seller_id WHERE products.id = product_options.product_id AND (sellers.owner_id = auth.uid() OR public.is_super_admin())));

CREATE TABLE public.product_option_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_option_id uuid NOT NULL REFERENCES public.product_options(id) ON DELETE CASCADE,
  size_id uuid REFERENCES public.sizes(id) ON DELETE SET NULL,
  color_id uuid REFERENCES public.colors(id) ON DELETE SET NULL,
  value text NOT NULL,
  label jsonb NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_option_id, value)
);
GRANT SELECT ON public.product_option_values TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_option_values TO authenticated;
GRANT ALL ON public.product_option_values TO service_role;
ALTER TABLE public.product_option_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "product_option_values_catalog_or_owner" ON public.product_option_values FOR SELECT TO anon, authenticated USING (EXISTS (SELECT 1 FROM public.product_options JOIN public.products ON products.id = product_options.product_id WHERE product_options.id = product_option_values.product_option_id AND ((products.status = 'active' AND products.publication_status = 'published' AND products.moderation_status = 'approved' AND products.visibility = 'public') OR public.is_super_admin() OR EXISTS (SELECT 1 FROM public.sellers WHERE sellers.id = products.seller_id AND sellers.owner_id = auth.uid()))));
CREATE POLICY "product_option_values_seller_write" ON public.product_option_values FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.product_options JOIN public.products ON products.id = product_options.product_id JOIN public.sellers ON sellers.id = products.seller_id WHERE product_options.id = product_option_values.product_option_id AND (sellers.owner_id = auth.uid() OR public.is_super_admin()))) WITH CHECK (EXISTS (SELECT 1 FROM public.product_options JOIN public.products ON products.id = product_options.product_id JOIN public.sellers ON sellers.id = products.seller_id WHERE product_options.id = product_option_values.product_option_id AND (sellers.owner_id = auth.uid() OR public.is_super_admin())));

CREATE TABLE public.variant_option_values (
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  product_option_value_id uuid NOT NULL REFERENCES public.product_option_values(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (variant_id, product_option_value_id)
);
GRANT SELECT ON public.variant_option_values TO anon, authenticated;
GRANT INSERT, DELETE ON public.variant_option_values TO authenticated;
GRANT ALL ON public.variant_option_values TO service_role;
ALTER TABLE public.variant_option_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "variant_option_values_catalog_or_owner" ON public.variant_option_values FOR SELECT TO anon, authenticated USING (EXISTS (SELECT 1 FROM public.product_variants JOIN public.products ON products.id = product_variants.product_id WHERE product_variants.id = variant_option_values.variant_id AND ((products.status = 'active' AND products.publication_status = 'published' AND products.moderation_status = 'approved' AND products.visibility = 'public') OR public.is_super_admin() OR EXISTS (SELECT 1 FROM public.sellers WHERE sellers.id = products.seller_id AND sellers.owner_id = auth.uid()))));
CREATE POLICY "variant_option_values_seller_write" ON public.variant_option_values FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.product_variants JOIN public.products ON products.id = product_variants.product_id JOIN public.sellers ON sellers.id = products.seller_id WHERE product_variants.id = variant_option_values.variant_id AND (sellers.owner_id = auth.uid() OR public.is_super_admin()))) WITH CHECK (EXISTS (SELECT 1 FROM public.product_variants JOIN public.products ON products.id = product_variants.product_id JOIN public.sellers ON sellers.id = products.seller_id WHERE product_variants.id = variant_option_values.variant_id AND (sellers.owner_id = auth.uid() OR public.is_super_admin())));

CREATE TABLE public.product_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name jsonb NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.product_tags TO anon, authenticated;
GRANT ALL ON public.product_tags TO service_role;
ALTER TABLE public.product_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "product_tags_public_read" ON public.product_tags FOR SELECT TO anon, authenticated USING (active OR public.is_super_admin());

CREATE TABLE public.product_tag_assignments (
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.product_tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, tag_id)
);
GRANT SELECT ON public.product_tag_assignments TO anon, authenticated;
GRANT INSERT, DELETE ON public.product_tag_assignments TO authenticated;
GRANT ALL ON public.product_tag_assignments TO service_role;
ALTER TABLE public.product_tag_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "product_tag_assignments_catalog_or_owner" ON public.product_tag_assignments FOR SELECT TO anon, authenticated USING (EXISTS (SELECT 1 FROM public.products WHERE products.id = product_tag_assignments.product_id AND ((products.status = 'active' AND products.publication_status = 'published' AND products.moderation_status = 'approved' AND products.visibility = 'public') OR public.is_super_admin() OR EXISTS (SELECT 1 FROM public.sellers WHERE sellers.id = products.seller_id AND sellers.owner_id = auth.uid()))));
CREATE POLICY "product_tag_assignments_seller_write" ON public.product_tag_assignments FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.products JOIN public.sellers ON sellers.id = products.seller_id WHERE products.id = product_tag_assignments.product_id AND (sellers.owner_id = auth.uid() OR public.is_super_admin()))) WITH CHECK (EXISTS (SELECT 1 FROM public.products JOIN public.sellers ON sellers.id = products.seller_id WHERE products.id = product_tag_assignments.product_id AND (sellers.owner_id = auth.uid() OR public.is_super_admin())));

CREATE TABLE public.product_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE CASCADE,
  sale_price numeric(14,2) NOT NULL CHECK (sale_price >= 0),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_promotions_range_check CHECK (ends_at > starts_at)
);
GRANT SELECT ON public.product_promotions TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_promotions TO authenticated;
GRANT ALL ON public.product_promotions TO service_role;
ALTER TABLE public.product_promotions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "product_promotions_public_read" ON public.product_promotions FOR SELECT TO anon, authenticated USING (active AND starts_at <= now() AND ends_at > now());
CREATE POLICY "product_promotions_seller_write" ON public.product_promotions FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.products JOIN public.sellers ON sellers.id = products.seller_id WHERE products.id = product_promotions.product_id AND (sellers.owner_id = auth.uid() OR public.is_super_admin()))) WITH CHECK (EXISTS (SELECT 1 FROM public.products JOIN public.sellers ON sellers.id = products.seller_id WHERE products.id = product_promotions.product_id AND (sellers.owner_id = auth.uid() OR public.is_super_admin())));

CREATE TABLE public.anonymous_wishlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token text NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_token, product_id)
);
GRANT SELECT, INSERT, DELETE ON public.anonymous_wishlists TO anon, authenticated;
GRANT ALL ON public.anonymous_wishlists TO service_role;
ALTER TABLE public.anonymous_wishlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anonymous_wishlists_session_owned" ON public.anonymous_wishlists FOR ALL TO anon, authenticated USING (session_token = current_setting('request.headers', true)::json->>'x-modalia-session') WITH CHECK (session_token = current_setting('request.headers', true)::json->>'x-modalia-session');

ALTER TABLE public.reviews
  ADD COLUMN first_name text,
  ADD COLUMN last_name text,
  ADD COLUMN email text,
  ADD COLUMN image_path text,
  ADD COLUMN order_item_id uuid REFERENCES public.order_items(id) ON DELETE SET NULL,
  ADD COLUMN moderation_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN flagged_at timestamptz,
  ADD COLUMN verified_purchase boolean NOT NULL DEFAULT false;
ALTER TABLE public.reviews
  ADD CONSTRAINT reviews_moderation_status_check CHECK (moderation_status IN ('pending', 'approved', 'rejected', 'hidden', 'flagged'));

CREATE INDEX products_public_catalog_idx ON public.products(publication_status, moderation_status, visibility, status, published_at DESC);
CREATE INDEX products_store_id_idx ON public.products(store_id);
CREATE INDEX product_variants_available_idx ON public.product_variants(product_id, available, status);
CREATE INDEX product_images_variant_id_idx ON public.product_images(variant_id, color_id, sort_order);
CREATE UNIQUE INDEX product_images_one_primary_per_product_idx ON public.product_images(product_id) WHERE is_primary;
CREATE INDEX product_options_product_id_idx ON public.product_options(product_id, sort_order);
CREATE INDEX product_option_values_option_id_idx ON public.product_option_values(product_option_id, sort_order);
CREATE INDEX product_tag_assignments_tag_id_idx ON public.product_tag_assignments(tag_id);
CREATE INDEX product_promotions_active_idx ON public.product_promotions(product_id, starts_at, ends_at) WHERE active;
CREATE INDEX anonymous_wishlists_session_idx ON public.anonymous_wishlists(session_token);
CREATE INDEX reviews_product_status_idx ON public.reviews(product_id, moderation_status, created_at DESC);

CREATE TRIGGER size_groups_updated_at BEFORE UPDATE ON public.size_groups FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER sizes_updated_at BEFORE UPDATE ON public.sizes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER colors_updated_at BEFORE UPDATE ON public.colors FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER product_options_updated_at BEFORE UPDATE ON public.product_options FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER product_tags_updated_at BEFORE UPDATE ON public.product_tags FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER product_promotions_updated_at BEFORE UPDATE ON public.product_promotions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP POLICY "products_public_or_owner" ON public.products;
CREATE POLICY "products_public_or_owner" ON public.products FOR SELECT TO anon, authenticated USING ((status = 'active' AND publication_status = 'published' AND moderation_status = 'approved' AND visibility = 'public') OR public.is_super_admin() OR EXISTS (SELECT 1 FROM public.sellers WHERE sellers.id = products.seller_id AND sellers.owner_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.seller_staff WHERE seller_staff.seller_id = products.seller_id AND seller_staff.user_id = auth.uid()));

DROP POLICY "variants_catalog_or_owner" ON public.product_variants;
CREATE POLICY "variants_catalog_or_owner" ON public.product_variants FOR SELECT TO anon, authenticated USING (EXISTS (SELECT 1 FROM public.products WHERE products.id = product_variants.product_id AND ((products.status = 'active' AND products.publication_status = 'published' AND products.moderation_status = 'approved' AND products.visibility = 'public') OR public.is_super_admin() OR EXISTS (SELECT 1 FROM public.sellers WHERE sellers.id = products.seller_id AND sellers.owner_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.seller_staff WHERE seller_staff.seller_id = products.seller_id AND seller_staff.user_id = auth.uid()))));

DROP POLICY "images_catalog_or_owner" ON public.product_images;
CREATE POLICY "images_catalog_or_owner" ON public.product_images FOR SELECT TO anon, authenticated USING (EXISTS (SELECT 1 FROM public.products WHERE products.id = product_images.product_id AND ((products.status = 'active' AND products.publication_status = 'published' AND products.moderation_status = 'approved' AND products.visibility = 'public') OR public.is_super_admin() OR EXISTS (SELECT 1 FROM public.sellers WHERE sellers.id = products.seller_id AND sellers.owner_id = auth.uid()))));

DROP POLICY "reviews_public_approved" ON public.reviews;
CREATE POLICY "reviews_public_approved" ON public.reviews FOR SELECT TO anon, authenticated USING (moderation_status = 'approved' OR public.is_super_admin() OR EXISTS (SELECT 1 FROM public.customers WHERE customers.id = reviews.customer_id AND customers.profile_id = auth.uid()));