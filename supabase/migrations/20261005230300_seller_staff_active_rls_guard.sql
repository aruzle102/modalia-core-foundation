-- Modalia security audit (Phase 8/8): fail-closed staff deactivation in RLS.
--
-- Gap found: `seller_staff.active` (added 20261005150000) is enforced in the
-- server layer (`requireSeller` in src/lib/seller-auth.ts fails closed for
-- deactivated staff), but many RLS policies still granted access on bare
-- `seller_staff` membership. Deactivation does not revoke existing Supabase
-- JWTs, so a deactivated staff member with a still-valid token could keep
-- reading/writing through PostgREST until the token expired.
--
-- Fix: every seller_staff branch of the policies below now requires
-- `<alias>.active IS NOT FALSE`. Policy bodies are otherwise verbatim copies
-- of their latest definitions. Server functions already fail closed, so this
-- only tightens the direct-API path -- no working functionality changes.

DROP POLICY IF EXISTS "products_public_or_owner" ON public.products;
CREATE POLICY "products_public_or_owner" ON public.products
FOR SELECT TO anon, authenticated
USING (
  (status = 'active' AND publication_status = 'published' AND moderation_status = 'approved' AND visibility = 'public')
  OR public.is_super_admin()
  OR EXISTS (SELECT 1 FROM public.sellers s WHERE s.id = products.seller_id AND s.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = products.seller_id AND ss.user_id = auth.uid() AND ss.active IS NOT FALSE)
);

DROP POLICY IF EXISTS "products_seller_write" ON public.products;
CREATE POLICY "products_seller_write" ON public.products
FOR ALL TO authenticated
USING (
  public.is_super_admin()
  OR EXISTS (SELECT 1 FROM public.sellers s WHERE s.id = products.seller_id AND s.owner_id = auth.uid() AND s.account_status = 'active')
  OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = products.seller_id AND ss.user_id = auth.uid() AND (ss.permissions ? 'products.edit' OR ss.permissions ? 'products.create' OR ss.permissions ? 'products.delete') AND ss.active IS NOT FALSE)
)
WITH CHECK (
  public.is_super_admin()
  OR EXISTS (SELECT 1 FROM public.sellers s WHERE s.id = products.seller_id AND s.owner_id = auth.uid() AND s.account_status = 'active')
  OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = products.seller_id AND ss.user_id = auth.uid() AND (ss.permissions ? 'products.create' OR ss.permissions ? 'products.edit') AND ss.active IS NOT FALSE)
);

DROP POLICY IF EXISTS "product_options_seller_write" ON public.product_options;
CREATE POLICY "product_options_seller_write" ON public.product_options FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.products p JOIN public.sellers s ON s.id = p.seller_id WHERE p.id = product_options.product_id AND (s.owner_id = auth.uid() OR public.is_super_admin() OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = p.seller_id AND ss.user_id = auth.uid() AND ss.active IS NOT FALSE)))) WITH CHECK (EXISTS (SELECT 1 FROM public.products p JOIN public.sellers s ON s.id = p.seller_id WHERE p.id = product_options.product_id AND (s.owner_id = auth.uid() OR public.is_super_admin() OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = p.seller_id AND ss.user_id = auth.uid() AND ss.active IS NOT FALSE))));

DROP POLICY IF EXISTS "product_option_values_seller_write" ON public.product_option_values;
CREATE POLICY "product_option_values_seller_write" ON public.product_option_values FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.product_options po JOIN public.products p ON p.id = po.product_id JOIN public.sellers s ON s.id = p.seller_id WHERE po.id = product_option_values.product_option_id AND (s.owner_id = auth.uid() OR public.is_super_admin() OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = p.seller_id AND ss.user_id = auth.uid() AND ss.active IS NOT FALSE)))) WITH CHECK (EXISTS (SELECT 1 FROM public.product_options po JOIN public.products p ON p.id = po.product_id JOIN public.sellers s ON s.id = p.seller_id WHERE po.id = product_option_values.product_option_id AND (s.owner_id = auth.uid() OR public.is_super_admin() OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = p.seller_id AND ss.user_id = auth.uid() AND ss.active IS NOT FALSE))));

DROP POLICY IF EXISTS "variant_option_values_seller_write" ON public.variant_option_values;
CREATE POLICY "variant_option_values_seller_write" ON public.variant_option_values FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.product_variants pv JOIN public.products p ON p.id = pv.product_id JOIN public.sellers s ON s.id = p.seller_id WHERE pv.id = variant_option_values.variant_id AND (s.owner_id = auth.uid() OR public.is_super_admin() OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = p.seller_id AND ss.user_id = auth.uid() AND ss.active IS NOT FALSE)))) WITH CHECK (EXISTS (SELECT 1 FROM public.product_variants pv JOIN public.products p ON p.id = pv.product_id JOIN public.sellers s ON s.id = p.seller_id WHERE pv.id = variant_option_values.variant_id AND (s.owner_id = auth.uid() OR public.is_super_admin() OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = p.seller_id AND ss.user_id = auth.uid() AND ss.active IS NOT FALSE))));

DROP POLICY IF EXISTS "product_tag_assignments_seller_write" ON public.product_tag_assignments;
CREATE POLICY "product_tag_assignments_seller_write" ON public.product_tag_assignments FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.products p JOIN public.sellers s ON s.id = p.seller_id WHERE p.id = product_tag_assignments.product_id AND (s.owner_id = auth.uid() OR public.is_super_admin() OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = p.seller_id AND ss.user_id = auth.uid() AND ss.active IS NOT FALSE)))) WITH CHECK (EXISTS (SELECT 1 FROM public.products p JOIN public.sellers s ON s.id = p.seller_id WHERE p.id = product_tag_assignments.product_id AND (s.owner_id = auth.uid() OR public.is_super_admin() OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = p.seller_id AND ss.user_id = auth.uid() AND ss.active IS NOT FALSE))));

DROP POLICY IF EXISTS "product_options_catalog_or_owner" ON public.product_options;
CREATE POLICY "product_options_catalog_or_owner" ON public.product_options FOR SELECT TO anon, authenticated USING (EXISTS (SELECT 1 FROM public.products WHERE products.id = product_options.product_id AND ((products.status = 'active' AND products.publication_status = 'published' AND products.moderation_status = 'approved' AND products.visibility = 'public') OR public.is_super_admin() OR EXISTS (SELECT 1 FROM public.sellers WHERE sellers.id = products.seller_id AND sellers.owner_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.seller_staff WHERE seller_staff.seller_id = products.seller_id AND seller_staff.user_id = auth.uid() AND seller_staff.active IS NOT FALSE))));

DROP POLICY IF EXISTS "variants_catalog_or_owner" ON public.product_variants;
CREATE POLICY "variants_catalog_or_owner" ON public.product_variants FOR SELECT TO anon, authenticated USING (EXISTS (SELECT 1 FROM public.products WHERE products.id = product_variants.product_id AND ((products.status = 'active' AND products.publication_status = 'published' AND products.moderation_status = 'approved' AND products.visibility = 'public') OR public.is_super_admin() OR EXISTS (SELECT 1 FROM public.sellers WHERE sellers.id = products.seller_id AND sellers.owner_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.seller_staff WHERE seller_staff.seller_id = products.seller_id AND seller_staff.user_id = auth.uid() AND seller_staff.active IS NOT FALSE))));

DROP POLICY IF EXISTS "order_history_visible_to_authorized_parties" ON public.order_status_history;
CREATE POLICY "order_history_visible_to_authorized_parties" ON public.order_status_history FOR SELECT TO authenticated USING (
  public.is_super_admin()
  OR (order_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.orders o JOIN public.customers c ON c.id = o.customer_id WHERE o.id = order_status_history.order_id AND c.profile_id = auth.uid()))
  OR (seller_order_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.seller_orders so WHERE so.id = order_status_history.seller_order_id AND (EXISTS (SELECT 1 FROM public.sellers s WHERE s.id = so.seller_id AND s.owner_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = so.seller_id AND ss.user_id = auth.uid() AND ss.active IS NOT FALSE) OR EXISTS (SELECT 1 FROM public.orders o JOIN public.customers c ON c.id = o.customer_id WHERE o.id = so.order_id AND c.profile_id = auth.uid()))))
);

DROP POLICY IF EXISTS "order_notes_visible_to_authorized_parties" ON public.order_notes;
CREATE POLICY "order_notes_visible_to_authorized_parties" ON public.order_notes FOR SELECT TO authenticated USING (
  public.is_super_admin()
  OR EXISTS (SELECT 1 FROM public.seller_orders so WHERE so.id = order_notes.seller_order_id AND (EXISTS (SELECT 1 FROM public.sellers s WHERE s.id = so.seller_id AND s.owner_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = so.seller_id AND ss.user_id = auth.uid() AND ss.active IS NOT FALSE) OR (order_notes.visibility = 'customer' AND EXISTS (SELECT 1 FROM public.orders o JOIN public.customers c ON c.id = o.customer_id WHERE o.id = so.order_id AND c.profile_id = auth.uid()))))
);

DROP POLICY IF EXISTS "seller_staff_create_internal_order_notes" ON public.order_notes;
CREATE POLICY "seller_staff_create_internal_order_notes" ON public.order_notes FOR INSERT TO authenticated WITH CHECK (
  visibility = 'internal' AND EXISTS (SELECT 1 FROM public.seller_orders so WHERE so.id = order_notes.seller_order_id AND (EXISTS (SELECT 1 FROM public.sellers s WHERE s.id = so.seller_id AND s.owner_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = so.seller_id AND ss.user_id = auth.uid() AND ss.active IS NOT FALSE)))
);

DROP POLICY IF EXISTS "returns_visible_to_authorized_parties" ON public.order_returns;
CREATE POLICY "returns_visible_to_authorized_parties" ON public.order_returns FOR SELECT TO authenticated USING (
  public.is_super_admin() OR EXISTS (SELECT 1 FROM public.seller_orders so WHERE so.id = order_returns.seller_order_id AND (EXISTS (SELECT 1 FROM public.sellers s WHERE s.id = so.seller_id AND s.owner_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = so.seller_id AND ss.user_id = auth.uid() AND ss.active IS NOT FALSE) OR EXISTS (SELECT 1 FROM public.orders o JOIN public.customers c ON c.id = o.customer_id WHERE o.id = so.order_id AND c.profile_id = auth.uid())))
);

DROP POLICY IF EXISTS "seller_orders_isolated" ON public.seller_orders;
CREATE POLICY "seller_orders_isolated" ON public.seller_orders FOR SELECT TO authenticated USING (public.is_super_admin() OR EXISTS (SELECT 1 FROM public.sellers WHERE sellers.id = seller_orders.seller_id AND sellers.owner_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.seller_staff WHERE seller_staff.seller_id = seller_orders.seller_id AND seller_staff.user_id = auth.uid() AND seller_staff.active IS NOT FALSE) OR EXISTS (SELECT 1 FROM public.orders JOIN public.customers ON customers.id = orders.customer_id WHERE orders.id = seller_orders.order_id AND customers.profile_id = auth.uid()));

DROP POLICY IF EXISTS "order_items_visible_with_seller_order" ON public.order_items;
CREATE POLICY "order_items_visible_with_seller_order" ON public.order_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.seller_orders WHERE seller_orders.id = order_items.seller_order_id AND (public.is_super_admin() OR EXISTS (SELECT 1 FROM public.sellers WHERE sellers.id = seller_orders.seller_id AND sellers.owner_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.seller_staff WHERE seller_staff.seller_id = seller_orders.seller_id AND seller_staff.user_id = auth.uid() AND seller_staff.active IS NOT FALSE) OR EXISTS (SELECT 1 FROM public.orders JOIN public.customers ON customers.id = orders.customer_id WHERE orders.id = seller_orders.order_id AND customers.profile_id = auth.uid()))));

DROP POLICY IF EXISTS "seller_support_requests_isolated" ON public.seller_support_requests;
CREATE POLICY "seller_support_requests_isolated" ON public.seller_support_requests FOR SELECT TO authenticated USING (public.is_super_admin() OR EXISTS (SELECT 1 FROM public.sellers s WHERE s.id = seller_support_requests.seller_id AND s.owner_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = seller_support_requests.seller_id AND ss.user_id = auth.uid() AND (ss.permissions ? 'settings.manage') AND ss.active IS NOT FALSE));

DROP POLICY IF EXISTS "seller_support_requests_create" ON public.seller_support_requests;
CREATE POLICY "seller_support_requests_create" ON public.seller_support_requests FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.sellers s WHERE s.id = seller_support_requests.seller_id AND s.owner_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = seller_support_requests.seller_id AND ss.user_id = auth.uid() AND (ss.permissions ? 'settings.manage') AND ss.active IS NOT FALSE));

DROP POLICY IF EXISTS "seller_owner_or_admin" ON public.sellers;
CREATE POLICY "seller_owner_or_admin" ON public.sellers FOR SELECT TO authenticated USING (owner_id = auth.uid() OR public.is_super_admin() OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = sellers.id AND ss.user_id = auth.uid() AND ss.active IS NOT FALSE));

DROP POLICY IF EXISTS "stores_public_active" ON public.stores;
CREATE POLICY "stores_public_active" ON public.stores FOR SELECT TO anon, authenticated USING (status = 'active' OR public.is_super_admin() OR EXISTS (SELECT 1 FROM public.sellers s WHERE s.id = stores.seller_id AND s.owner_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = stores.seller_id AND ss.user_id = auth.uid() AND ss.active IS NOT FALSE));

DROP POLICY IF EXISTS "stores_seller_update" ON public.stores;
CREATE POLICY "stores_seller_update" ON public.stores FOR UPDATE TO authenticated USING (public.is_super_admin() OR EXISTS (SELECT 1 FROM public.sellers s WHERE s.id = stores.seller_id AND s.owner_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = stores.seller_id AND ss.user_id = auth.uid() AND ss.permissions ? 'store.edit' AND ss.active IS NOT FALSE)) WITH CHECK (public.is_super_admin() OR EXISTS (SELECT 1 FROM public.sellers s WHERE s.id = stores.seller_id AND s.owner_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = stores.seller_id AND ss.user_id = auth.uid() AND ss.permissions ? 'store.edit' AND ss.active IS NOT FALSE));

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER functions that resolve staff membership must fail closed too.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.seller_can(_seller_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.sellers s
      WHERE s.id = _seller_id
        AND s.owner_id = auth.uid()
        AND s.account_status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM public.seller_staff ss
      WHERE ss.seller_id = _seller_id
        AND ss.user_id = auth.uid()
        AND ss.active IS NOT FALSE
        AND ss.permissions ? _permission
    );
$$;

REVOKE EXECUTE ON FUNCTION public.seller_can(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seller_can(uuid, text) TO authenticated;

-- A deactivated staff member must not transition order statuses.
CREATE OR REPLACE FUNCTION public.transition_seller_order_status(p_seller_order_id uuid, p_new_status text, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order public.seller_orders%ROWTYPE; v_actor_type text; v_parent_status public.order_status;
BEGIN
  SELECT * INTO v_order FROM public.seller_orders WHERE id = p_seller_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Seller order not found.'; END IF;
  IF public.is_super_admin() THEN v_actor_type := 'admin';
  ELSIF EXISTS (SELECT 1 FROM public.sellers WHERE id = v_order.seller_id AND owner_id = auth.uid()) THEN v_actor_type := 'seller';
  ELSIF EXISTS (SELECT 1 FROM public.seller_staff WHERE seller_id = v_order.seller_id AND user_id = auth.uid() AND active IS NOT FALSE) THEN v_actor_type := 'seller_staff';
  ELSE RAISE EXCEPTION 'You cannot update this seller order.'; END IF;
  IF p_new_status NOT IN ('confirmed','processing','preparing','ready_for_shipping','handed_to_courier','in_transit','delivered','cancelled','returned','failed_delivery') THEN RAISE EXCEPTION 'Unsupported order status.'; END IF;
  IF (v_order.status::text, p_new_status) NOT IN (('pending','confirmed'),('confirmed','processing'),('confirmed','preparing'),('processing','preparing'),('preparing','ready_for_shipping'),('ready_for_shipping','handed_to_courier'),('handed_to_courier','in_transit'),('in_transit','delivered'),('pending','cancelled'),('confirmed','cancelled'),('processing','cancelled'),('preparing','cancelled'),('in_transit','failed_delivery'),('failed_delivery','returned')) THEN RAISE EXCEPTION 'This status transition is not allowed.'; END IF;
  UPDATE public.seller_orders SET status = p_new_status::public.seller_order_status WHERE id = v_order.id;
  INSERT INTO public.order_status_history(seller_order_id, previous_status, new_status, actor_id, actor_type, note) VALUES (v_order.id, v_order.status::text, p_new_status, auth.uid(), v_actor_type, NULLIF(trim(COALESCE(p_note,'')),''));
  SELECT status INTO v_parent_status FROM public.orders WHERE id = v_order.order_id FOR UPDATE;
  IF p_new_status = 'cancelled' AND v_parent_status::text IN ('received','pending','confirmed','processing','preparing') THEN UPDATE public.orders SET status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancellation_reason = COALESCE(NULLIF(trim(p_note),''),'Cancelled by seller') WHERE id = v_order.order_id; END IF;
  RETURN jsonb_build_object('id', v_order.id, 'status', p_new_status);
END; $$;
