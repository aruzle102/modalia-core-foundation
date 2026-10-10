-- MODALIA — V8 Phase-2 fix #73 (Worker A): drop the legacy 10-arg checkout_cart.
--
-- 20261006180000 dropped only the 12-arg overload
--   checkout_cart(uuid,text,text,text,text,uuid,uuid,text,text,text,uuid,text).
-- The original 10-arg overload from 20260919
--   checkout_cart(uuid,text,text,text,text,uuid,uuid,text,text,text)
-- may still exist live, leaving two competing overloads. PostgREST picks an
-- overload by the provided argument names, but a stale legacy overload is a
-- latent routing hazard — remove it.
--
-- ADDITIVE and idempotent (IF EXISTS). Takes effect on Supabase/Lovable sync.

BEGIN;

DROP FUNCTION IF EXISTS public.checkout_cart(uuid,text,text,text,text,uuid,uuid,text,text,text);

COMMIT;
