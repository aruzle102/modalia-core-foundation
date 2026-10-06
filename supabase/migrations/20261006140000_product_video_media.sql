-- V8 Section 9 (Track C): product video support.
--
-- The task brief claimed `product_images.media_type` needs no migration
-- because it is a TEXT column, but migration 20260914001402 added a CHECK
-- constraint restricting values to ('image', 'model_3d'). Add 'video' so
-- sellers can attach videos to products. Additive only: existing rows and
-- flows are untouched.
ALTER TABLE public.product_images
  DROP CONSTRAINT IF EXISTS product_images_media_type_check;

ALTER TABLE public.product_images
  ADD CONSTRAINT product_images_media_type_check
  CHECK (media_type IN ('image', 'model_3d', 'video'));
