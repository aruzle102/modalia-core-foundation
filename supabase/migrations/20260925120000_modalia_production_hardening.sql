-- Modalia production hardening + complete Algeria baseline + minimal test catalog.
-- This migration is additive and intentionally reuses the existing commerce schema.

-- Public catalog security: guests may only see fully published products.
DROP POLICY IF EXISTS "products_public_or_owner" ON public.products;
CREATE POLICY "products_public_or_owner" ON public.products
FOR SELECT TO anon, authenticated
USING (
  (status = 'active' AND publication_status = 'published' AND moderation_status = 'approved' AND visibility = 'public')
  OR public.is_super_admin()
  OR EXISTS (SELECT 1 FROM public.sellers s WHERE s.id = products.seller_id AND s.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = products.seller_id AND ss.user_id = auth.uid())
);

-- Prevent seller ownership escalation through a direct seller_id/store_id change.
DROP POLICY IF EXISTS "products_seller_write" ON public.products;
CREATE POLICY "products_seller_write" ON public.products
FOR ALL TO authenticated
USING (
  public.is_super_admin()
  OR EXISTS (SELECT 1 FROM public.sellers s WHERE s.id = products.seller_id AND s.owner_id = auth.uid() AND s.account_status = 'active')
  OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = products.seller_id AND ss.user_id = auth.uid() AND (ss.permissions ? 'products.edit' OR ss.permissions ? 'products.create' OR ss.permissions ? 'products.delete'))
)
WITH CHECK (
  public.is_super_admin()
  OR EXISTS (SELECT 1 FROM public.sellers s WHERE s.id = products.seller_id AND s.owner_id = auth.uid() AND s.account_status = 'active')
  OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = products.seller_id AND ss.user_id = auth.uid() AND (ss.permissions ? 'products.create' OR ss.permissions ? 'products.edit'))
);

-- Harden order reads and prevent direct client-side mutation of financial records.
REVOKE INSERT, UPDATE, DELETE ON public.orders FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.seller_orders FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.order_items FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.payments FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.order_status_history FROM authenticated, anon;

-- Authenticated users can read their own notifications.
DROP POLICY IF EXISTS "notifications_own_read" ON public.notifications;
CREATE POLICY "notifications_own_read" ON public.notifications
FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_super_admin());

-- Full Algeria wilaya baseline. Names are stored in all supported locales.
INSERT INTO public.wilayas (code, name, active)
VALUES
('01','{"ar":"أدرار","fr":"Adrar","en":"Adrar"}',true),
('02','{"ar":"الشلف","fr":"Chlef","en":"Chlef"}',true),
('03','{"ar":"الأغواط","fr":"Laghouat","en":"Laghouat"}',true),
('04','{"ar":"أم البواقي","fr":"Oum El Bouaghi","en":"Oum El Bouaghi"}',true),
('05','{"ar":"باتنة","fr":"Batna","en":"Batna"}',true),
('06','{"ar":"بجاية","fr":"Béjaïa","en":"Bejaia"}',true),
('07','{"ar":"بسكرة","fr":"Biskra","en":"Biskra"}',true),
('08','{"ar":"بشار","fr":"Béchar","en":"Bechar"}',true),
('09','{"ar":"البليدة","fr":"Blida","en":"Blida"}',true),
('10','{"ar":"البويرة","fr":"Bouira","en":"Bouira"}',true),
('11','{"ar":"تمنراست","fr":"Tamanrasset","en":"Tamanrasset"}',true),
('12','{"ar":"تبسة","fr":"Tébessa","en":"Tebessa"}',true),
('13','{"ar":"تلمسان","fr":"Tlemcen","en":"Tlemcen"}',true),
('14','{"ar":"تيارت","fr":"Tiaret","en":"Tiaret"}',true),
('15','{"ar":"تيزي وزو","fr":"Tizi Ouzou","en":"Tizi Ouzou"}',true),
('16','{"ar":"الجزائر","fr":"Alger","en":"Algiers"}',true),
('17','{"ar":"الجلفة","fr":"Djelfa","en":"Djelfa"}',true),
('18','{"ar":"جيجل","fr":"Jijel","en":"Jijel"}',true),
('19','{"ar":"سطيف","fr":"Sétif","en":"Setif"}',true),
('20','{"ar":"سعيدة","fr":"Saïda","en":"Saida"}',true),
('21','{"ar":"سكيكدة","fr":"Skikda","en":"Skikda"}',true),
('22','{"ar":"سيدي بلعباس","fr":"Sidi Bel Abbès","en":"Sidi Bel Abbes"}',true),
('23','{"ar":"عنابة","fr":"Annaba","en":"Annaba"}',true),
('24','{"ar":"قالمة","fr":"Guelma","en":"Guelma"}',true),
('25','{"ar":"قسنطينة","fr":"Constantine","en":"Constantine"}',true),
('26','{"ar":"المدية","fr":"Médéa","en":"Medea"}',true),
('27','{"ar":"مستغانم","fr":"Mostaganem","en":"Mostaganem"}',true),
('28','{"ar":"المسيلة","fr":"M\u2019Sila","en":"M'Sila"}',true),
('29','{"ar":"معسكر","fr":"Mascara","en":"Mascara"}',true),
('30','{"ar":"ورقلة","fr":"Ouargla","en":"Ouargla"}',true),
('31','{"ar":"وهران","fr":"Oran","en":"Oran"}',true),
('32','{"ar":"البيض","fr":"El Bayadh","en":"El Bayadh"}',true),
('33','{"ar":"إليزي","fr":"Illizi","en":"Illizi"}',true),
('34','{"ar":"برج بوعريريج","fr":"Bordj Bou Arréridj","en":"Bordj Bou Arreridj"}',true),
('35','{"ar":"بومرداس","fr":"Boumerdès","en":"Boumerdes"}',true),
('36','{"ar":"الطارف","fr":"El Tarf","en":"El Tarf"}',true),
('37','{"ar":"تندوف","fr":"Tindouf","en":"Tindouf"}',true),
('38','{"ar":"تيسمسيلت","fr":"Tissemsilt","en":"Tissemsilt"}',true),
('39','{"ar":"الوادي","fr":"El Oued","en":"El Oued"}',true),
('40','{"ar":"خنشلة","fr":"Khenchela","en":"Khenchela"}',true),
('41','{"ar":"سوق أهراس","fr":"Souk Ahras","en":"Souk Ahras"}',true),
('42','{"ar":"تيبازة","fr":"Tipaza","en":"Tipaza"}',true),
('43','{"ar":"ميلة","fr":"Mila","en":"Mila"}',true),
('44','{"ar":"عين الدفلى","fr":"Aïn Defla","en":"Ain Defla"}',true),
('45','{"ar":"النعامة","fr":"Naâma","en":"Naama"}',true),
('46','{"ar":"عين تموشنت","fr":"Aïn Témouchent","en":"Ain Temouchent"}',true),
('47','{"ar":"غرداية","fr":"Ghardaïa","en":"Ghardaia"}',true),
('48','{"ar":"غليزان","fr":"Relizane","en":"Relizane"}',true),
('49','{"ar":"تيميمون","fr":"Timimoun","en":"Timimoun"}',true),
('50','{"ar":"برج باجي مختار","fr":"Bordj Badji Mokhtar","en":"Bordj Badji Mokhtar"}',true),
('51','{"ar":"أولاد جلال","fr":"Ouled Djellal","en":"Ouled Djellal"}',true),
('52','{"ar":"بني عباس","fr":"Béni Abbès","en":"Beni Abbes"}',true),
('53','{"ar":"إن صالح","fr":"In Salah","en":"In Salah"}',true),
('54','{"ar":"إن قزام","fr":"In Guezzam","en":"In Guezzam"}',true),
('55','{"ar":"تقرت","fr":"Touggourt","en":"Touggourt"}',true),
('56','{"ar":"جانت","fr":"Djanet","en":"Djanet"}',true),
('57','{"ar":"المغير","fr":"El M'Ghair","en":"El M'Ghair"}',true),
('58','{"ar":"المنيعة","fr":"El Meniaa","en":"El Meniaa"}',true)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, active = true;

-- Ensure a usable fallback commune exists for each wilaya. The checkout UI still permits
-- the customer to provide a precise address; real commune imports can replace these rows.
INSERT INTO public.communes (wilaya_id, code, name, active)
SELECT w.id, w.code || '-000', jsonb_build_object('ar','المركز / أخرى','fr','Centre / Autre','en','Centre / Other'), true
FROM public.wilayas w
WHERE NOT EXISTS (SELECT 1 FROM public.communes c WHERE c.wilaya_id = w.id);

-- Admin-configurable baseline shipping: 0-5kg and >5kg, home and office.
INSERT INTO public.shipping_rules (seller_id, wilaya_id, commune_id, delivery_method, price, status, min_weight_grams, max_weight_grams, enabled)
SELECT NULL, w.id, NULL, 'home', 600, 'active', 0, 5000, true FROM public.wilayas w
ON CONFLICT DO NOTHING;
INSERT INTO public.shipping_rules (seller_id, wilaya_id, commune_id, delivery_method, price, status, min_weight_grams, max_weight_grams, enabled)
SELECT NULL, w.id, NULL, 'home', 800, 'active', 5001, NULL, true FROM public.wilayas w
ON CONFLICT DO NOTHING;
INSERT INTO public.shipping_rules (seller_id, wilaya_id, commune_id, delivery_method, price, status, min_weight_grams, max_weight_grams, enabled)
SELECT NULL, w.id, NULL, 'office', 450, 'active', 0, 5000, true FROM public.wilayas w
ON CONFLICT DO NOTHING;
INSERT INTO public.shipping_rules (seller_id, wilaya_id, commune_id, delivery_method, price, status, min_weight_grams, max_weight_grams, enabled)
SELECT NULL, w.id, NULL, 'office', 650, 'active', 5001, NULL, true FROM public.wilayas w
ON CONFLICT DO NOTHING;

-- One and only one minimal test seller/store/product/variant/inventory.
DO $$
DECLARE
  v_seller uuid;
  v_store uuid;
  v_category uuid;
  v_product uuid;
  v_variant uuid;
BEGIN
  SELECT id INTO v_seller FROM public.sellers WHERE legal_name = 'Modalia Test Seller' LIMIT 1;
  IF v_seller IS NULL THEN
    v_seller := gen_random_uuid();
    INSERT INTO public.sellers(id, owner_id, legal_name, status, first_name, last_name, email, account_status, commission_rate)
    VALUES (v_seller, gen_random_uuid(), 'Modalia Test Seller', 'active', 'Modalia', 'Test', 'test@modalia.local', 'active', 0.10);
  END IF;

  SELECT id INTO v_store FROM public.stores WHERE slug = 'modalia-test-store' LIMIT 1;
  IF v_store IS NULL THEN
    v_store := gen_random_uuid();
    INSERT INTO public.stores(id, seller_id, slug, name, description, status, verification_status, settings)
    VALUES (v_store, v_seller, 'modalia-test-store', 'Modalia Test Store', 'Small development store used only for purchase testing.', 'active', 'verified', '{"test_data":true}'::jsonb);
  END IF;

  SELECT id INTO v_category FROM public.categories WHERE slug = 'test-bags' LIMIT 1;
  IF v_category IS NULL THEN
    v_category := gen_random_uuid();
    INSERT INTO public.categories(id, slug, name, status, sort_order)
    VALUES (v_category, 'test-bags', '{"ar":"حقائب اختبار","fr":"Sacs test","en":"Test Bags"}'::jsonb, 'active', 999);
  END IF;

  SELECT id INTO v_product FROM public.products WHERE slug = 'modalia-essential-tote-noir' LIMIT 1;
  IF v_product IS NULL THEN
    v_product := gen_random_uuid();
    INSERT INTO public.products(id, seller_id, store_id, category_id, slug, name, description, short_description, status, currency, base_price, compare_at_price, publication_status, moderation_status, visibility, featured, published_at, weight_grams, metadata)
    VALUES (v_product, v_seller, v_store, v_category, 'modalia-essential-tote-noir',
      '{"ar":"حقيبة موداليا الأساسية - أسود","fr":"Tote essentiel Modalia - Noir","en":"Modalia Essential Tote - Noir"}'::jsonb,
      '{"ar":"منتج اختبار واحد فقط للشراء التجريبي.","fr":"Produit de test unique pour vérifier l\u2019achat.","en":"Single test product for purchase verification."}'::jsonb,
      '{"ar":"منتج اختبار واحد","fr":"Produit test","en":"Single test product"}'::jsonb,
      'active','DZD',4500,5500,'published','approved','public',false,now(),650,'{"test_data":true}'::jsonb);
  END IF;

  SELECT id INTO v_variant FROM public.product_variants WHERE product_id = v_product LIMIT 1;
  IF v_variant IS NULL THEN
    v_variant := gen_random_uuid();
    INSERT INTO public.product_variants(id, product_id, sku, attributes, price, status, compare_at_price, available, weight_grams, sort_order)
    VALUES (v_variant, v_product, 'MOD-TEST-TOTE-NOIR', '{"color":"Noir"}'::jsonb, 4500, 'active', 5500, true, 650, 0);
  END IF;

  INSERT INTO public.inventory(variant_id, quantity, reserved_quantity, low_stock_threshold, max_purchase_quantity)
  VALUES (v_variant, 25, 0, 3, 5)
  ON CONFLICT (variant_id) DO UPDATE SET quantity = GREATEST(public.inventory.quantity, 25), reserved_quantity = LEAST(public.inventory.reserved_quantity, public.inventory.quantity);

  INSERT INTO public.product_images(product_id, storage_path, alt_text, sort_order, is_primary, media_type, metadata)
  SELECT v_product,
    'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=1200&q=82',
    '{"ar":"حقيبة اختبار موداليا","fr":"Sac test Modalia","en":"Modalia test tote"}'::jsonb, 0, true, 'image', '{"test_data":true}'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.product_images WHERE product_id = v_product);
END $$;

-- Secure the payment proof bucket if it exists; create it as private when possible.
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Product media is public only through approved catalog images; sensitive proof remains private.
DROP POLICY IF EXISTS "payment_proofs_private_read" ON storage.objects;
CREATE POLICY "payment_proofs_private_read" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'payment-proofs'
  AND (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.seller_settlements ss
      JOIN public.sellers s ON s.id = ss.seller_id
      WHERE ss.payment_proof_path = storage.objects.name AND s.owner_id = auth.uid()
    )
  )
);
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-media', 'product-media', true)
ON CONFLICT (id) DO UPDATE SET public = true;
DROP POLICY IF EXISTS "Public can view active product media" ON storage.objects;
CREATE POLICY "Public can view published product media"
ON storage.objects FOR SELECT TO anon, authenticated
USING (
  bucket_id = 'product-media'
  AND EXISTS (
    SELECT 1 FROM public.product_images image
    JOIN public.products product ON product.id = image.product_id
    WHERE image.storage_path = storage.objects.name
      AND product.status = 'active'
      AND product.publication_status = 'published'
      AND product.moderation_status = 'approved'
      AND product.visibility = 'public'
  )
);
