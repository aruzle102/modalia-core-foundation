-- Seller OS Phase 2: staff role title + soft-activate flag.
-- New migration (never edits older ones).
ALTER TABLE public.seller_staff ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.seller_staff ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.seller_staff.title IS 'Display title for the staff member, e.g. Manager, Support.';
COMMENT ON COLUMN public.seller_staff.active IS 'Soft deactivation flag; staff rows are never deleted.';
