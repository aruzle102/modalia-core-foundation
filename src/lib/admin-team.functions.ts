/**
 * Admin team management — super_admin ONLY (V8 roles).
 *
 * Manages delegated admin roles (admin / supervisor / viewer) stored in
 * `admin_members`. super_admin is structural (user_roles) and can NEVER be
 * created, modified, or deactivated here — enforced in code AND by the
 * `reject_super_admin_member` database trigger.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin-auth";
import {
  ADMIN_ROLE_PRESETS,
  ADMIN_ROLES,
  ALL_ADMIN_PERMISSIONS,
  type AdminPermission,
  type AdminRole,
} from "@/lib/admin-permissions";

const adminOnly = [requireSupabaseAuth] as const;

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const roleSchema = z.enum(ADMIN_ROLES as unknown as [AdminRole, ...AdminRole[]]);
const permissionSchema = z.enum(
  ALL_ADMIN_PERMISSIONS as unknown as [AdminPermission, ...AdminPermission[]],
);

/** Resolve an auth user id by email (paginated scan; team sizes are small). */
async function findUserIdByEmail(email: string): Promise<string | null> {
  const supabaseAdmin = await adminClient();
  const needle = email.trim().toLowerCase();
  let page = 1;
  for (;;) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error("Could not look up users.");
    const found = data.users.find((u) => (u.email ?? "").toLowerCase() === needle);
    if (found) return found.id;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function userEmailMap(): Promise<Map<string, string>> {
  const supabaseAdmin = await adminClient();
  const map = new Map<string, string>();
  let page = 1;
  for (;;) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error("Could not look up users.");
    for (const u of data.users) map.set(u.id, u.email ?? "");
    if (data.users.length < 200) break;
    page += 1;
  }
  return map;
}

/** Structural guard: super_admin users can never be managed as members. */
async function rejectIfSuperAdmin(userId: string): Promise<void> {
  const supabaseAdmin = await adminClient();
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (data) throw new Error("Super admin accounts cannot be modified here.");
}

export type AdminMemberRow = {
  userId: string;
  email: string;
  role: AdminRole | "super_admin";
  permissions: AdminPermission[];
  active: boolean;
  createdAt: string | null;
  locked: boolean;
};

export const listAdminMembers = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .handler(async ({ context }): Promise<AdminMemberRow[]> => {
    await assertAdmin(context);
    const supabaseAdmin = await adminClient();
    const emails = await userEmailMap();

    const { data: members, error } = await supabaseAdmin
      .from("admin_members")
      .select("user_id, role, permissions, active, created_at")
      .order("created_at", { ascending: true });
    if (error) throw new Error("Could not load the team.");

    const { data: superAdmins } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "super_admin");

    const rows: AdminMemberRow[] = (superAdmins ?? []).map((r) => ({
      userId: r.user_id,
      email: emails.get(r.user_id) ?? "",
      role: "super_admin" as const,
      permissions: [...ALL_ADMIN_PERMISSIONS],
      active: true,
      createdAt: null,
      locked: true,
    }));

    for (const m of members ?? []) {
      const perms = Array.isArray(m.permissions)
        ? (m.permissions as string[]).filter((p): p is AdminPermission =>
            (ALL_ADMIN_PERMISSIONS as readonly string[]).includes(p),
          )
        : [];
      rows.push({
        userId: m.user_id,
        email: emails.get(m.user_id) ?? "",
        role: m.role as AdminRole,
        permissions: perms,
        active: m.active === true,
        createdAt: m.created_at,
        locked: false,
      });
    }
    return rows;
  });

export const createAdminMember = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) =>
    z
      .object({
        email: z.string().email().max(254),
        role: roleSchema,
        permissions: z.array(permissionSchema).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const userId = await findUserIdByEmail(data.email);
    if (!userId) throw new Error("No account exists for this email — the person must sign up first.");
    await rejectIfSuperAdmin(userId);
    const supabaseAdmin = await adminClient();

    const { data: existing } = await supabaseAdmin
      .from("admin_members")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (existing) throw new Error("This user is already a team member.");

    const permissions = data.permissions ?? [...ADMIN_ROLE_PRESETS[data.role]];
    const { error } = await supabaseAdmin.from("admin_members").insert({
      user_id: userId,
      role: data.role,
      permissions,
      active: true,
    });
    if (error) throw new Error("Could not add the team member.");
    return { ok: true as const };
  });

export const updateAdminMember = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) =>
    z
      .object({
        userId: z.string().uuid(),
        role: roleSchema.optional(),
        permissions: z.array(permissionSchema).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    await rejectIfSuperAdmin(data.userId);
    const supabaseAdmin = await adminClient();
    const patch: { role?: AdminRole; permissions?: AdminPermission[] } = {};
    if (data.role) patch.role = data.role;
    if (data.permissions) patch.permissions = data.permissions;
    if (Object.keys(patch).length === 0) throw new Error("Nothing to update.");
    const { error } = await supabaseAdmin.from("admin_members").update(patch).eq("user_id", data.userId);
    if (error) throw new Error("Could not update the team member.");
    return { ok: true as const };
  });

export const setAdminMemberActive = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) =>
    z.object({ userId: z.string().uuid(), active: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    await rejectIfSuperAdmin(data.userId);
    const supabaseAdmin = await adminClient();
    const { error } = await supabaseAdmin
      .from("admin_members")
      .update({ active: data.active })
      .eq("user_id", data.userId);
    if (error) throw new Error("Could not update the team member.");
    return { ok: true as const };
  });
