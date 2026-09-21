ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'received';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'preparing';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'ready_for_shipping';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'handed_to_courier';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'in_transit';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'returned';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'failed_delivery';
ALTER TYPE public.seller_order_status ADD VALUE IF NOT EXISTS 'confirmed';
ALTER TYPE public.seller_order_status ADD VALUE IF NOT EXISTS 'ready_for_shipping';
ALTER TYPE public.seller_order_status ADD VALUE IF NOT EXISTS 'handed_to_courier';
ALTER TYPE public.seller_order_status ADD VALUE IF NOT EXISTS 'in_transit';
ALTER TYPE public.seller_order_status ADD VALUE IF NOT EXISTS 'delivered';
ALTER TYPE public.seller_order_status ADD VALUE IF NOT EXISTS 'returned';
ALTER TYPE public.seller_order_status ADD VALUE IF NOT EXISTS 'failed_delivery';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'cod' CHECK (payment_method = 'cod'),
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  ADD COLUMN IF NOT EXISTS payment_amount_due numeric(14,2) NOT NULL DEFAULT 0 CHECK (payment_amount_due >= 0),
  ADD COLUMN IF NOT EXISTS payment_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS checkout_idempotency_key text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancellation_note text,
  ADD COLUMN IF NOT EXISTS failed_delivery_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_delivery_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS failed_delivery_reason text,
  ADD COLUMN IF NOT EXISTS failed_delivery_note text;
CREATE UNIQUE INDEX IF NOT EXISTS orders_checkout_idempotency_key_idx ON public.orders(checkout_idempotency_key) WHERE checkout_idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_guest_phone_idx ON public.orders(guest_phone);
CREATE INDEX IF NOT EXISTS orders_status_created_at_idx ON public.orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_delivery_method_idx ON public.orders(delivery_method);

CREATE TABLE public.order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  seller_order_id uuid REFERENCES public.seller_orders(id) ON DELETE CASCADE,
  previous_status text,
  new_status text NOT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('customer', 'seller', 'seller_staff', 'admin', 'system')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_status_history_target_check CHECK ((order_id IS NOT NULL) <> (seller_order_id IS NOT NULL))
);
GRANT SELECT ON public.order_status_history TO authenticated;
GRANT ALL ON public.order_status_history TO service_role;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_history_visible_to_authorized_parties" ON public.order_status_history FOR SELECT TO authenticated USING (
  public.is_super_admin()
  OR (order_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.orders o JOIN public.customers c ON c.id = o.customer_id WHERE o.id = order_status_history.order_id AND c.profile_id = auth.uid()))
  OR (seller_order_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.seller_orders so WHERE so.id = order_status_history.seller_order_id AND (EXISTS (SELECT 1 FROM public.sellers s WHERE s.id = so.seller_id AND s.owner_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = so.seller_id AND ss.user_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.orders o JOIN public.customers c ON c.id = o.customer_id WHERE o.id = so.order_id AND c.profile_id = auth.uid()))))
);
CREATE INDEX order_status_history_order_idx ON public.order_status_history(order_id, created_at DESC);
CREATE INDEX order_status_history_seller_order_idx ON public.order_status_history(seller_order_id, created_at DESC);

CREATE TABLE public.order_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_order_id uuid NOT NULL REFERENCES public.seller_orders(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  visibility text NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal', 'customer')),
  body text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.order_notes TO authenticated;
GRANT ALL ON public.order_notes TO service_role;
ALTER TABLE public.order_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_notes_visible_to_authorized_parties" ON public.order_notes FOR SELECT TO authenticated USING (
  public.is_super_admin()
  OR EXISTS (SELECT 1 FROM public.seller_orders so WHERE so.id = order_notes.seller_order_id AND (EXISTS (SELECT 1 FROM public.sellers s WHERE s.id = so.seller_id AND s.owner_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = so.seller_id AND ss.user_id = auth.uid()) OR (order_notes.visibility = 'customer' AND EXISTS (SELECT 1 FROM public.orders o JOIN public.customers c ON c.id = o.customer_id WHERE o.id = so.order_id AND c.profile_id = auth.uid()))))
);
CREATE POLICY "seller_staff_create_internal_order_notes" ON public.order_notes FOR INSERT TO authenticated WITH CHECK (
  visibility = 'internal' AND EXISTS (SELECT 1 FROM public.seller_orders so WHERE so.id = order_notes.seller_order_id AND (EXISTS (SELECT 1 FROM public.sellers s WHERE s.id = so.seller_id AND s.owner_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = so.seller_id AND ss.user_id = auth.uid())))
);

CREATE TABLE public.order_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_order_id uuid NOT NULL REFERENCES public.seller_orders(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'rejected', 'received', 'refunded')),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 2 AND 1000),
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.order_returns TO authenticated;
GRANT ALL ON public.order_returns TO service_role;
ALTER TABLE public.order_returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "returns_visible_to_authorized_parties" ON public.order_returns FOR SELECT TO authenticated USING (
  public.is_super_admin() OR EXISTS (SELECT 1 FROM public.seller_orders so WHERE so.id = order_returns.seller_order_id AND (EXISTS (SELECT 1 FROM public.sellers s WHERE s.id = so.seller_id AND s.owner_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = so.seller_id AND ss.user_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.orders o JOIN public.customers c ON c.id = o.customer_id WHERE o.id = so.order_id AND c.profile_id = auth.uid())))
);
CREATE POLICY "customers_request_own_returns" ON public.order_returns FOR INSERT TO authenticated WITH CHECK (requested_by = auth.uid() AND EXISTS (SELECT 1 FROM public.seller_orders so JOIN public.orders o ON o.id = so.order_id JOIN public.customers c ON c.id = o.customer_id WHERE so.id = order_returns.seller_order_id AND c.profile_id = auth.uid()));
CREATE TRIGGER order_returns_updated_at BEFORE UPDATE ON public.order_returns FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  payment_method text NOT NULL CHECK (payment_method = 'cod'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'DZD',
  paid_at timestamptz,
  provider_reference text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id, payment_method)
);
GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_visible_to_owner_or_admin" ON public.payments FOR SELECT TO authenticated USING (public.is_super_admin() OR EXISTS (SELECT 1 FROM public.orders o JOIN public.customers c ON c.id = o.customer_id WHERE o.id = payments.order_id AND c.profile_id = auth.uid()));
CREATE TRIGGER payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP POLICY IF EXISTS "seller_orders_isolated" ON public.seller_orders;
CREATE POLICY "seller_orders_isolated" ON public.seller_orders FOR SELECT TO authenticated USING (public.is_super_admin() OR EXISTS (SELECT 1 FROM public.sellers WHERE sellers.id = seller_orders.seller_id AND sellers.owner_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.seller_staff WHERE seller_staff.seller_id = seller_orders.seller_id AND seller_staff.user_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.orders JOIN public.customers ON customers.id = orders.customer_id WHERE orders.id = seller_orders.order_id AND customers.profile_id = auth.uid()));
DROP POLICY IF EXISTS "order_items_visible_with_seller_order" ON public.order_items;
CREATE POLICY "order_items_visible_with_seller_order" ON public.order_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.seller_orders WHERE seller_orders.id = order_items.seller_order_id AND (public.is_super_admin() OR EXISTS (SELECT 1 FROM public.sellers WHERE sellers.id = seller_orders.seller_id AND sellers.owner_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.seller_staff WHERE seller_staff.seller_id = seller_orders.seller_id AND seller_staff.user_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.orders JOIN public.customers ON customers.id = orders.customer_id WHERE orders.id = seller_orders.order_id AND customers.profile_id = auth.uid()))));

CREATE OR REPLACE FUNCTION public.transition_seller_order_status(p_seller_order_id uuid, p_new_status text, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order public.seller_orders%ROWTYPE; v_actor_type text; v_parent_status public.order_status;
BEGIN
  SELECT * INTO v_order FROM public.seller_orders WHERE id = p_seller_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Seller order not found.'; END IF;
  IF public.is_super_admin() THEN v_actor_type := 'admin';
  ELSIF EXISTS (SELECT 1 FROM public.sellers WHERE id = v_order.seller_id AND owner_id = auth.uid()) THEN v_actor_type := 'seller';
  ELSIF EXISTS (SELECT 1 FROM public.seller_staff WHERE seller_id = v_order.seller_id AND user_id = auth.uid()) THEN v_actor_type := 'seller_staff';
  ELSE RAISE EXCEPTION 'You cannot update this seller order.'; END IF;
  IF p_new_status NOT IN ('confirmed','processing','preparing','ready_for_shipping','handed_to_courier','in_transit','delivered','cancelled','returned','failed_delivery') THEN RAISE EXCEPTION 'Unsupported order status.'; END IF;
  IF (v_order.status::text, p_new_status) NOT IN (('pending','confirmed'),('confirmed','processing'),('confirmed','preparing'),('processing','preparing'),('preparing','ready_for_shipping'),('ready_for_shipping','handed_to_courier'),('handed_to_courier','in_transit'),('in_transit','delivered'),('pending','cancelled'),('confirmed','cancelled'),('processing','cancelled'),('preparing','cancelled'),('in_transit','failed_delivery'),('failed_delivery','returned')) THEN RAISE EXCEPTION 'This status transition is not allowed.'; END IF;
  UPDATE public.seller_orders SET status = p_new_status::public.seller_order_status WHERE id = v_order.id;
  INSERT INTO public.order_status_history(seller_order_id, previous_status, new_status, actor_id, actor_type, note) VALUES (v_order.id, v_order.status::text, p_new_status, auth.uid(), v_actor_type, NULLIF(trim(COALESCE(p_note,'')),''));
  SELECT status INTO v_parent_status FROM public.orders WHERE id = v_order.order_id FOR UPDATE;
  IF p_new_status = 'cancelled' AND v_parent_status::text IN ('received','pending','confirmed','processing','preparing') THEN UPDATE public.orders SET status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancellation_reason = COALESCE(NULLIF(trim(p_note),''),'Cancelled by seller') WHERE id = v_order.order_id; END IF;
  RETURN jsonb_build_object('id', v_order.id, 'status', p_new_status);
END; $$;
REVOKE ALL ON FUNCTION public.transition_seller_order_status(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_seller_order_status(uuid, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.checkout_cart(
  p_cart_id uuid, p_session_token text, p_first_name text, p_last_name text, p_phone text, p_wilaya_id uuid, p_commune_id uuid, p_address_line text, p_delivery_method text, p_customer_note text DEFAULT NULL, p_customer_id uuid DEFAULT NULL, p_idempotency_key text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cart public.carts%ROWTYPE; v_wilaya public.wilayas%ROWTYPE; v_commune public.communes%ROWTYPE; v_order_id uuid; v_order_number text; v_subtotal numeric(14,2) := 0; v_shipping_total numeric(14,2) := 0; v_seller_subtotal numeric(14,2); v_seller_weight integer; v_shipping_price numeric(14,2); v_seller_order_id uuid; v_store record; v_line record; v_address jsonb; v_existing public.orders%ROWTYPE;
BEGIN
  IF p_first_name IS NULL OR length(trim(p_first_name)) < 2 OR length(trim(p_first_name)) > 100 OR p_last_name IS NULL OR length(trim(p_last_name)) < 2 OR length(trim(p_last_name)) > 100 THEN RAISE EXCEPTION 'Please provide a valid name.'; END IF;
  IF p_phone IS NULL OR p_phone !~ '^\\+213[5-7][0-9]{8}$' THEN RAISE EXCEPTION 'Please provide a valid Algerian mobile number.'; END IF;
  IF p_delivery_method NOT IN ('home','office') THEN RAISE EXCEPTION 'Select an available delivery method.'; END IF;
  IF p_address_line IS NULL OR length(trim(p_address_line)) < 4 OR length(trim(p_address_line)) > 500 THEN RAISE EXCEPTION 'Please provide a valid delivery address.'; END IF;
  IF p_idempotency_key IS NOT NULL THEN SELECT * INTO v_existing FROM public.orders WHERE checkout_idempotency_key = p_idempotency_key; IF FOUND THEN RETURN jsonb_build_object('order_id',v_existing.id,'order_number',v_existing.order_number,'subtotal',v_existing.subtotal,'shipping_total',v_existing.shipping_total,'grand_total',v_existing.grand_total,'delivery_method',v_existing.delivery_method,'address',v_existing.address_snapshot); END IF; END IF;
  SELECT * INTO v_cart FROM public.carts WHERE id = p_cart_id AND session_token = p_session_token FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'This cart is no longer available.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cart_items WHERE cart_id = v_cart.id) THEN RAISE EXCEPTION 'Your cart is empty.'; END IF;
  SELECT * INTO v_wilaya FROM public.wilayas WHERE id = p_wilaya_id AND active; SELECT * INTO v_commune FROM public.communes WHERE id = p_commune_id AND wilaya_id = p_wilaya_id AND active; IF NOT FOUND OR v_wilaya.id IS NULL THEN RAISE EXCEPTION 'Choose a valid wilaya and commune.'; END IF;
  FOR v_line IN SELECT ci.id AS cart_item_id,ci.quantity,pv.id AS variant_id,pv.sku,pv.price AS variant_price,pv.compare_at_price AS variant_compare_at_price,pv.available,pv.weight_grams AS variant_weight,p.id AS product_id,p.name,p.base_price,p.compare_at_price AS product_compare_at_price,p.weight_grams AS product_weight,p.currency,p.status AS product_status,p.publication_status,p.moderation_status,p.visibility,p.seller_id,p.store_id,s.name AS store_name,s.logo_path,s.status AS store_status,(SELECT pi.storage_path FROM public.product_images pi WHERE pi.product_id=p.id AND pi.media_type='image' ORDER BY pi.is_primary DESC,pi.sort_order ASC LIMIT 1) AS image_path,COALESCE((SELECT jsonb_object_agg(po.code,pov.label) FROM public.variant_option_values vov JOIN public.product_option_values pov ON pov.id=vov.product_option_value_id JOIN public.product_options po ON po.id=pov.product_option_id WHERE vov.variant_id=pv.id),'{}'::jsonb) AS option_snapshot,i.quantity-i.reserved_quantity AS available_stock,i.max_purchase_quantity FROM public.cart_items ci JOIN public.product_variants pv ON pv.id=ci.variant_id JOIN public.products p ON p.id=pv.product_id JOIN public.stores s ON s.id=p.store_id JOIN public.inventory i ON i.variant_id=pv.id WHERE ci.cart_id=v_cart.id FOR UPDATE OF ci,pv,p,s,i LOOP IF v_line.product_status<>'active' OR v_line.publication_status<>'published' OR v_line.moderation_status<>'approved' OR v_line.visibility<>'public' OR v_line.store_status<>'active' OR NOT v_line.available THEN RAISE EXCEPTION 'One or more items are no longer available.'; END IF; IF v_line.available_stock<v_line.quantity OR (v_line.max_purchase_quantity IS NOT NULL AND v_line.quantity>v_line.max_purchase_quantity) THEN RAISE EXCEPTION 'One or more items no longer have enough stock.'; END IF; END LOOP;
  v_address:=jsonb_build_object('address_line',trim(p_address_line),'wilaya_id',v_wilaya.id,'wilaya_code',v_wilaya.code,'wilaya',v_wilaya.name,'commune_id',v_commune.id,'commune_code',v_commune.code,'commune',v_commune.name);
  LOOP v_order_number:='ORD-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)); EXIT WHEN NOT EXISTS(SELECT 1 FROM public.orders WHERE order_number=v_order_number); END LOOP;
  INSERT INTO public.orders(order_number,customer_id,guest_phone,currency,status,first_name,last_name,delivery_method,customer_note,shipping_address,address_snapshot,payment_method,payment_status,checkout_idempotency_key) VALUES(v_order_number,p_customer_id,p_phone,v_cart.currency,'received',trim(p_first_name),trim(p_last_name),p_delivery_method,NULLIF(trim(COALESCE(p_customer_note,'')),''),v_address,v_address,'cod','pending',p_idempotency_key) RETURNING id INTO v_order_id;
  FOR v_store IN SELECT DISTINCT seller_id,store_id,store_name,logo_path FROM (SELECT p.seller_id,p.store_id,s.name AS store_name,s.logo_path FROM public.cart_items ci JOIN public.product_variants pv ON pv.id=ci.variant_id JOIN public.products p ON p.id=pv.product_id JOIN public.stores s ON s.id=p.store_id WHERE ci.cart_id=v_cart.id) stores LOOP SELECT COALESCE(sum(COALESCE(pv.price,p.base_price)*ci.quantity),0),COALESCE(sum(COALESCE(pv.weight_grams,p.weight_grams,0)*ci.quantity),0) INTO v_seller_subtotal,v_seller_weight FROM public.cart_items ci JOIN public.product_variants pv ON pv.id=ci.variant_id JOIN public.products p ON p.id=pv.product_id WHERE ci.cart_id=v_cart.id AND p.seller_id=v_store.seller_id; SELECT sr.price INTO v_shipping_price FROM public.shipping_rules sr WHERE sr.enabled AND sr.status='active' AND (sr.seller_id=v_store.seller_id OR sr.seller_id IS NULL) AND sr.wilaya_id=p_wilaya_id AND (sr.commune_id=p_commune_id OR sr.commune_id IS NULL) AND sr.delivery_method=p_delivery_method AND sr.min_weight_grams<=v_seller_weight AND (sr.max_weight_grams IS NULL OR v_seller_weight<sr.max_weight_grams) ORDER BY (sr.seller_id IS NOT NULL) DESC,(sr.commune_id IS NOT NULL) DESC,sr.min_weight_grams DESC LIMIT 1; IF v_shipping_price IS NULL THEN RAISE EXCEPTION 'Delivery is not available for one or more stores at this address.'; END IF; INSERT INTO public.seller_orders(order_id,seller_id,store_id,status,subtotal,shipping_total,shipping_weight_grams,delivery_method,shipping_snapshot) VALUES(v_order_id,v_store.seller_id,v_store.store_id,'pending',v_seller_subtotal,v_shipping_price,v_seller_weight,p_delivery_method,jsonb_build_object('store_name',v_store.store_name,'store_logo_path',v_store.logo_path,'delivery_method',p_delivery_method,'weight_grams',v_seller_weight,'price',v_shipping_price,'address',v_address)) RETURNING id INTO v_seller_order_id; FOR v_line IN SELECT ci.id AS cart_item_id,ci.quantity,pv.id AS variant_id,pv.sku,pv.price AS variant_price,pv.compare_at_price AS variant_compare_at_price,pv.weight_grams AS variant_weight,p.id AS product_id,p.name,p.base_price,p.compare_at_price AS product_compare_at_price,p.weight_grams AS product_weight,p.seller_id,p.store_id,(SELECT pi.storage_path FROM public.product_images pi WHERE pi.product_id=p.id AND pi.media_type='image' ORDER BY pi.is_primary DESC,pi.sort_order ASC LIMIT 1) AS image_path,COALESCE((SELECT jsonb_object_agg(po.code,pov.label) FROM public.variant_option_values vov JOIN public.product_option_values pov ON pov.id=vov.product_option_value_id JOIN public.product_options po ON po.id=pov.product_option_id WHERE vov.variant_id=pv.id),'{}'::jsonb) AS option_snapshot FROM public.cart_items ci JOIN public.product_variants pv ON pv.id=ci.variant_id JOIN public.products p ON p.id=pv.product_id WHERE ci.cart_id=v_cart.id AND p.seller_id=v_store.seller_id LOOP INSERT INTO public.order_items(seller_order_id,product_id,variant_id,title,sku,unit_price,compare_at_price,quantity,total,discount_total,image_path,option_snapshot,product_snapshot,weight_grams) VALUES(v_seller_order_id,v_line.product_id,v_line.variant_id,v_line.name,v_line.sku,COALESCE(v_line.variant_price,v_line.base_price),COALESCE(v_line.variant_compare_at_price,v_line.product_compare_at_price),v_line.quantity,COALESCE(v_line.variant_price,v_line.base_price)*v_line.quantity,GREATEST(COALESCE(v_line.variant_compare_at_price,v_line.product_compare_at_price,0)-COALESCE(v_line.variant_price,v_line.base_price),0)*v_line.quantity,v_line.image_path,v_line.option_snapshot,jsonb_build_object('seller_id',v_line.seller_id,'store_id',v_line.store_id,'name',v_line.name),COALESCE(v_line.variant_weight,v_line.product_weight)); UPDATE public.inventory SET reserved_quantity=reserved_quantity+v_line.quantity WHERE variant_id=v_line.variant_id; END LOOP; v_subtotal:=v_subtotal+v_seller_subtotal; v_shipping_total:=v_shipping_total+v_shipping_price; END LOOP;
  UPDATE public.orders SET subtotal=v_subtotal,shipping_total=v_shipping_total,grand_total=v_subtotal+v_shipping_total,payment_amount_due=v_subtotal+v_shipping_total WHERE id=v_order_id;
  INSERT INTO public.payments(order_id,payment_method,status,amount,currency) VALUES(v_order_id,'cod','pending',v_subtotal+v_shipping_total,v_cart.currency);
  INSERT INTO public.order_status_history(order_id,previous_status,new_status,actor_type,note) VALUES(v_order_id,NULL,'received','system','Order received');
  DELETE FROM public.cart_items WHERE cart_id=v_cart.id;
  RETURN jsonb_build_object('order_id',v_order_id,'order_number',v_order_number,'subtotal',v_subtotal,'shipping_total',v_shipping_total,'grand_total',v_subtotal+v_shipping_total,'delivery_method',p_delivery_method,'address',v_address);
END; $$;
REVOKE ALL ON FUNCTION public.checkout_cart(uuid,text,text,text,text,uuid,uuid,text,text,text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.checkout_cart(uuid,text,text,text,text,uuid,uuid,text,text,text,uuid,text) TO service_role;

CREATE INDEX IF NOT EXISTS seller_orders_status_created_at_idx ON public.seller_orders(seller_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS seller_orders_store_id_idx ON public.seller_orders(store_id);
CREATE INDEX IF NOT EXISTS order_returns_seller_order_idx ON public.order_returns(seller_order_id, status);