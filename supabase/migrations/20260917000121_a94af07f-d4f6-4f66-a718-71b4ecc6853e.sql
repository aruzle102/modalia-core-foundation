ALTER TABLE public.products
  ADD COLUMN moderation_reason text,
  ADD COLUMN moderated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN moderated_at timestamptz;

ALTER TABLE public.reviews
  ADD COLUMN moderation_reason text,
  ADD COLUMN moderated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN moderated_at timestamptz;

CREATE TABLE public.back_in_stock_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  email text,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT back_in_stock_contact_check CHECK (customer_id IS NOT NULL OR email IS NOT NULL),
  CONSTRAINT back_in_stock_email_check CHECK (email IS NULL OR length(email) <= 255)
);
GRANT SELECT, INSERT, DELETE ON public.back_in_stock_subscriptions TO anon, authenticated;
GRANT ALL ON public.back_in_stock_subscriptions TO service_role;
ALTER TABLE public.back_in_stock_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "back_in_stock_create_public" ON public.back_in_stock_subscriptions FOR INSERT TO anon, authenticated WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.product_variants pv
    JOIN public.products p ON p.id = pv.product_id
    WHERE pv.id = variant_id
      AND p.status = 'active'
      AND p.publication_status = 'published'
      AND p.moderation_status = 'approved'
      AND p.visibility = 'public'
  )
  AND (customer_id IS NULL OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = customer_id AND c.profile_id = auth.uid()))
);
CREATE POLICY "back_in_stock_owner_read" ON public.back_in_stock_subscriptions FOR SELECT TO authenticated USING (
  public.is_super_admin() OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = customer_id AND c.profile_id = auth.uid())
);
CREATE POLICY "back_in_stock_owner_delete" ON public.back_in_stock_subscriptions FOR DELETE TO authenticated USING (
  public.is_super_admin() OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = customer_id AND c.profile_id = auth.uid())
);
CREATE UNIQUE INDEX back_in_stock_variant_customer_unique ON public.back_in_stock_subscriptions(variant_id, customer_id) WHERE customer_id IS NOT NULL;
CREATE UNIQUE INDEX back_in_stock_variant_email_unique ON public.back_in_stock_subscriptions(variant_id, lower(email)) WHERE email IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_product_moderation_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    IF TG_OP = 'INSERT' THEN
      NEW.moderation_status := 'pending';
      NEW.moderation_reason := NULL;
      NEW.moderated_by := NULL;
      NEW.moderated_at := NULL;
      IF NEW.publication_status IN ('approved', 'published') THEN NEW.publication_status := 'pending_review'; END IF;
      IF NEW.visibility = 'public' THEN NEW.visibility := 'private'; END IF;
    ELSIF NEW.moderation_status IS DISTINCT FROM OLD.moderation_status
      OR NEW.moderation_reason IS DISTINCT FROM OLD.moderation_reason
      OR NEW.moderated_by IS DISTINCT FROM OLD.moderated_by
      OR NEW.moderated_at IS DISTINCT FROM OLD.moderated_at
      OR NEW.publication_status IN ('approved', 'published')
      OR NEW.visibility = 'public' THEN
      RAISE EXCEPTION 'Only marketplace moderators may approve or publish products';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS products_enforce_moderation ON public.products;
CREATE TRIGGER products_enforce_moderation BEFORE INSERT OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.enforce_product_moderation_write();

CREATE OR REPLACE FUNCTION public.ensure_variant_option_matches_product()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  variant_product uuid;
  value_product uuid;
BEGIN
  SELECT product_id INTO variant_product FROM public.product_variants WHERE id = NEW.variant_id;
  SELECT po.product_id INTO value_product FROM public.product_option_values pov JOIN public.product_options po ON po.id = pov.product_option_id WHERE pov.id = NEW.product_option_value_id;
  IF variant_product IS NULL OR value_product IS NULL OR variant_product <> value_product THEN
    RAISE EXCEPTION 'Variant option values must belong to the same product';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.product_variants other_variant
    WHERE other_variant.product_id = variant_product
      AND other_variant.id <> NEW.variant_id
      AND NOT EXISTS (
        SELECT 1 FROM public.variant_option_values mine
        WHERE mine.variant_id = NEW.variant_id
          AND NOT EXISTS (SELECT 1 FROM public.variant_option_values theirs WHERE theirs.variant_id = other_variant.id AND theirs.product_option_value_id = mine.product_option_value_id)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.variant_option_values theirs
        WHERE theirs.variant_id = other_variant.id
          AND NOT EXISTS (SELECT 1 FROM public.variant_option_values mine WHERE mine.variant_id = NEW.variant_id AND mine.product_option_value_id = theirs.product_option_value_id)
      )
  ) THEN
    RAISE EXCEPTION 'A variant with this option combination already exists';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS variant_option_values_product_match ON public.variant_option_values;
CREATE TRIGGER variant_option_values_product_match BEFORE INSERT OR UPDATE ON public.variant_option_values FOR EACH ROW EXECUTE FUNCTION public.ensure_variant_option_matches_product();

DROP POLICY IF EXISTS "product_promotions_public_read" ON public.product_promotions;
CREATE POLICY "product_promotions_public_read" ON public.product_promotions FOR SELECT TO anon, authenticated USING (
  active AND starts_at <= now() AND ends_at > now() AND EXISTS (
    SELECT 1 FROM public.products p WHERE p.id = product_promotions.product_id
      AND p.status = 'active' AND p.publication_status = 'published'
      AND p.moderation_status = 'approved' AND p.visibility = 'public'
  )
);

DROP POLICY IF EXISTS "product_options_seller_write" ON public.product_options;
CREATE POLICY "product_options_seller_write" ON public.product_options FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.products p JOIN public.sellers s ON s.id = p.seller_id WHERE p.id = product_options.product_id AND (s.owner_id = auth.uid() OR public.is_super_admin() OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = p.seller_id AND ss.user_id = auth.uid())))) WITH CHECK (EXISTS (SELECT 1 FROM public.products p JOIN public.sellers s ON s.id = p.seller_id WHERE p.id = product_options.product_id AND (s.owner_id = auth.uid() OR public.is_super_admin() OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = p.seller_id AND ss.user_id = auth.uid()))));

DROP POLICY IF EXISTS "product_option_values_seller_write" ON public.product_option_values;
CREATE POLICY "product_option_values_seller_write" ON public.product_option_values FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.product_options po JOIN public.products p ON p.id = po.product_id JOIN public.sellers s ON s.id = p.seller_id WHERE po.id = product_option_values.product_option_id AND (s.owner_id = auth.uid() OR public.is_super_admin() OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = p.seller_id AND ss.user_id = auth.uid())))) WITH CHECK (EXISTS (SELECT 1 FROM public.product_options po JOIN public.products p ON p.id = po.product_id JOIN public.sellers s ON s.id = p.seller_id WHERE po.id = product_option_values.product_option_id AND (s.owner_id = auth.uid() OR public.is_super_admin() OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = p.seller_id AND ss.user_id = auth.uid()))));

DROP POLICY IF EXISTS "variant_option_values_seller_write" ON public.variant_option_values;
CREATE POLICY "variant_option_values_seller_write" ON public.variant_option_values FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.product_variants pv JOIN public.products p ON p.id = pv.product_id JOIN public.sellers s ON s.id = p.seller_id WHERE pv.id = variant_option_values.variant_id AND (s.owner_id = auth.uid() OR public.is_super_admin() OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = p.seller_id AND ss.user_id = auth.uid())))) WITH CHECK (EXISTS (SELECT 1 FROM public.product_variants pv JOIN public.products p ON p.id = pv.product_id JOIN public.sellers s ON s.id = p.seller_id WHERE pv.id = variant_option_values.variant_id AND (s.owner_id = auth.uid() OR public.is_super_admin() OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = p.seller_id AND ss.user_id = auth.uid()))));

DROP POLICY IF EXISTS "product_tag_assignments_seller_write" ON public.product_tag_assignments;
CREATE POLICY "product_tag_assignments_seller_write" ON public.product_tag_assignments FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.products p JOIN public.sellers s ON s.id = p.seller_id WHERE p.id = product_tag_assignments.product_id AND (s.owner_id = auth.uid() OR public.is_super_admin() OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = p.seller_id AND ss.user_id = auth.uid())))) WITH CHECK (EXISTS (SELECT 1 FROM public.products p JOIN public.sellers s ON s.id = p.seller_id WHERE p.id = product_tag_assignments.product_id AND (s.owner_id = auth.uid() OR public.is_super_admin() OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = p.seller_id AND ss.user_id = auth.uid()))));