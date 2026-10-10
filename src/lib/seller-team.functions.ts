import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireSeller, type SellerPermission } from "@/lib/seller-auth";
import type { Database, Json } from "@/integrations/supabase/types";

const id = z.string().uuid();

/* ------------------------- Permission catalog --------------------------- */

export const STAFF_PERMISSIONS: Array<{ key: SellerPermission; group: string; label: string; description: string }> = [
  { key: "products.view", group: "Catalog", label: "View products", description: "See the product catalog and stock levels." },
  { key: "products.edit", group: "Catalog", label: "Create & edit products", description: "Add and edit products (drafts for review)." },
  { key: "products.publish", group: "Catalog", label: "Publish products", description: "Submit products for publication." },
  { key: "orders.view", group: "Orders", label: "View orders", description: "See incoming orders and their details." },
  { key: "orders.update", group: "Orders", label: "Update orders", description: "Accept, process and fulfill orders." },
  { key: "inventory.manage", group: "Orders", label: "Manage inventory", description: "Adjust stock quantities and thresholds." },
  { key: "coupons.manage", group: "Marketing", label: "Manage coupons", description: "Create and edit discount coupons." },
  { key: "analytics.view", group: "Marketing", label: "View analytics", description: "See sales and traffic reports." },
  { key: "store.manage", group: "Store", label: "Store settings", description: "Edit storefront name, contact and branding." },
  { key: "customers.view", group: "Store", label: "View customers", description: "See customer details on orders." },
  { key: "reviews.manage", group: "Store", label: "Manage reviews", description: "Moderate and reply to product reviews." },
  { key: "staff.manage", group: "Administration", label: "Manage staff", description: "Invite and manage team members." },
  { key: "finance.view", group: "Administration", label: "View finance", description: "See commission, payout and settlement data." },
];

const PERMISSION_KEYS = STAFF_PERMISSIONS.map((p) => p.key);
const isPermission = (value: string): value is SellerPermission => PERMISSION_KEYS.includes(value as SellerPermission);

export const STAFF_TITLES = ["Manager", "Product Manager", "Order Manager", "Inventory Manager", "Marketing", "Support"] as const;
export type StaffTitle = (typeof STAFF_TITLES)[number];

/** Sensible default permissions per title (client preselects them; owner can adjust). */
export const STAFF_TITLE_SUGGESTIONS: Record<StaffTitle, SellerPermission[]> = {
  Manager: ["products.view", "products.edit", "orders.view", "orders.update", "inventory.manage", "analytics.view", "customers.view", "reviews.manage"],
  "Product Manager": ["products.view", "products.edit", "products.publish", "inventory.manage", "reviews.manage"],
  "Order Manager": ["orders.view", "orders.update", "inventory.manage", "customers.view"],
  "Inventory Manager": ["products.view", "inventory.manage"],
  Marketing: ["products.view", "coupons.manage", "analytics.view", "reviews.manage"],
  Support: ["orders.view", "customers.view", "reviews.manage"],
};

/* --------------------------------- Reads -------------------------------- */

export const listStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const seller = await requireSeller({ supabase: context.supabase, userId: context.userId }, "staff.manage");
    const { data, error } = await context.supabase
      .from("seller_staff")
      .select("id,user_id,title,role,permissions,active,created_at")
      .eq("seller_id", seller.sellerId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return {
      seller: { id: seller.sellerId, legalName: seller.legalName },
      isOwner: seller.isOwner,
      staff: (data ?? []).map((row) => ({
        id: row.id as string,
        userId: row.user_id as string,
        title: (row.title as string | null) ?? null,
        role: row.role as string,
        permissions: (row.permissions ?? []) as SellerPermission[],
        active: (row.active as boolean | null) ?? true,
        createdAt: row.created_at as string,
      })),
    };
  });

/* -------------------------------- Mutations ----------------------------- */

async function findAuthUserByEmail(admin: { auth: { admin: { listUsers: (params: { page: number; perPage: number }) => Promise<{ data: { users: Array<{ id: string; email?: string }> } }> } } }, email: string): Promise<string | null> {
  for (let page = 1; page <= 20; page += 1) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found.id;
    if (data.users.length < 1000) break;
  }
  return null;
}

export const inviteStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        email: z.string().email().max(160),
        title: z.enum(STAFF_TITLES),
        permissions: z.array(z.string()).max(30),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const seller = await requireSeller({ supabase: context.supabase, userId: context.userId });
    if (!seller.isOwner) throw new Error("Only the store owner can invite staff.");
    const permissions = data.permissions.filter(isPermission);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invite, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email);

    let userId: string | null = invite?.user?.id ?? null;
    if (!userId) {
      if (inviteError && /already/i.test(inviteError.message)) {
        userId = await findAuthUserByEmail(supabaseAdmin, data.email);
      }
      if (!userId) throw new Error(inviteError?.message ?? "Unable to invite staff member.");
    }

    const { data: existing } = await supabaseAdmin
      .from("seller_staff")
      .select("id,active")
      .eq("seller_id", seller.sellerId)
      .eq("user_id", userId)
      .maybeSingle();

    let staffId: string;
    if (existing) {
      const { error } = await supabaseAdmin
        .from("seller_staff")
        .update({ title: data.title, permissions, active: true })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      staffId = existing.id as string;
    } else {
      const { data: row, error } = await supabaseAdmin
        .from("seller_staff")
        .insert({ seller_id: seller.sellerId, user_id: userId, role: "seller_staff", title: data.title, permissions, active: true })
        .select("id")
        .single();
      if (error || !row) throw new Error(error?.message ?? "Unable to add staff member.");
      staffId = row.id as string;
    }

    await supabaseAdmin.from("user_roles").upsert({ user_id: userId, role: "seller_staff" }, { onConflict: "user_id,role" });

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "seller_staff.invite",
      resource: "seller_staff",
      resource_id: staffId,
      metadata: { seller_id: seller.sellerId, email: data.email, title: data.title, permissions },
    });

    return { ok: true, staffId };
  });

export const updateStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        staffId: id,
        title: z.enum(STAFF_TITLES).optional(),
        permissions: z.array(z.string()).max(30).optional(),
        active: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const seller = await requireSeller({ supabase: context.supabase, userId: context.userId });
    if (!seller.isOwner) throw new Error("Only the store owner can manage staff.");

    // Anti-IDOR: the staff row must belong to this seller.
    const { data: row, error: fetchError } = await context.supabase
      .from("seller_staff")
      .select("id,user_id,title,permissions,active")
      .eq("id", data.staffId)
      .eq("seller_id", seller.sellerId)
      .maybeSingle();
    if (fetchError || !row) throw new Error("Staff member not found.");

    const update: Database["public"]["Tables"]["seller_staff"]["Update"] = {};
    if (data.title !== undefined) update['title'] = data.title;
    if (data.permissions !== undefined) update['permissions'] = data.permissions.filter(isPermission);
    if (data.active !== undefined) update['active'] = data.active;

    if (Object.keys(update).length > 0) {
      const { error } = await context.supabase.from("seller_staff").update(update).eq("id", data.staffId);
      if (error) throw new Error(error.message);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "seller_staff.update",
      resource: "seller_staff",
      resource_id: data.staffId,
      metadata: { seller_id: seller.sellerId, changes: update as unknown as Json },
    });

    return { ok: true };
  });
