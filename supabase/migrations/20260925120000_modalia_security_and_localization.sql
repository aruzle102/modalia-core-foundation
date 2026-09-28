-- Modalia catalogue hardening, Algeria locations, and baseline shipping.
DROP POLICY IF EXISTS "products_public_or_owner" ON public.products;
CREATE POLICY "products_public_or_owner" ON public.products
FOR SELECT TO anon, authenticated
USING (
  (status = 'active' AND publication_status = 'published' AND moderation_status = 'approved' AND visibility = 'public')
  OR public.is_super_admin()
  OR EXISTS (SELECT 1 FROM public.sellers s WHERE s.id = products.seller_id AND s.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.seller_staff ss WHERE ss.seller_id = products.seller_id AND ss.user_id = auth.uid())
);

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

REVOKE INSERT, UPDATE, DELETE ON public.orders FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.seller_orders FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.order_items FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.payments FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.order_status_history FROM authenticated, anon;

DROP POLICY IF EXISTS "notifications_own_read" ON public.notifications;
CREATE POLICY "notifications_own_read" ON public.notifications
FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_super_admin());

INSERT INTO public.wilayas (code, name, active)
SELECT code, jsonb_build_object('ar', ar, 'fr', fr, 'en', en), true
FROM (VALUES
('01','أدرار','Adrar','Adrar'),('02','الشلف','Chlef','Chlef'),('03','الأغواط','Laghouat','Laghouat'),('04','أم البواقي','Oum El Bouaghi','Oum El Bouaghi'),('05','باتنة','Batna','Batna'),('06','بجاية','Béjaïa','Bejaia'),('07','بسكرة','Biskra','Biskra'),('08','بشار','Béchar','Bechar'),('09','البليدة','Blida','Blida'),('10','البويرة','Bouira','Bouira'),('11','تمنراست','Tamanrasset','Tamanrasset'),('12','تبسة','Tébessa','Tebessa'),('13','تلمسان','Tlemcen','Tlemcen'),('14','تيارت','Tiaret','Tiaret'),('15','تيزي وزو','Tizi Ouzou','Tizi Ouzou'),('16','الجزائر','Alger','Algiers'),('17','الجلفة','Djelfa','Djelfa'),('18','جيجل','Jijel','Jijel'),('19','سطيف','Sétif','Setif'),('20','سعيدة','Saïda','Saida'),('21','سكيكدة','Skikda','Skikda'),('22','سيدي بلعباس','Sidi Bel Abbès','Sidi Bel Abbes'),('23','عنابة','Annaba','Annaba'),('24','قالمة','Guelma','Guelma'),('25','قسنطينة','Constantine','Constantine'),('26','المدية','Médéa','Medea'),('27','مستغانم','Mostaganem','Mostaganem'),('28','المسيلة','M''Sila','M''Sila'),('29','معسكر','Mascara','Mascara'),('30','ورقلة','Ouargla','Ouargla'),('31','وهران','Oran','Oran'),('32','البيض','El Bayadh','El Bayadh'),('33','إليزي','Illizi','Illizi'),('34','برج بوعريريج','Bordj Bou Arréridj','Bordj Bou Arreridj'),('35','بومرداس','Boumerdès','Boumerdes'),('36','الطارف','El Tarf','El Tarf'),('37','تندوف','Tindouf','Tindouf'),('38','تيسمسيلت','Tissemsilt','Tissemsilt'),('39','الوادي','El Oued','El Oued'),('40','خنشلة','Khenchela','Khenchela'),('41','سوق أهراس','Souk Ahras','Souk Ahras'),('42','تيبازة','Tipaza','Tipaza'),('43','ميلة','Mila','Mila'),('44','عين الدفلى','Aïn Defla','Ain Defla'),('45','النعامة','Naâma','Naama'),('46','عين تموشنت','Aïn Témouchent','Ain Temouchent'),('47','غرداية','Ghardaïa','Ghardaia'),('48','غليزان','Relizane','Relizane'),('49','تيميمون','Timimoun','Timimoun'),('50','برج باجي مختار','Bordj Badji Mokhtar','Bordj Badji Mokhtar'),('51','أولاد جلال','Ouled Djellal','Ouled Djellal'),('52','بني عباس','Béni Abbès','Beni Abbes'),('53','إن صالح','In Salah','In Salah'),('54','إن قزام','In Guezzam','In Guezzam'),('55','تقرت','Touggourt','Touggourt'),('56','جانت','Djanet','Djanet'),('57','المغير','El M''Ghair','El M''Ghair'),('58','المنيعة','El Meniaa','El Meniaa')
) AS locations(code, ar, fr, en)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, active = true;

INSERT INTO public.communes (wilaya_id, code, name, active)
SELECT w.id, w.code || '-000', jsonb_build_object('ar','المركز / أخرى','fr','Centre / Autre','en','Centre / Other'), true
FROM public.wilayas w
WHERE NOT EXISTS (SELECT 1 FROM public.communes c WHERE c.wilaya_id = w.id);

INSERT INTO public.shipping_rules (seller_id, wilaya_id, commune_id, delivery_method, price, status, min_weight_grams, max_weight_grams, enabled)
SELECT NULL, w.id, NULL, delivery.method, delivery.price, 'active', delivery.min_weight, delivery.max_weight, true
FROM public.wilayas w
CROSS JOIN (VALUES
('home'::text, 600::numeric, 0::integer, 5000::integer),
('home'::text, 800::numeric, 5001::integer, NULL::integer),
('office'::text, 450::numeric, 0::integer, 5000::integer),
('office'::text, 650::numeric, 5001::integer, NULL::integer)
) AS delivery(method, price, min_weight, max_weight)
WHERE NOT EXISTS (
  SELECT 1 FROM public.shipping_rules sr
  WHERE sr.seller_id IS NULL AND sr.wilaya_id = w.id AND sr.commune_id IS NULL
    AND sr.delivery_method = delivery.method AND sr.min_weight_grams = delivery.min_weight
);
