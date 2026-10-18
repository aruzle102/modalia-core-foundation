-- Phase 4 Item 5: Codify live-only triggers for fresh installs
-- These triggers were applied live via query_database but had no migration files.
-- This ensures fresh database installs get the same protections.

-- ============================================================================
-- Trigger 1: Prevent seller moderation bypass (Phase 2, CRITICAL security)
-- Blocks non-admins from self-approving products via RLS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.prevent_seller_moderation_bypass()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    IF NEW.moderation_status IS DISTINCT FROM OLD.moderation_status THEN
      IF NEW.moderation_status = 'approved' THEN
        RAISE EXCEPTION 'Only admins can approve products';
      END IF;
    END IF;
    IF NEW.publication_status IS DISTINCT FROM OLD.publication_status THEN
      IF NEW.publication_status = 'published' THEN
        RAISE EXCEPTION 'Only admins can publish products';
      END IF;
    END IF;
    IF NEW.visibility IS DISTINCT FROM OLD.visibility THEN
      IF NEW.visibility = 'public' THEN
        RAISE EXCEPTION 'Only admins can make products public';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_prevent_seller_moderation_bypass ON public.products;
CREATE TRIGGER trg_prevent_seller_moderation_bypass
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_seller_moderation_bypass();

-- ============================================================================
-- Trigger 2: Release reserved stock on cancel/refund/return (Phase 2, HIGH)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.release_reserved_on_cancel()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('cancelled', 'refunded', 'returned')
     AND OLD.status NOT IN ('cancelled', 'refunded', 'returned') THEN
    UPDATE public.inventory i
    SET reserved_quantity = GREATEST(0, i.reserved_quantity - so.quantity)
    FROM public.order_items so
    WHERE so.seller_order_id = NEW.id
      AND so.variant_id = i.variant_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_release_reserved_on_cancel ON public.seller_orders;
CREATE TRIGGER trg_release_reserved_on_cancel
  BEFORE UPDATE ON public.seller_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.release_reserved_on_cancel();

-- ============================================================================
-- Trigger 3: Release reserved stock on delivered (Phase 4, HIGH)
-- Decrements quantity and releases reserved when order is delivered
-- ============================================================================

CREATE OR REPLACE FUNCTION public.release_reserved_on_delivered()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'delivered' AND OLD.status != 'delivered' THEN
    UPDATE public.inventory i
    SET
      quantity = GREATEST(0, i.quantity - so.quantity),
      reserved_quantity = GREATEST(0, i.reserved_quantity - so.quantity)
    FROM public.order_items so
    WHERE so.seller_order_id = NEW.id
      AND so.variant_id = i.variant_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_release_reserved_on_delivered ON public.seller_orders;
CREATE TRIGGER trg_release_reserved_on_delivered
  BEFORE UPDATE ON public.seller_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.release_reserved_on_delivered();
