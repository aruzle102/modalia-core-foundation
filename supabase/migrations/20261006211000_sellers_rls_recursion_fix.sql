-- MODALIA — Fix RLS infinite recursion on sellers (dashboard "13 sources failed")
--
-- Root cause: the sellers SELECT policy contains EXISTS (SELECT 1 FROM
-- seller_staff ...), while the seller_staff policy contains
-- EXISTS (SELECT 1 FROM sellers ...). PostgreSQL detects this cycle
-- STATICALLY at plan time ("infinite recursion detected in policy for
-- relation sellers") — OR short-circuiting and is_super_admin() cannot help
-- because the error is raised during query rewrite, before execution.
--
-- Fix (textbook): replace the sellers→seller_staff direction with a
-- SECURITY DEFINER helper. The function executes as postgres, bypassing RLS
-- on seller_staff, so the rewriter no longer sees a cycle. One direction is
-- enough to break it; the seller_staff policy's sellers subquery now
-- terminates through the helper.
--
-- Additive and safe: drops/recreates only the sellers SELECT policy.

CREATE OR REPLACE FUNCTION public.is_active_seller_staff(_seller_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.seller_staff
    WHERE seller_id = _seller_id
      AND user_id = _user_id
      AND active IS NOT FALSE
  );
$$;

-- Restrict execution to the roles that need it (definer still bypasses RLS).
REVOKE ALL ON FUNCTION public.is_active_seller_staff(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_seller_staff(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_seller_staff(uuid, uuid) TO service_role;

DROP POLICY IF EXISTS "seller_owner_or_admin" ON public.sellers;

CREATE POLICY "seller_owner_or_admin" ON public.sellers
FOR SELECT TO authenticated
USING (
  owner_id = auth.uid()
  OR public.is_super_admin()
  OR public.is_active_seller_staff(sellers.id, auth.uid())
);
