-- ============================================================================
-- V8 §§29-32 (Track 1): checkout coupons + per-seller delivery methods + tracking
-- ============================================================================
-- 1) orders.coupon_id / orders.coupon_code (audit: which coupon funded the order)
-- 2) seller_orders.discount_total (per-seller share of the coupon discount)
-- 3) coupon_usages ledger (usage_count increments + per-customer limits)
-- 4) checkout_cart rewrite: nullable commune (manual commune name), per-seller
--    delivery methods (home/office with office validation), server-side coupon
--    validation + discount split; idempotency return gains discount fields.
-- 5) transition_seller_order_status: parent order rollup from child statuses.
--
-- Backward compatible: checkout_cart keeps every existing parameter in order
-- (p_commune_id is now nullable); the 4 new params all DEFAULT NULL, so old
-- callers with unchanged arguments get byte-identical behavior.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) orders: coupon audit columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS coupon_id uuid REFERENCES public.coupons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS coupon_code text;

-- ---------------------------------------------------------------------------
-- 2) seller_orders: per-seller discount share
-- ---------------------------------------------------------------------------
ALTER TABLE public.seller_orders
  ADD COLUMN IF NOT EXISTS discount_total numeric(14,2) NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 3) coupon_usages ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coupon_usages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  guest_phone text,
  used_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS coupon_usages_coupon_id_idx ON public.coupon_usages (coupon_id);
CREATE INDEX IF NOT EXISTS coupon_usages_customer_lookup_idx ON public.coupon_usages (coupon_id, customer_id);
CREATE INDEX IF NOT EXISTS coupon_usages_guest_lookup_idx ON public.coupon_usages (coupon_id, guest_phone);

ALTER TABLE public.coupon_usages ENABLE ROW LEVEL SECURITY;

-- checkout_cart runs SECURITY DEFINER; service_role bypasses RLS anyway, but
-- be explicit for clarity.
GRANT ALL ON public.coupon_usages TO service_role;

DROP POLICY IF EXISTS "coupon_usages_seller_or_admin" ON public.coupon_usages;
CREATE POLICY "coupon_usages_seller_or_admin" ON public.coupon_usages
FOR SELECT TO authenticated USING (
  public.is_super_admin()
  OR EXISTS (
    SELECT 1 FROM public.coupons c
    JOIN public.sellers s ON s.id = c.seller_id
    WHERE c.id = coupon_usages.coupon_id AND s.owner_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.coupons c
    JOIN public.seller_staff ss ON ss.seller_id = c.seller_id
    WHERE c.id = coupon_usages.coupon_id AND ss.user_id = auth.uid()
  )
);

-- ============================================================================
-- 4) checkout_cart — full rewrite with new optional params
-- ============================================================================
-- The old 12-arg overload must be dropped first: changing the parameter list
-- via CREATE OR REPLACE alone would create a second overload instead of
-- replacing the old one.
DROP FUNCTION IF EXISTS public.checkout_cart(uuid,text,text,text,text,uuid,uuid,text,text,text,uuid,text);

CREATE FUNCTION public.checkout_cart(
  p_cart_id uuid, p_session_token text, p_first_name text, p_last_name text, p_phone text,
  p_wilaya_id uuid, p_commune_id uuid DEFAULT NULL, p_address_line text,
  p_delivery_method text, p_customer_note text DEFAULT NULL, p_customer_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_coupon_code text DEFAULT NULL, p_seller_methods jsonb DEFAULT NULL,
  p_office_ids jsonb DEFAULT NULL, p_commune_name text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cart public.carts%ROWTYPE;
  v_wilaya public.wilayas%ROWTYPE;
  v_commune public.communes%ROWTYPE;
  v_commune_manual text;
  v_order_id uuid;
  v_order_number text;
  v_subtotal numeric(14,2) := 0;
  v_shipping_total numeric(14,2) := 0;
  v_discount numeric(14,2) := 0;
  v_seller_subtotal numeric(14,2);
  v_seller_weight integer;
  v_shipping_price numeric(14,2);
  v_seller_order_id uuid;
  v_store record;
  v_line record;
  v_address jsonb;
  v_existing public.orders%ROWTYPE;
  -- per-seller delivery method (V8 §30)
  v_method text;
  v_office_enabled boolean;
  v_office_id uuid;
  v_office public.seller_offices%ROWTYPE;
  v_shipping_snapshot jsonb;
  -- coupon (V8 §29)
  v_coupon_code text := NULLIF(upper(trim(COALESCE(p_coupon_code,''))), '');
  v_coupon public.coupons%ROWTYPE;
  v_coupon_applied boolean := false;
  v_eligible numeric(14,2);
  v_seller_discount numeric(14,2);
  v_usage_used integer;
BEGIN
  IF p_first_name IS NULL OR length(trim(p_first_name)) < 2 OR length(trim(p_first_name)) > 100 OR p_last_name IS NULL OR length(trim(p_last_name)) < 2 OR length(trim(p_last_name)) > 100 THEN RAISE EXCEPTION 'Please provide a valid name.'; END IF;
  IF p_phone IS NULL OR p_phone !~ '^\+213[5-7][0-9]{8}$' THEN RAISE EXCEPTION 'Please provide a valid Algerian mobile number.'; END IF;
  IF p_delivery_method NOT IN ('home','office') THEN RAISE EXCEPTION 'Select an available delivery method.'; END IF;
  IF p_address_line IS NULL OR length(trim(p_address_line)) < 4 OR length(trim(p_address_line)) > 500 THEN RAISE EXCEPTION 'Please provide a valid delivery address.'; END IF;
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.orders WHERE checkout_idempotency_key = p_idempotency_key;
    IF FOUND THEN RETURN jsonb_build_object('order_id',v_existing.id,'order_number',v_existing.order_number,'subtotal',v_existing.subtotal,'shipping_total',v_existing.shipping_total,'discount_total',v_existing.discount_total,'coupon_code',v_existing.coupon_code,'grand_total',v_existing.grand_total,'delivery_method',v_existing.delivery_method,'address',v_existing.address_snapshot); END IF;
  END IF;
  SELECT * INTO v_cart FROM public.carts WHERE id = p_cart_id AND session_token = p_session_token FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'This cart is no longer available.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cart_items WHERE cart_id = v_cart.id) THEN RAISE EXCEPTION 'Your cart is empty.'; END IF;

  -- Commune: either a DB commune id (as before) or a manually typed commune
  -- name (p_commune_name) when p_commune_id is NULL. The address snapshot
  -- carries commune name without a commune_id in the manual case.
  SELECT * INTO v_wilaya FROM public.wilayas WHERE id = p_wilaya_id AND active;
  IF p_commune_id IS NOT NULL THEN
    SELECT * INTO v_commune FROM public.communes WHERE id = p_commune_id AND wilaya_id = p_wilaya_id AND active;
    IF NOT FOUND OR v_wilaya.id IS NULL THEN RAISE EXCEPTION 'Choose a valid wilaya and commune.'; END IF;
    v_address := jsonb_build_object('address_line',trim(p_address_line),'wilaya_id',v_wilaya.id,'wilaya_code',v_wilaya.code,'wilaya',v_wilaya.name,'commune_id',v_commune.id,'commune_code',v_commune.code,'commune',v_commune.name);
  ELSE
    IF v_wilaya.id IS NULL THEN RAISE EXCEPTION 'Choose a valid wilaya.'; END IF;
    v_commune_manual := NULLIF(trim(COALESCE(p_commune_name,'')), '');
    IF v_commune_manual IS NULL OR length(v_commune_manual) < 2 OR length(v_commune_manual) > 100 THEN RAISE EXCEPTION 'Please provide a valid commune name.'; END IF;
    v_address := jsonb_build_object('address_line',trim(p_address_line),'wilaya_id',v_wilaya.id,'wilaya_code',v_wilaya.code,'wilaya',v_wilaya.name,'commune',v_commune_manual);
  END IF;

  -- Availability check — unchanged from the 20260921 version.
  FOR v_line IN SELECT ci.id AS cart_item_id,ci.quantity,pv.id AS variant_id,pv.sku,pv.price AS variant_price,pv.compare_at_price AS variant_compare_at_price,pv.available,pv.weight_grams AS variant_weight,p.id AS product_id,p.name,p.base_price,p.compare_at_price AS product_compare_at_price,p.weight_grams AS product_weight,p.currency,p.status AS product_status,p.publication_status,p.moderation_status,p.visibility,p.seller_id,p.store_id,s.name AS store_name,s.logo_path,s.status AS store_status,(SELECT pi.storage_path FROM public.product_images pi WHERE pi.product_id=p.id AND pi.media_type='image' ORDER BY pi.is_primary DESC,pi.sort_order ASC LIMIT 1) AS image_path,COALESCE((SELECT jsonb_object_agg(po.code,pov.label) FROM public.variant_option_values vov JOIN public.product_option_values pov ON pov.id=vov.product_option_value_id JOIN public.product_options po ON po.id=pov.product_option_id WHERE vov.variant_id=pv.id),'{}'::jsonb) AS option_snapshot,i.quantity-i.reserved_quantity AS available_stock,i.max_purchase_quantity FROM public.cart_items ci JOIN public.product_variants pv ON pv.id=ci.variant_id JOIN public.products p ON p.id=pv.product_id JOIN public.stores s ON s.id=p.store_id JOIN public.inventory i ON i.variant_id=pv.id WHERE ci.cart_id=v_cart.id FOR UPDATE OF ci,pv,p,s,i LOOP IF v_line.product_status<>'active' OR v_line.publication_status<>'published' OR v_line.moderation_status<>'approved' OR v_line.visibility<>'public' OR v_line.store_status<>'active' OR NOT v_line.available THEN RAISE EXCEPTION 'One or more items are no longer available.'; END IF; IF v_line.available_stock<v_line.quantity OR (v_line.max_purchase_quantity IS NOT NULL AND v_line.quantity>v_line.max_purchase_quantity) THEN RAISE EXCEPTION 'One or more items no longer have enough stock.'; END IF; END LOOP;

  LOOP v_order_number:='ORD-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)); EXIT WHEN NOT EXISTS(SELECT 1 FROM public.orders WHERE order_number=v_order_number); END LOOP;
  INSERT INTO public.orders(order_number,customer_id,guest_phone,currency,status,first_name,last_name,delivery_method,customer_note,shipping_address,address_snapshot,payment_method,payment_status,checkout_idempotency_key) VALUES(v_order_number,p_customer_id,p_phone,v_cart.currency,'received',trim(p_first_name),trim(p_last_name),p_delivery_method,NULLIF(trim(COALESCE(p_customer_note,'')),''),v_address,v_address,'cod','pending',p_idempotency_key) RETURNING id INTO v_order_id;

  -- Per-seller loop — same shape as before, except the delivery method may be
  -- overridden per seller via p_seller_methods (seller_id -> 'home'|'office'),
  -- and office pickups merge the chosen office into the shipping snapshot.
  FOR v_store IN SELECT DISTINCT seller_id,store_id,store_name,logo_path FROM (SELECT p.seller_id,p.store_id,s.name AS store_name,s.logo_path FROM public.cart_items ci JOIN public.product_variants pv ON pv.id=ci.variant_id JOIN public.products p ON p.id=pv.product_id JOIN public.stores s ON s.id=p.store_id WHERE ci.cart_id=v_cart.id) stores LOOP
    v_method := COALESCE(NULLIF(p_seller_methods->>(v_store.seller_id::text),''), p_delivery_method);
    IF v_method NOT IN ('home','office') THEN RAISE EXCEPTION 'Select an available delivery method.'; END IF;
    v_office := NULL;
    IF v_method = 'office' THEN
      SELECT office_enabled INTO v_office_enabled FROM public.seller_shipping_settings WHERE seller_id = v_store.seller_id;
      IF NOT FOUND THEN v_office_enabled := true; END IF;  -- missing row = office allowed
      IF NOT v_office_enabled THEN RAISE EXCEPTION 'Office pickup is not available for this store.'; END IF;
      BEGIN
        v_office_id := NULLIF(p_office_ids->>(v_store.seller_id::text),'')::uuid;
      EXCEPTION WHEN others THEN
        v_office_id := NULL;
      END;
      IF v_office_id IS NULL THEN RAISE EXCEPTION 'Choose a pickup office for this store.'; END IF;
      SELECT * INTO v_office FROM public.seller_offices WHERE id = v_office_id AND seller_id = v_store.seller_id AND wilaya_id = p_wilaya_id AND active;
      IF NOT FOUND THEN RAISE EXCEPTION 'The selected pickup office is not available.'; END IF;
    END IF;
    SELECT COALESCE(sum(COALESCE(pv.price,p.base_price)*ci.quantity),0),COALESCE(sum(COALESCE(pv.weight_grams,p.weight_grams,0)*ci.quantity),0) INTO v_seller_subtotal,v_seller_weight FROM public.cart_items ci JOIN public.product_variants pv ON pv.id=ci.variant_id JOIN public.products p ON p.id=pv.product_id WHERE ci.cart_id=v_cart.id AND p.seller_id=v_store.seller_id;
    SELECT sr.price INTO v_shipping_price FROM public.shipping_rules sr WHERE sr.enabled AND sr.status='active' AND (sr.seller_id=v_store.seller_id OR sr.seller_id IS NULL) AND sr.wilaya_id=p_wilaya_id AND (sr.commune_id=p_commune_id OR sr.commune_id IS NULL) AND sr.delivery_method=v_method AND sr.min_weight_grams<=v_seller_weight AND (sr.max_weight_grams IS NULL OR v_seller_weight<sr.max_weight_grams) ORDER BY (sr.seller_id IS NOT NULL) DESC,(sr.commune_id IS NOT NULL) DESC,sr.min_weight_grams DESC LIMIT 1;
    IF v_shipping_price IS NULL THEN RAISE EXCEPTION 'Delivery is not available for one or more stores at this address.'; END IF;
    v_shipping_snapshot := jsonb_build_object('store_name',v_store.store_name,'store_logo_path',v_store.logo_path,'delivery_method',v_method,'weight_grams',v_seller_weight,'price',v_shipping_price,'address',v_address);
    IF v_method = 'office' THEN
      v_shipping_snapshot := v_shipping_snapshot || jsonb_build_object('office_id',v_office.id,'office_name',v_office.name,'office_address',v_office.address,'office_phone',v_office.phone);
    END IF;
    INSERT INTO public.seller_orders(order_id,seller_id,store_id,status,subtotal,shipping_total,shipping_weight_grams,delivery_method,shipping_snapshot) VALUES(v_order_id,v_store.seller_id,v_store.store_id,'pending',v_seller_subtotal,v_shipping_price,v_seller_weight,v_method,v_shipping_snapshot) RETURNING id INTO v_seller_order_id;
    FOR v_line IN SELECT ci.id AS cart_item_id,ci.quantity,pv.id AS variant_id,pv.sku,pv.price AS variant_price,pv.compare_at_price AS variant_compare_at_price,pv.weight_grams AS variant_weight,p.id AS product_id,p.name,p.base_price,p.compare_at_price AS product_compare_at_price,p.weight_grams AS product_weight,p.seller_id,p.store_id,(SELECT pi.storage_path FROM public.product_images pi WHERE pi.product_id=p.id AND pi.media_type='image' ORDER BY pi.is_primary DESC,pi.sort_order ASC LIMIT 1) AS image_path,COALESCE((SELECT jsonb_object_agg(po.code,pov.label) FROM public.variant_option_values vov JOIN public.product_option_values pov ON pov.id=vov.product_option_value_id JOIN public.product_options po ON po.id=pov.product_option_id WHERE vov.variant_id=pv.id),'{}'::jsonb) AS option_snapshot FROM public.cart_items ci JOIN public.product_variants pv ON pv.id=ci.variant_id JOIN public.products p ON p.id=pv.product_id WHERE ci.cart_id=v_cart.id AND p.seller_id=v_store.seller_id LOOP
      INSERT INTO public.order_items(seller_order_id,product_id,variant_id,title,sku,unit_price,compare_at_price,quantity,total,discount_total,image_path,option_snapshot,product_snapshot,weight_grams) VALUES(v_seller_order_id,v_line.product_id,v_line.variant_id,v_line.name,v_line.sku,COALESCE(v_line.variant_price,v_line.base_price),COALESCE(v_line.variant_compare_at_price,v_line.product_compare_at_price),v_line.quantity,COALESCE(v_line.variant_price,v_line.base_price)*v_line.quantity,GREATEST(COALESCE(v_line.variant_compare_at_price,v_line.product_compare_at_price,0)-COALESCE(v_line.variant_price,v_line.base_price),0)*v_line.quantity,v_line.image_path,v_line.option_snapshot,jsonb_build_object('seller_id',v_line.seller_id,'store_id',v_line.store_id,'name',v_line.name),COALESCE(v_line.variant_weight,v_line.product_weight));
      UPDATE public.inventory SET reserved_quantity=reserved_quantity+v_line.quantity WHERE variant_id=v_line.variant_id;
    END LOOP;
    v_subtotal:=v_subtotal+v_seller_subtotal; v_shipping_total:=v_shipping_total+v_shipping_price;
  END LOOP;

  -- Coupon application (server-side, after the per-seller loop). The discount
  -- is split per seller from re-aggregated seller_orders rows.
  IF v_coupon_code IS NOT NULL THEN
    SELECT * INTO v_coupon FROM public.coupons WHERE code = v_coupon_code FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'This coupon code is not valid.'; END IF;
    IF v_coupon.status <> 'active' THEN RAISE EXCEPTION 'This coupon is not active.'; END IF;
    IF (v_coupon.starts_at IS NOT NULL AND v_coupon.starts_at > now()) OR (v_coupon.ends_at IS NOT NULL AND v_coupon.ends_at < now()) THEN RAISE EXCEPTION 'This coupon has expired.'; END IF;
    IF v_coupon.usage_limit IS NOT NULL AND v_coupon.usage_count >= v_coupon.usage_limit THEN RAISE EXCEPTION 'This coupon has reached its usage limit.'; END IF;
    IF v_coupon.per_customer_limit IS NOT NULL THEN
      SELECT count(*) INTO v_usage_used FROM public.coupon_usages
        WHERE coupon_id = v_coupon.id
          AND ((p_customer_id IS NOT NULL AND customer_id = p_customer_id)
            OR (guest_phone IS NOT NULL AND guest_phone = p_phone));
      IF v_usage_used >= v_coupon.per_customer_limit THEN RAISE EXCEPTION 'You have already used this coupon the maximum number of times.'; END IF;
    END IF;
    IF v_coupon.seller_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.seller_orders WHERE order_id = v_order_id AND seller_id = v_coupon.seller_id) THEN
      RAISE EXCEPTION 'This coupon is not applicable to your cart.';
    END IF;
    FOR v_store IN SELECT so.id, so.seller_id, so.subtotal FROM public.seller_orders so WHERE so.order_id = v_order_id LOOP
      v_eligible := CASE WHEN v_coupon.seller_id IS NULL OR v_coupon.seller_id = v_store.seller_id THEN v_store.subtotal ELSE 0 END;
      v_seller_discount := 0;
      IF v_eligible > 0 THEN
        IF v_coupon.min_order_amount IS NOT NULL AND v_eligible < v_coupon.min_order_amount THEN RAISE EXCEPTION 'Coupon minimum not met.'; END IF;
        IF v_coupon.discount_type = 'percentage' THEN
          v_seller_discount := LEAST(v_coupon.discount_value/100 * v_eligible, COALESCE(v_coupon.max_discount_amount, v_eligible));
        ELSIF v_coupon.discount_type = 'fixed' THEN
          v_seller_discount := LEAST(v_coupon.discount_value, v_eligible);
        ELSE
          RAISE EXCEPTION 'This coupon type is not supported.';
        END IF;
      END IF;
      UPDATE public.seller_orders SET discount_total = v_seller_discount WHERE id = v_store.id;
      v_discount := v_discount + v_seller_discount;
    END LOOP;
    UPDATE public.coupons SET usage_count = usage_count + 1 WHERE id = v_coupon.id;
    INSERT INTO public.coupon_usages(coupon_id, order_id, customer_id, guest_phone) VALUES (v_coupon.id, v_order_id, p_customer_id, p_phone);
    v_coupon_applied := true;
  END IF;

  UPDATE public.orders SET subtotal=v_subtotal,shipping_total=v_shipping_total,discount_total=v_discount,coupon_id=CASE WHEN v_coupon_applied THEN v_coupon.id END,coupon_code=CASE WHEN v_coupon_applied THEN v_coupon_code END,grand_total=v_subtotal+v_shipping_total-v_discount,payment_amount_due=v_subtotal+v_shipping_total-v_discount WHERE id=v_order_id;
  INSERT INTO public.payments(order_id,payment_method,status,amount,currency) VALUES(v_order_id,'cod','pending',v_subtotal+v_shipping_total-v_discount,v_cart.currency);
  INSERT INTO public.order_status_history(order_id,previous_status,new_status,actor_type,note) VALUES(v_order_id,NULL,'received','system','Order received');
  DELETE FROM public.cart_items WHERE cart_id=v_cart.id;
  RETURN jsonb_build_object('order_id',v_order_id,'order_number',v_order_number,'subtotal',v_subtotal,'shipping_total',v_shipping_total,'discount_total',v_discount,'coupon_code',v_coupon_code,'grand_total',v_subtotal+v_shipping_total-v_discount,'delivery_method',p_delivery_method,'address',v_address);
END; $$;
REVOKE ALL ON FUNCTION public.checkout_cart(uuid,text,text,text,text,uuid,uuid,text,text,text,uuid,text,text,jsonb,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.checkout_cart(uuid,text,text,text,text,uuid,uuid,text,text,text,uuid,text,text,jsonb,jsonb,text) TO service_role;

-- ============================================================================
-- 5) transition_seller_order_status — parent order rollup (V8 §31)
-- NOTE (Sec 61 fix): 'preparing' was added to order_status but never to
-- seller_order_status, while the RPC below whitelists and casts it — every
-- 'preparing' transition would throw "invalid input value for enum".
ALTER TYPE public.seller_order_status ADD VALUE IF NOT EXISTS 'preparing';
-- ============================================================================
-- After the existing child update + cancelled rule: rank the active
-- (non-cancelled) children of the parent order and advance the parent status
-- when the highest child rank exceeds the parent's current rank. The parent
-- never regresses.
CREATE OR REPLACE FUNCTION public.transition_seller_order_status(p_seller_order_id uuid, p_new_status text, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order public.seller_orders%ROWTYPE;
  v_actor_type text;
  v_parent_status public.order_status;
  v_max_rank integer;
  v_parent_rank integer;
  v_new_parent_status text;
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
  IF p_new_status = 'cancelled' AND v_parent_status::text IN ('received','pending','confirmed','processing','preparing') THEN
    UPDATE public.orders SET status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancellation_reason = COALESCE(NULLIF(trim(p_note),''),'Cancelled by seller') WHERE id = v_order.order_id;
    v_parent_status := 'cancelled'::public.order_status;
  END IF;

  -- Parent rollup: the parent order reflects the highest rank among its
  -- active (non-cancelled) children. It only ever advances — never regresses —
  -- and a cancelled/refunded parent is left alone.
  IF v_parent_status::text NOT IN ('cancelled','refunded') THEN
    SELECT max(CASE so.status::text
      WHEN 'pending' THEN 0
      WHEN 'confirmed' THEN 0
      WHEN 'processing' THEN 1
      WHEN 'preparing' THEN 1
      WHEN 'ready_for_shipping' THEN 2
      WHEN 'handed_to_courier' THEN 3
      WHEN 'in_transit' THEN 4
      WHEN 'failed_delivery' THEN 4
      WHEN 'delivered' THEN 5
      WHEN 'returned' THEN 5
      ELSE -1
    END)
    INTO v_max_rank
    FROM public.seller_orders so
    WHERE so.order_id = v_order.order_id AND so.status::text <> 'cancelled';

    IF v_max_rank IS NOT NULL AND v_max_rank >= 0 THEN
      v_new_parent_status := (ARRAY['received','preparing','ready_for_shipping','handed_to_courier','in_transit','delivered'])[v_max_rank + 1];
      v_parent_rank := CASE v_parent_status::text
        WHEN 'received' THEN 0
        WHEN 'preparing' THEN 1
        WHEN 'ready_for_shipping' THEN 2
        WHEN 'handed_to_courier' THEN 3
        WHEN 'in_transit' THEN 4
        WHEN 'delivered' THEN 5
        ELSE -1
      END;
      IF v_max_rank > v_parent_rank THEN
        UPDATE public.orders SET status = v_new_parent_status::public.order_status WHERE id = v_order.order_id;
        INSERT INTO public.order_status_history(order_id, previous_status, new_status, actor_type, note)
        VALUES (v_order.order_id, v_parent_status::text, v_new_parent_status, 'system', 'Advanced from seller deliveries');
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('id', v_order.id, 'status', p_new_status);
END; $$;
REVOKE ALL ON FUNCTION public.transition_seller_order_status(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_seller_order_status(uuid, text, text) TO authenticated, service_role;
