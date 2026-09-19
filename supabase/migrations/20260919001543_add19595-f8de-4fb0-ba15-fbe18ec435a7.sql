ALTER TABLE public.cart_items
  ADD COLUMN unit_price_snapshot numeric(14,2),
  ADD COLUMN compare_at_price_snapshot numeric(14,2),
  ADD COLUMN product_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN availability_checked_at timestamptz;

ALTER TABLE public.orders
  ADD COLUMN first_name text,
  ADD COLUMN last_name text,
  ADD COLUMN delivery_method text,
  ADD COLUMN customer_note text,
  ADD COLUMN address_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.seller_orders
  ADD COLUMN store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  ADD COLUMN delivery_method text,
  ADD COLUMN shipping_weight_grams integer NOT NULL DEFAULT 0,
  ADD COLUMN shipping_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.order_items
  ADD COLUMN compare_at_price numeric(14,2),
  ADD COLUMN discount_total numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN image_path text,
  ADD COLUMN option_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN product_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN weight_grams integer;

ALTER TABLE public.shipping_rules
  ADD COLUMN min_weight_grams integer NOT NULL DEFAULT 0,
  ADD COLUMN max_weight_grams integer,
  ADD COLUMN enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.shipping_rules
  ADD CONSTRAINT shipping_rules_weight_range_check CHECK (min_weight_grams >= 0 AND (max_weight_grams IS NULL OR max_weight_grams > min_weight_grams)),
  ADD CONSTRAINT shipping_rules_delivery_method_check CHECK (delivery_method IN ('home', 'office'));

CREATE INDEX cart_items_cart_id_idx ON public.cart_items(cart_id);
CREATE INDEX shipping_rules_lookup_idx ON public.shipping_rules(seller_id, wilaya_id, commune_id, delivery_method, enabled, min_weight_grams);
CREATE INDEX orders_order_number_idx ON public.orders(order_number);

DROP POLICY IF EXISTS "carts_guest_session" ON public.carts;
CREATE POLICY "carts_guest_session" ON public.carts FOR ALL TO anon, authenticated
  USING (customer_id IS NULL AND session_token = current_setting('request.headers', true)::json->>'x-modalia-session')
  WITH CHECK (customer_id IS NULL AND session_token = current_setting('request.headers', true)::json->>'x-modalia-session');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cart_items TO anon, authenticated;
DROP POLICY IF EXISTS "cart_items_guest_session" ON public.cart_items;
CREATE POLICY "cart_items_guest_session" ON public.cart_items FOR ALL TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.carts WHERE carts.id = cart_items.cart_id AND carts.customer_id IS NULL AND carts.session_token = current_setting('request.headers', true)::json->>'x-modalia-session'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.carts WHERE carts.id = cart_items.cart_id AND carts.customer_id IS NULL AND carts.session_token = current_setting('request.headers', true)::json->>'x-modalia-session'));

CREATE OR REPLACE FUNCTION public.checkout_cart(
  p_cart_id uuid,
  p_session_token text,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_wilaya_id uuid,
  p_commune_id uuid,
  p_address_line text,
  p_delivery_method text,
  p_customer_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cart public.carts%ROWTYPE;
  v_wilaya public.wilayas%ROWTYPE;
  v_commune public.communes%ROWTYPE;
  v_order_id uuid;
  v_order_number text;
  v_subtotal numeric(14,2) := 0;
  v_shipping_total numeric(14,2) := 0;
  v_seller_subtotal numeric(14,2);
  v_seller_weight integer;
  v_shipping_price numeric(14,2);
  v_seller_order_id uuid;
  v_store record;
  v_line record;
  v_address jsonb;
BEGIN
  IF p_first_name IS NULL OR length(trim(p_first_name)) < 2 OR length(trim(p_first_name)) > 100 OR p_last_name IS NULL OR length(trim(p_last_name)) < 2 OR length(trim(p_last_name)) > 100 THEN
    RAISE EXCEPTION 'Please provide a valid name.';
  END IF;
  IF p_phone IS NULL OR p_phone !~ '^\\+213[5-7][0-9]{8}$' THEN
    RAISE EXCEPTION 'Please provide a valid Algerian mobile number.';
  END IF;
  IF p_delivery_method NOT IN ('home', 'office') THEN
    RAISE EXCEPTION 'Select an available delivery method.';
  END IF;
  IF p_address_line IS NULL OR length(trim(p_address_line)) < 4 OR length(trim(p_address_line)) > 500 THEN
    RAISE EXCEPTION 'Please provide a valid delivery address.';
  END IF;

  SELECT * INTO v_cart FROM public.carts WHERE id = p_cart_id AND session_token = p_session_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This cart is no longer available.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cart_items WHERE cart_id = v_cart.id) THEN RAISE EXCEPTION 'Your cart is empty.'; END IF;

  SELECT * INTO v_wilaya FROM public.wilayas WHERE id = p_wilaya_id AND active;
  SELECT * INTO v_commune FROM public.communes WHERE id = p_commune_id AND wilaya_id = p_wilaya_id AND active;
  IF NOT FOUND OR v_wilaya.id IS NULL THEN RAISE EXCEPTION 'Choose a valid wilaya and commune.'; END IF;

  FOR v_line IN
    SELECT ci.id AS cart_item_id, ci.quantity, pv.id AS variant_id, pv.sku, pv.price AS variant_price, pv.compare_at_price AS variant_compare_at_price, pv.available, pv.weight_grams AS variant_weight, p.id AS product_id, p.name, p.base_price, p.compare_at_price AS product_compare_at_price, p.weight_grams AS product_weight, p.currency, p.status AS product_status, p.publication_status, p.moderation_status, p.visibility, p.seller_id, p.store_id, s.name AS store_name, s.logo_path, s.status AS store_status,
      (SELECT pi.storage_path FROM public.product_images pi WHERE pi.product_id = p.id AND pi.media_type = 'image' ORDER BY pi.is_primary DESC, pi.sort_order ASC LIMIT 1) AS image_path,
      COALESCE((SELECT jsonb_object_agg(po.code, pov.label) FROM public.variant_option_values vov JOIN public.product_option_values pov ON pov.id = vov.product_option_value_id JOIN public.product_options po ON po.id = pov.product_option_id WHERE vov.variant_id = pv.id), '{}'::jsonb) AS option_snapshot,
      i.quantity - i.reserved_quantity AS available_stock, i.max_purchase_quantity
    FROM public.cart_items ci
    JOIN public.product_variants pv ON pv.id = ci.variant_id
    JOIN public.products p ON p.id = pv.product_id
    JOIN public.stores s ON s.id = p.store_id
    JOIN public.inventory i ON i.variant_id = pv.id
    WHERE ci.cart_id = v_cart.id
    FOR UPDATE OF ci, pv, p, s, i
  LOOP
    IF v_line.product_status <> 'active' OR v_line.publication_status <> 'published' OR v_line.moderation_status <> 'approved' OR v_line.visibility <> 'public' OR v_line.store_status <> 'active' OR NOT v_line.available THEN
      RAISE EXCEPTION 'One or more items are no longer available.';
    END IF;
    IF v_line.available_stock < v_line.quantity OR (v_line.max_purchase_quantity IS NOT NULL AND v_line.quantity > v_line.max_purchase_quantity) THEN
      RAISE EXCEPTION 'One or more items no longer have enough stock.';
    END IF;
  END LOOP;

  v_address := jsonb_build_object('address_line', trim(p_address_line), 'wilaya_id', v_wilaya.id, 'wilaya_code', v_wilaya.code, 'wilaya', v_wilaya.name, 'commune_id', v_commune.id, 'commune_code', v_commune.code, 'commune', v_commune.name);
  LOOP
    v_order_number := 'ORD-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.orders WHERE order_number = v_order_number);
  END LOOP;

  INSERT INTO public.orders(order_number, guest_phone, currency, status, first_name, last_name, delivery_method, customer_note, shipping_address, address_snapshot)
  VALUES (v_order_number, p_phone, v_cart.currency, 'pending', trim(p_first_name), trim(p_last_name), p_delivery_method, NULLIF(trim(COALESCE(p_customer_note, '')), ''), v_address, v_address)
  RETURNING id INTO v_order_id;

  FOR v_store IN SELECT DISTINCT seller_id, store_id, store_name, logo_path FROM (
    SELECT p.seller_id, p.store_id, s.name AS store_name, s.logo_path FROM public.cart_items ci JOIN public.product_variants pv ON pv.id = ci.variant_id JOIN public.products p ON p.id = pv.product_id JOIN public.stores s ON s.id = p.store_id WHERE ci.cart_id = v_cart.id
  ) stores LOOP
    SELECT COALESCE(sum((COALESCE(pv.price, p.base_price)) * ci.quantity), 0), COALESCE(sum(COALESCE(pv.weight_grams, p.weight_grams, 0) * ci.quantity), 0)
    INTO v_seller_subtotal, v_seller_weight
    FROM public.cart_items ci JOIN public.product_variants pv ON pv.id = ci.variant_id JOIN public.products p ON p.id = pv.product_id
    WHERE ci.cart_id = v_cart.id AND p.seller_id = v_store.seller_id;

    SELECT sr.price INTO v_shipping_price FROM public.shipping_rules sr
    WHERE sr.enabled AND sr.status = 'active' AND (sr.seller_id = v_store.seller_id OR sr.seller_id IS NULL) AND sr.wilaya_id = p_wilaya_id AND (sr.commune_id = p_commune_id OR sr.commune_id IS NULL) AND sr.delivery_method = p_delivery_method AND sr.min_weight_grams <= v_seller_weight AND (sr.max_weight_grams IS NULL OR v_seller_weight < sr.max_weight_grams)
    ORDER BY (sr.seller_id IS NOT NULL) DESC, (sr.commune_id IS NOT NULL) DESC, sr.min_weight_grams DESC LIMIT 1;
    IF v_shipping_price IS NULL THEN RAISE EXCEPTION 'Delivery is not available for one or more stores at this address.'; END IF;

    INSERT INTO public.seller_orders(order_id, seller_id, store_id, status, subtotal, shipping_total, shipping_weight_grams, delivery_method, shipping_snapshot)
    VALUES (v_order_id, v_store.seller_id, v_store.store_id, 'pending', v_seller_subtotal, v_shipping_price, v_seller_weight, p_delivery_method, jsonb_build_object('store_name', v_store.store_name, 'store_logo_path', v_store.logo_path, 'delivery_method', p_delivery_method, 'weight_grams', v_seller_weight, 'price', v_shipping_price, 'address', v_address))
    RETURNING id INTO v_seller_order_id;

    FOR v_line IN
      SELECT ci.id AS cart_item_id, ci.quantity, pv.id AS variant_id, pv.sku, pv.price AS variant_price, pv.compare_at_price AS variant_compare_at_price, pv.weight_grams AS variant_weight, p.id AS product_id, p.name, p.base_price, p.compare_at_price AS product_compare_at_price, p.weight_grams AS product_weight, p.seller_id, p.store_id,
        (SELECT pi.storage_path FROM public.product_images pi WHERE pi.product_id = p.id AND pi.media_type = 'image' ORDER BY pi.is_primary DESC, pi.sort_order ASC LIMIT 1) AS image_path,
        COALESCE((SELECT jsonb_object_agg(po.code, pov.label) FROM public.variant_option_values vov JOIN public.product_option_values pov ON pov.id = vov.product_option_value_id JOIN public.product_options po ON po.id = pov.product_option_id WHERE vov.variant_id = pv.id), '{}'::jsonb) AS option_snapshot
      FROM public.cart_items ci JOIN public.product_variants pv ON pv.id = ci.variant_id JOIN public.products p ON p.id = pv.product_id
      WHERE ci.cart_id = v_cart.id AND p.seller_id = v_store.seller_id
    LOOP
      INSERT INTO public.order_items(seller_order_id, product_id, variant_id, title, sku, unit_price, compare_at_price, quantity, total, discount_total, image_path, option_snapshot, product_snapshot, weight_grams)
      VALUES (v_seller_order_id, v_line.product_id, v_line.variant_id, v_line.name, v_line.sku, COALESCE(v_line.variant_price, v_line.base_price), COALESCE(v_line.variant_compare_at_price, v_line.product_compare_at_price), v_line.quantity, COALESCE(v_line.variant_price, v_line.base_price) * v_line.quantity, GREATEST(COALESCE(v_line.variant_compare_at_price, v_line.product_compare_at_price, 0) - COALESCE(v_line.variant_price, v_line.base_price), 0) * v_line.quantity, v_line.image_path, v_line.option_snapshot, jsonb_build_object('seller_id', v_line.seller_id, 'store_id', v_line.store_id, 'name', v_line.name), COALESCE(v_line.variant_weight, v_line.product_weight));
      UPDATE public.inventory SET reserved_quantity = reserved_quantity + v_line.quantity WHERE variant_id = v_line.variant_id;
    END LOOP;
    v_subtotal := v_subtotal + v_seller_subtotal;
    v_shipping_total := v_shipping_total + v_shipping_price;
  END LOOP;

  UPDATE public.orders SET subtotal = v_subtotal, shipping_total = v_shipping_total, grand_total = v_subtotal + v_shipping_total WHERE id = v_order_id;
  DELETE FROM public.cart_items WHERE cart_id = v_cart.id;
  RETURN jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number, 'subtotal', v_subtotal, 'shipping_total', v_shipping_total, 'grand_total', v_subtotal + v_shipping_total, 'delivery_method', p_delivery_method, 'address', v_address);
END;
$$;

REVOKE ALL ON FUNCTION public.checkout_cart(uuid, text, text, text, text, uuid, uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.checkout_cart(uuid, text, text, text, text, uuid, uuid, text, text, text) TO service_role;