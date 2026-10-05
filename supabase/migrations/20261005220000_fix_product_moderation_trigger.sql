-- Migration: 20261005220000_fix_product_moderation_trigger.sql
--
-- Rewrites the `enforce_product_moderation_write` trigger created in
-- 20260917000121. That version blocked EVERY write to a published product --
-- even by admins -- because:
--   1. `public.is_super_admin()` depends on `auth.uid()`, which is NULL on
--      service_role connections, so the admin bypass never applied there.
--   2. It raised whenever `NEW.publication_status IN ('approved','published')`,
--      even with no actual change to the value.
-- This broke `moderateAdminProduct` (approve/reject/hide), seller `saveProduct`
-- on published products, and `submitForModeration`.
--
-- New behaviour:
--   * Privileged actors are let through explicitly: service_role connections
--     (request JWT claims carry no `sub`) or a real admin JWT for which
--     `is_super_admin()` is true.
--   * Unprivileged actors may NOT self-publish: on INSERT, publication lanes
--     are forced to pending/pending_review/private (original protection).
--   * On UPDATE, an unprivileged actor is rejected ONLY on an ACTUAL change
--     toward a published/approved state (publication_status approved/published,
--     visibility public, moderation_status approved) or when tampering with
--     moderator-only audit fields.
-- Idempotent: safe to re-run.

CREATE OR REPLACE FUNCTION public.enforce_product_moderation_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  claims_sub text;
  privileged boolean;
BEGIN
  -- Service_role connections (Supabase admin client, server functions, direct
  -- postgres access) carry a request JWT with no `sub` claim. Real user JWTs
  -- always include `sub`.
  claims_sub := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub';

  privileged := (claims_sub IS NULL) OR public.is_super_admin();

  IF privileged THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Unprivileged inserts can never self-publish or preset moderation results.
    NEW.moderation_status := 'pending';
    NEW.moderation_reason := NULL;
    NEW.moderated_by := NULL;
    NEW.moderated_at := NULL;
    IF NEW.publication_status IN ('approved', 'published') THEN
      NEW.publication_status := 'pending_review';
    END IF;
    IF NEW.visibility = 'public' THEN
      NEW.visibility := 'private';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: reject only an ACTUAL transition TOWARD a published/approved state.
  IF (NEW.publication_status IS DISTINCT FROM OLD.publication_status
        AND NEW.publication_status IN ('approved', 'published'))
     OR (NEW.visibility IS DISTINCT FROM OLD.visibility
        AND NEW.visibility = 'public')
     OR (NEW.moderation_status IS DISTINCT FROM OLD.moderation_status
        AND NEW.moderation_status = 'approved') THEN
    RAISE EXCEPTION 'Only marketplace moderators may approve or publish products';
  END IF;

  -- Moderator-only audit fields stay off-limits for unprivileged actors.
  IF NEW.moderation_reason IS DISTINCT FROM OLD.moderation_reason
     OR NEW.moderated_by IS DISTINCT FROM OLD.moderated_by
     OR NEW.moderated_at IS DISTINCT FROM OLD.moderated_at THEN
    RAISE EXCEPTION 'Only marketplace moderators may edit moderation records';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_enforce_moderation ON public.products;
CREATE TRIGGER products_enforce_moderation
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_moderation_write();
