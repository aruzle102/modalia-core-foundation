-- MODALIA FINALIZATION — Phase 3/8 (Super Admin Operating System)
--
-- Private storage bucket for settlement payment proofs (bank receipts, etc.).
-- The column public.seller_settlements.payment_proof_path already exists but
-- was never wired; this migration gives it a home. Bucket is private and
-- super-admin only — proofs are served through signed URLs minted by the
-- admin-only getSettlementProofUrl server function.

BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES ('settlement-proofs', 'settlement-proofs', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Super admins can upload settlement proofs" ON storage.objects;
CREATE POLICY "Super admins can upload settlement proofs"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'settlement-proofs'
  AND public.is_super_admin()
);

DROP POLICY IF EXISTS "Super admins can view settlement proofs" ON storage.objects;
CREATE POLICY "Super admins can view settlement proofs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'settlement-proofs'
  AND public.is_super_admin()
);

DROP POLICY IF EXISTS "Super admins can delete settlement proofs" ON storage.objects;
CREATE POLICY "Super admins can delete settlement proofs"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'settlement-proofs'
  AND public.is_super_admin()
);

COMMIT;
