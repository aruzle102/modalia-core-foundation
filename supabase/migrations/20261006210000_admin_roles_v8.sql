-- MODALIA V8 — Admin & seller roles (user-approved 2026-10-06)
-- Additive only. Creates admin_members (delegated admin roles) and adds a
-- role column to seller_staff. is_super_admin() is untouched; super_admin
-- stays structural (user_roles) and can never be managed via admin_members.

-- 1. Delegated admin team members -------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_members (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'supervisor', 'viewer')),
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Structural guard: a super_admin can NEVER be an admin_member. Any write
-- targeting a super_admin user_id is rejected at the database level.
CREATE OR REPLACE FUNCTION public.reject_super_admin_member()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.has_role(NEW.user_id, 'super_admin') THEN
    RAISE EXCEPTION 'super_admin users cannot be managed as admin_members';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_super_admin_member ON public.admin_members;
CREATE TRIGGER trg_reject_super_admin_member
  BEFORE INSERT OR UPDATE OF user_id, role, permissions, active ON public.admin_members
  FOR EACH ROW EXECUTE FUNCTION public.reject_super_admin_member();

-- RLS: fail closed. Only super_admin via RLS; members read their own row
-- (server functions use the service role and enforce permissions in code).
ALTER TABLE public.admin_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_members_super_admin_all" ON public.admin_members;
CREATE POLICY "admin_members_super_admin_all" ON public.admin_members
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "admin_members_self_read" ON public.admin_members;
CREATE POLICY "admin_members_self_read" ON public.admin_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Helper: is the caller an active admin team member (any role)?
CREATE OR REPLACE FUNCTION public.is_admin_member()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_members
    WHERE user_id = auth.uid() AND active IS TRUE
  );
$$;

-- 2. Seller staff roles -------------------------------------------------------
-- Owner is structural (sellers.owner_id), never a staff row. The existing
-- `seller_staff.role` column holds the app_role enum ('seller_staff'); staff
-- role presets live in the new `staff_role` column. permissions jsonb stays
-- the enforcement source of truth.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'seller_staff' AND column_name = 'staff_role'
  ) THEN
    ALTER TABLE public.seller_staff ADD COLUMN staff_role text;
  END IF;
END;
$$;

-- Backfill: existing staff rows default to 'staff' (least privilege).
UPDATE public.seller_staff SET staff_role = 'staff' WHERE staff_role IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'seller_staff'
      AND constraint_name = 'seller_staff_staff_role_check'
  ) THEN
    ALTER TABLE public.seller_staff
      ADD CONSTRAINT seller_staff_staff_role_check
      CHECK (staff_role IN ('manager', 'staff', 'viewer'));
  END IF;
END;
$$;
