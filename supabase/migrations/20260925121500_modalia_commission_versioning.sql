CREATE TABLE IF NOT EXISTS public.seller_commission_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  rate numeric(5,4) NOT NULL CHECK (rate >= 0 AND rate <= 1),
  effective_from timestamptz NOT NULL DEFAULT now(),
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.seller_commission_history TO authenticated;
GRANT ALL ON public.seller_commission_history TO service_role;
ALTER TABLE public.seller_commission_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "commission_history_isolated" ON public.seller_commission_history FOR SELECT TO authenticated USING (
  public.is_super_admin() OR EXISTS (SELECT 1 FROM public.sellers s WHERE s.id = seller_commission_history.seller_id AND s.owner_id = auth.uid())
);

CREATE OR REPLACE FUNCTION public.record_seller_commission_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.commission_rate IS DISTINCT FROM OLD.commission_rate THEN
    INSERT INTO public.seller_commission_history(seller_id, rate, effective_from, changed_by)
    VALUES (NEW.id, NEW.commission_rate, now(), auth.uid());
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS seller_commission_history_trigger ON public.sellers;
CREATE TRIGGER seller_commission_history_trigger
AFTER INSERT OR UPDATE OF commission_rate ON public.sellers
FOR EACH ROW EXECUTE FUNCTION public.record_seller_commission_change();

-- Calculate commission at order creation time and preserve the applied amount.
CREATE OR REPLACE FUNCTION public.apply_seller_commission_to_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r numeric(5,4);
BEGIN
  SELECT commission_rate INTO r FROM public.sellers WHERE id = NEW.seller_id;
  NEW.commission_total := ROUND(COALESCE(NEW.subtotal,0) * COALESCE(r,0), 2);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS seller_order_commission_trigger ON public.seller_orders;
CREATE TRIGGER seller_order_commission_trigger
BEFORE INSERT ON public.seller_orders
FOR EACH ROW EXECUTE FUNCTION public.apply_seller_commission_to_order();
INSERT INTO public.seller_commission_history(seller_id, rate, effective_from)
SELECT s.id, s.commission_rate, s.created_at FROM public.sellers s
WHERE NOT EXISTS (SELECT 1 FROM public.seller_commission_history h WHERE h.seller_id = s.id);
