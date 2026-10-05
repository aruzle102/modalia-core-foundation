import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";
import { emitSellerNotification } from "@/lib/notifications.functions";
import { assertAdmin } from "@/lib/admin-auth";

type SellerRow = Database["public"]["Tables"]["sellers"]["Row"];
type StoreRow = Database["public"]["Tables"]["stores"]["Row"];
type ProfileReview = {
  id: string;
  product_id: string;
  rating: number | null;
  body: string | null;
  moderation_status: string | null;
  status: string | null;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  products: { name: Json } | null;
};

const adminOnly = [requireSupabaseAuth] as const;

const PAGE_SIZE = 25;

/** Strip postgrest filter-breaking characters from free-text search. */
function sanitizeSearch(q: string): string {
  return q.replace(/[,()]/g, "").trim().slice(0, 100);
}

/* ------------------------------------------------------------------ */
/* Seller applications                                                 */
/* ------------------------------------------------------------------ */

const applicationStatusSchema = z.enum([
  "pending",
  "under_review",
  "approved",
  "rejected",
  "converted",
  "suspended",
]);

const listApplicationsInput = z.object({
  status: applicationStatusSchema.optional(),
  q: z.string().max(100).optional(),
  page: z.number().int().min(1).default(1),
});

export const listApplications = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) => listApplicationsInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin.from("seller_applications").select("*", { count: "exact" });
    if (data.status) query = query.eq("status", data.status);
    const q = data.q ? sanitizeSearch(data.q) : "";
    if (q) {
      query = query.or(
        `first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,proposed_store_name.ilike.%${q}%,phone.ilike.%${q}%`,
      );
    }
    const from = (data.page - 1) * PAGE_SIZE;
    const { data: items, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    return { items: items ?? [], total: count ?? 0, page: data.page, pageSize: PAGE_SIZE };
  });

export type ApplicationTimelineStep = {
  key: "submitted" | "reviewed" | "approved" | "rejected" | "account_created" | "store_activated";
  at: string;
};

export const getApplication = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: application, error } = await supabaseAdmin
      .from("seller_applications")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error || !application) throw new Error("Application not found.");

    let seller: SellerRow | null = null;
    let store: StoreRow | null = null;
    if (application.seller_id) {
      const { data: sellerRow } = await supabaseAdmin
        .from("sellers")
        .select("*")
        .eq("id", application.seller_id)
        .maybeSingle();
      seller = sellerRow ?? null;
      if (seller) {
        const { data: storeRow } = await supabaseAdmin
          .from("stores")
          .select("*")
          .eq("seller_id", seller["id"] as string)
          .maybeSingle();
        store = storeRow ?? null;
      }
    }

    const timeline: ApplicationTimelineStep[] = [{ key: "submitted", at: application.created_at }];
    if (application.reviewed_at) {
      timeline.push({ key: "reviewed", at: application.reviewed_at });
      if (application.status === "approved") timeline.push({ key: "approved", at: application.reviewed_at });
      if (application.status === "rejected") timeline.push({ key: "rejected", at: application.reviewed_at });
    }
    if (seller) timeline.push({ key: "account_created", at: seller["created_at"] as string });
    if (store) timeline.push({ key: "store_activated", at: store["created_at"] as string });

    return { application, seller, store, timeline };
  });

const reviewApplicationInput = z
  .object({
    id: z.string().uuid(),
    decision: z.enum(["approve", "reject", "start_review"]),
    rejectionReason: z.string().max(2000).optional(),
    adminNotes: z.string().max(5000).optional(),
  })
  .refine(
    (d) => d.decision !== "reject" || (d.rejectionReason?.trim().length ?? 0) > 0,
    { message: "A rejection reason is required.", path: ["rejectionReason"] },
  );

export const reviewApplication = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) => reviewApplicationInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: application, error } = await supabaseAdmin
      .from("seller_applications")
      .select("id,status")
      .eq("id", data.id)
      .single();
    if (error || !application) throw new Error("Application not found.");
    const now = new Date().toISOString();
    const notesPatch =
      data.adminNotes !== undefined ? { admin_notes: data.adminNotes } : {};

    if (data.decision === "start_review") {
      // pending -> under_review: an admin picked the application up.
      // reviewed_at stays NULL until a final decision is recorded.
      if (application.status !== "pending") {
        throw new Error("Only pending applications can be moved to under review.");
      }
      const { error: updateError } = await supabaseAdmin
        .from("seller_applications")
        .update({ status: "under_review", reviewed_by: context.userId, ...notesPatch })
        .eq("id", data.id);
      if (updateError) throw new Error(updateError.message);
      await supabaseAdmin.from("audit_logs").insert({
        actor_id: context.userId,
        action: "seller_application_under_review",
        resource: "seller_application",
        resource_id: data.id,
        metadata: { decision: "start_review" },
      });
      return { ok: true as const, status: "under_review" as const };
    }

    if (application.status !== "pending" && application.status !== "under_review") {
      throw new Error("Only pending or under-review applications can be decided.");
    }

    if (data.decision === "approve") {
      // Approval only flags the application. The seller login/store is provisioned
      // separately via provisionSeller so credentials are handled explicitly.
      const { error: updateError } = await supabaseAdmin
        .from("seller_applications")
        .update({
          status: "approved",
          reviewed_at: now,
          reviewed_by: context.userId,
          ...notesPatch,
        })
        .eq("id", data.id);
      if (updateError) throw new Error(updateError.message);
      await supabaseAdmin.from("audit_logs").insert({
        actor_id: context.userId,
        action: "seller_application_approved",
        resource: "seller_application",
        resource_id: data.id,
        metadata: { decision: "approve", from: application.status },
      });
      return { ok: true as const, status: "approved" as const };
    }

    const reason = data.rejectionReason!.trim();
    const { error: updateError } = await supabaseAdmin
      .from("seller_applications")
      .update({
        status: "rejected",
        reviewed_at: now,
        reviewed_by: context.userId,
        rejection_reason: reason,
        ...notesPatch,
      })
      .eq("id", data.id);
    if (updateError) throw new Error(updateError.message);
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "seller_application_rejected",
      resource: "seller_application",
      resource_id: data.id,
      metadata: { decision: "reject", from: application.status, rejection_reason: reason },
    });
    // Never send email/SMS notifications from this flow.
    return { ok: true as const, status: "rejected" as const };
  });

export const updateApplicationNotes = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) =>
    z.object({ id: z.string().uuid(), adminNotes: z.string().max(5000) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("seller_applications")
      .update({ admin_notes: data.adminNotes })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "seller_application_notes_updated",
      resource: "seller_application",
      resource_id: data.id,
      metadata: {},
    });
    return { ok: true as const };
  });

/* ------------------------------------------------------------------ */
/* Secure seller account provisioning                                  */
/* ------------------------------------------------------------------ */

export type CreateSellerAccountResult = {
  tempPassword: string;
  userId: string;
  sellerId: string;
  storeSlug: string;
};

export const createSellerAccount = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) => z.object({ applicationId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<CreateSellerAccountResult> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: application, error: applicationError } = await supabaseAdmin
      .from("seller_applications")
      .select("*")
      .eq("id", data.applicationId)
      .single();
    if (applicationError || !application) throw new Error("Application not found.");
    if (application.status !== "approved") {
      throw new Error("Application must be approved before creating a seller account.");
    }
    if (application.seller_id) {
      throw new Error("A seller account already exists for this application.");
    }

    // Temporary password: generated server-side, never logged, never in a URL.
    const tempPassword = (crypto.randomUUID() + crypto.randomUUID()).slice(0, 20);
    const displayName = `${application.first_name} ${application.last_name}`.trim();

    let authUserId: string;
    let createdNewUser = false;
    let linkedExistingUser = false;

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: application.email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        display_name: displayName,
        force_password_reset: true,
        provisioned_by: "modalia-admin",
      },
    });

    if (createError) {
      const alreadyExists = /already been registered|already exists|duplicate/i.test(
        createError.message ?? "",
      );
      if (!alreadyExists) throw new Error(`Could not create login: ${createError.message}`);
      // An auth user with this email exists: link to it and rotate its password to
      // the new temp password so the credential shown once to the admin is correct.
      const { data: listed, error: listError } = await supabaseAdmin.auth.admin.listUsers({
        perPage: 200,
      });
      if (listError) throw new Error("A login with this email already exists.");
      const existing = (listed?.users ?? []).find(
        (u) => u.email?.toLowerCase() === application.email.toLowerCase(),
      );
      if (!existing) throw new Error("A login with this email already exists.");
      const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          display_name: displayName,
          force_password_reset: true,
          provisioned_by: "modalia-admin",
        },
      });
      if (passwordError) throw new Error(`Could not reset login password: ${passwordError.message}`);
      authUserId = existing.id;
      linkedExistingUser = true;
    } else if (!created?.user) {
      throw new Error("Could not create login.");
    } else {
      authUserId = created.user.id;
      createdNewUser = true;
    }

    const now = new Date().toISOString();
    let sellerId: string | null = null;
    try {
      const { data: seller, error: sellerError } = await supabaseAdmin
        .from("sellers")
        .insert({
          owner_id: authUserId,
          legal_name: application.proposed_store_name,
          first_name: application.first_name,
          last_name: application.last_name,
          phone: application.phone,
          email: application.email,
          status: "active",
          account_status: "active",
          // Temporary password was provisioned above (shown once to the
          // admin); the owner must rotate it on first sign-in.
          must_reset_password: true,
          commission_rate: 0.1,
          approved_at: now,
        })
        .select("id")
        .single();
      if (sellerError || !seller) throw new Error(sellerError?.message ?? "Could not create seller.");
      sellerId = seller.id;

      // Unique store slug.
      const base =
        application.proposed_store_name
          .toLowerCase()
          .normalize("NFKD")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-+|-+$)/g, "") || "store";
      let slug = `${base}-${seller.id.slice(0, 6)}`;
      let attempt = 1;
      for (;;) {
        const { data: clash } = await supabaseAdmin
          .from("stores")
          .select("id")
          .eq("slug", slug)
          .maybeSingle();
        if (!clash) break;
        attempt += 1;
        slug = `${base}-${seller.id.slice(0, 6)}-${attempt}`;
      }

      const { data: store, error: storeError } = await supabaseAdmin
        .from("stores")
        .insert({
          seller_id: seller.id,
          name: application.proposed_store_name,
          slug,
          status: "active",
          verification_status: "unverified",
          description: application.business_description,
        })
        .select("id")
        .single();
      if (storeError || !store) throw new Error(storeError?.message ?? "Could not create store.");

      const { error: roleError } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: authUserId, role: "seller_owner" }, { onConflict: "user_id,role" });
      if (roleError) throw new Error(roleError.message);

      const { error: historyError } = await supabaseAdmin
        .from("seller_commission_history")
        .insert({ seller_id: seller.id, rate: 0.1, effective_from: now, changed_by: context.userId });
      if (historyError) throw new Error(historyError.message);

      const { error: applicationUpdateError } = await supabaseAdmin
        .from("seller_applications")
        .update({ seller_id: seller.id, status: "converted" })
        .eq("id", application.id);
      if (applicationUpdateError) throw new Error(applicationUpdateError.message);

      // Audit metadata deliberately excludes the temporary password.
      await supabaseAdmin.from("audit_logs").insert({
        actor_id: context.userId,
        action: "seller_account_created",
        resource: "seller",
        resource_id: seller.id,
        metadata: {
          application_id: application.id,
          store_id: store.id,
          store_slug: slug,
          user_id: authUserId,
          email: application.email,
          linked_existing_user: linkedExistingUser,
        },
      });

      return { tempPassword, userId: authUserId, sellerId: seller.id, storeSlug: slug };
    } catch (err) {
      // Best-effort compensation: never leave a half-provisioned account behind.
      if (sellerId) await supabaseAdmin.from("sellers").delete().eq("id", sellerId);
      if (createdNewUser) await supabaseAdmin.auth.admin.deleteUser(authUserId);
      throw err;
    }
  });

/* ------------------------------------------------------------------ */
/* Seller onboarding wizard: store slug availability + full provisioning */
/* ------------------------------------------------------------------ */

export const checkStoreSlug = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) => z.object({ slug: z.string().trim().min(1).max(80) }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const normalized =
      data.slug
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-+|-+$)/g, "") || "store";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: clash } = await supabaseAdmin
      .from("stores")
      .select("id")
      .eq("slug", normalized)
      .maybeSingle();
    let suggestion: string | null = null;
    if (clash) {
      for (let i = 2; i < 100; i++) {
        const candidate = `${normalized}-${i}`;
        const { data: next } = await supabaseAdmin
          .from("stores")
          .select("id")
          .eq("slug", candidate)
          .maybeSingle();
        if (!next) {
          suggestion = candidate;
          break;
        }
      }
    }
    return { slug: normalized, available: !clash, suggestion };
  });

/** Permission keys the wizard may grant to a staff account (subset of the permissions table). */
export const WIZARD_STAFF_PERMISSIONS = [
  { key: "products.view", label: "View products" },
  { key: "products.create", label: "Create products" },
  { key: "products.edit", label: "Edit products" },
  { key: "products.delete", label: "Delete products" },
  { key: "inventory.view", label: "View inventory" },
  { key: "inventory.edit", label: "Edit inventory" },
  { key: "orders.view", label: "View orders" },
  { key: "orders.update", label: "Update orders" },
  { key: "analytics.view", label: "View analytics" },
  { key: "store.edit", label: "Edit store settings" },
  { key: "discounts.manage", label: "Manage discounts" },
  { key: "staff.manage", label: "Manage staff" },
  { key: "settings.manage", label: "Manage settings" },
] as const;

const wizardPermissionKeys: Set<string> = new Set(WIZARD_STAFF_PERMISSIONS.map((p) => p.key));

const provisionSellerInput = z
  .object({
    applicationId: z.string().uuid().optional(),
    firstName: z.string().trim().min(2).max(100),
    lastName: z.string().trim().min(2).max(100),
    phone: z
      .string()
      .trim()
      .regex(/^\+213[5-7][0-9]{8}$/, "Use an Algerian mobile number, for example +213551234567."),
    email: z.string().trim().email().max(255),
    storeName: z.string().trim().min(2).max(160),
    storeSlug: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug may only contain lowercase letters, numbers and dashes.")
      .optional(),
    storeDescription: z.string().trim().max(2000).optional(),
    commissionRate: z.number().min(0).max(100),
    role: z.enum(["seller_owner", "seller_staff"]),
    staffTitle: z.string().trim().max(120).optional(),
    staffPermissions: z.array(z.string().min(1).max(60)).max(30).default([]),
  })
  .refine((d) => d.role !== "seller_staff" || d.staffPermissions.length > 0, {
    message: "Choose at least one permission for a staff account.",
    path: ["staffPermissions"],
  })
  .refine((d) => d.staffPermissions.every((k) => wizardPermissionKeys.has(k)), {
    message: "One or more permission keys are not recognized.",
    path: ["staffPermissions"],
  });

export type ProvisionSellerResult = {
  tempPassword: string;
  userId: string;
  sellerId: string;
  storeId: string;
  storeSlug: string;
  linkedExistingUser: boolean;
};

/**
 * Full seller+store provisioning for the admin onboarding wizard.
 * Creates REAL records: auth user (Supabase Auth Admin API, service_role never
 * leaves the server), sellers row, stores row with a unique slug, user_roles
 * row (+ seller_staff row for staff roles), commission history row, audit log.
 * The temporary password is returned once to the admin and never logged,
 * never put in a URL, and never stored.
 */
export const provisionSeller = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) => provisionSellerInput.parse(data))
  .handler(async ({ data, context }): Promise<ProvisionSellerResult> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let application: { id: string; status: string; seller_id: string | null } | null = null;
    if (data.applicationId) {
      const { data: appRow, error: appError } = await supabaseAdmin
        .from("seller_applications")
        .select("id,status,seller_id")
        .eq("id", data.applicationId)
        .single();
      if (appError || !appRow) throw new Error("Application not found.");
      if (appRow.status !== "approved") {
        throw new Error("Application must be approved before provisioning a seller account.");
      }
      if (appRow.seller_id) {
        throw new Error("A seller account already exists for this application.");
      }
      application = appRow;
    }

    const commissionFraction = data.commissionRate / 100;
    const tempPassword = (crypto.randomUUID() + crypto.randomUUID()).slice(0, 20);
    const displayName = `${data.firstName} ${data.lastName}`.trim();

    let authUserId: string;
    let createdNewUser = false;
    let linkedExistingUser = false;

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        display_name: displayName,
        force_password_reset: true,
        provisioned_by: "modalia-admin",
      },
    });

    if (createError) {
      const alreadyExists = /already been registered|already exists|duplicate/i.test(
        createError.message ?? "",
      );
      if (!alreadyExists) throw new Error(`Could not create login: ${createError.message}`);
      const { data: listed, error: listError } = await supabaseAdmin.auth.admin.listUsers({
        perPage: 200,
      });
      if (listError) throw new Error("A login with this email already exists.");
      const existing = (listed?.users ?? []).find(
        (u) => u.email?.toLowerCase() === data.email.toLowerCase(),
      );
      if (!existing) throw new Error("A login with this email already exists.");
      const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          display_name: displayName,
          force_password_reset: true,
          provisioned_by: "modalia-admin",
        },
      });
      if (passwordError) throw new Error(`Could not reset login password: ${passwordError.message}`);
      authUserId = existing.id;
      linkedExistingUser = true;
    } else if (!created?.user) {
      throw new Error("Could not create login.");
    } else {
      authUserId = created.user.id;
      createdNewUser = true;
    }

    const now = new Date().toISOString();
    let sellerId: string | null = null;
    let storeId: string | null = null;
    try {
      const { data: seller, error: sellerError } = await supabaseAdmin
        .from("sellers")
        .insert({
          owner_id: authUserId,
          legal_name: data.storeName,
          first_name: data.firstName,
          last_name: data.lastName,
          phone: data.phone,
          email: data.email,
          status: "active",
          account_status: "active",
          commission_rate: commissionFraction,
          approved_at: now,
        })
        .select("id")
        .single();
      if (sellerError || !seller) throw new Error(sellerError?.message ?? "Could not create seller.");
      sellerId = seller.id;

      // Unique store slug.
      const base =
        data.storeSlug ??
        (data.storeName
          .toLowerCase()
          .normalize("NFKD")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-+|-+$)/g, "") || "store");
      let slug = base;
      let attempt = 1;
      for (;;) {
        const { data: clash } = await supabaseAdmin
          .from("stores")
          .select("id")
          .eq("slug", slug)
          .maybeSingle();
        if (!clash) break;
        attempt += 1;
        slug = `${base}-${attempt}`;
      }

      const { data: store, error: storeError } = await supabaseAdmin
        .from("stores")
        .insert({
          seller_id: seller.id,
          name: data.storeName,
          slug,
          status: "active",
          verification_status: "unverified",
          description: data.storeDescription || null,
        })
        .select("id")
        .single();
      if (storeError || !store) throw new Error(storeError?.message ?? "Could not create store.");
      storeId = store.id;

      const { error: roleError } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: authUserId, role: data.role }, { onConflict: "user_id,role" });
      if (roleError) throw new Error(roleError.message);

      if (data.role === "seller_staff") {
        const { error: staffError } = await supabaseAdmin.from("seller_staff").upsert(
          {
            seller_id: seller.id,
            user_id: authUserId,
            role: "seller_staff",
            title: data.staffTitle?.trim() || "Staff",
            permissions: data.staffPermissions,
            active: true,
          },
          { onConflict: "seller_id,user_id" },
        );
        if (staffError) throw new Error(staffError.message);
      }

      const { error: historyError } = await supabaseAdmin
        .from("seller_commission_history")
        .insert({
          seller_id: seller.id,
          rate: commissionFraction,
          effective_from: now,
          changed_by: context.userId,
        });
      if (historyError) throw new Error(historyError.message);

      if (application) {
        const { error: applicationUpdateError } = await supabaseAdmin
          .from("seller_applications")
          .update({ seller_id: seller.id, status: "converted" })
          .eq("id", application.id);
        if (applicationUpdateError) throw new Error(applicationUpdateError.message);
      }

      await supabaseAdmin.from("audit_logs").insert({
        actor_id: context.userId,
        action: "seller_account_provisioned",
        resource: "seller",
        resource_id: seller.id,
        metadata: {
          application_id: application?.id ?? null,
          store_id: store.id,
          store_slug: slug,
          user_id: authUserId,
          email: data.email,
          role: data.role,
          commission_rate: commissionFraction,
          linked_existing_user: linkedExistingUser,
        },
      });

      return {
        tempPassword,
        userId: authUserId,
        sellerId: seller.id,
        storeId: store.id,
        storeSlug: slug,
        linkedExistingUser,
      };
    } catch (err) {
      // Best-effort compensation: never leave a half-provisioned account behind.
      if (sellerId) await supabaseAdmin.from("sellers").delete().eq("id", sellerId);
      if (createdNewUser) await supabaseAdmin.auth.admin.deleteUser(authUserId);
      throw err;
    }
  });

/* ------------------------------------------------------------------ */
/* Sellers                                                             */
/* ------------------------------------------------------------------ */

const listSellersInput = z.object({
  q: z.string().max(100).optional(),
  accountStatus: z.enum(["pending", "active", "suspended", "disabled"]).optional(),
  page: z.number().int().min(1).default(1),
});

export const listSellers = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) => listSellersInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const q = data.q ? sanitizeSearch(data.q) : "";
    let sellerIdsFromStores: string[] = [];
    if (q) {
      const { data: stores } = await supabaseAdmin
        .from("stores")
        .select("seller_id")
        .ilike("name", `%${q}%`)
        .limit(50);
      sellerIdsFromStores = [...new Set((stores ?? []).map((s) => s.seller_id))];
    }
    let query = supabaseAdmin
      .from("sellers")
      .select("*, stores(id,name,slug,verification_status,status)", { count: "exact" });
    if (data.accountStatus) query = query.eq("account_status", data.accountStatus);
    if (q) {
      const clauses = [
        `legal_name.ilike.%${q}%`,
        `email.ilike.%${q}%`,
        `phone.ilike.%${q}%`,
      ];
      if (sellerIdsFromStores.length) clauses.push(`id.in.(${sellerIdsFromStores.join(",")})`);
      query = query.or(clauses.join(","));
    }
    const from = (data.page - 1) * PAGE_SIZE;
    const { data: items, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const pageItems = items ?? [];

    // Per-seller aggregates for the list columns (Products / Orders / Sales).
    // Two batched queries instead of N+1; sales = delivered seller-order subtotals.
    const stats: Record<string, { productCount: number; orderCount: number; salesTotal: number }> = {};
    const pageSellerIds = pageItems.map((s) => s.id as string);
    if (pageSellerIds.length) {
      const [productsRes, ordersRes] = await Promise.all([
        supabaseAdmin.from("products").select("seller_id").in("seller_id", pageSellerIds).limit(5000),
        supabaseAdmin
          .from("seller_orders")
          .select("seller_id, subtotal, status")
          .in("seller_id", pageSellerIds)
          .limit(5000),
      ]);
      for (const p of productsRes.data ?? []) {
        const id = p.seller_id as string;
        stats[id] = stats[id] ?? { productCount: 0, orderCount: 0, salesTotal: 0 };
        stats[id].productCount += 1;
      }
      for (const o of ordersRes.data ?? []) {
        const id = o.seller_id as string;
        stats[id] = stats[id] ?? { productCount: 0, orderCount: 0, salesTotal: 0 };
        stats[id].orderCount += 1;
        if (o.status === "delivered") stats[id].salesTotal += Number(o.subtotal ?? 0);
      }
    }
    return { items: pageItems, total: count ?? 0, page: data.page, pageSize: PAGE_SIZE, stats };
  });

export const getSellerProfile = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) => z.object({ sellerId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sellerId = data.sellerId;

    const { data: seller, error: sellerError } = await supabaseAdmin
      .from("sellers")
      .select("*")
      .eq("id", sellerId)
      .single();
    if (sellerError || !seller) throw new Error("Seller not found.");

    const [storeRes, productsCountRes, recentOrdersRes, settlementsRes, staffRes, commissionHistoryRes, applicationRes, auditRes] =
      await Promise.all([
        supabaseAdmin.from("stores").select("*").eq("seller_id", sellerId).maybeSingle(),
        supabaseAdmin.from("products").select("id", { count: "exact", head: true }).eq("seller_id", sellerId),
        supabaseAdmin
          .from("seller_orders")
          .select("id,status,subtotal,commission_total,created_at,order_id,orders(order_number)")
          .eq("seller_id", sellerId)
          .order("created_at", { ascending: false })
          .limit(15),
        supabaseAdmin
          .from("seller_settlements")
          .select("*")
          .eq("seller_id", sellerId)
          .order("created_at", { ascending: false })
          .limit(20),
        supabaseAdmin.from("seller_staff").select("*").eq("seller_id", sellerId).order("created_at", { ascending: false }),
        supabaseAdmin
          .from("seller_commission_history")
          .select("*")
          .eq("seller_id", sellerId)
          .order("effective_from", { ascending: false }),
        supabaseAdmin
          .from("seller_applications")
          .select("id,first_name,last_name,email,proposed_store_name,status,created_at")
          .eq("seller_id", sellerId)
          .maybeSingle(),
        supabaseAdmin
          .from("audit_logs")
          .select("*")
          .or(`resource_id.eq.${sellerId},metadata->>seller_id.eq.${sellerId}`)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

    // Aggregates use the per-order snapshots; historical commission_total is never recalculated.
    const { data: payableOrders } = await supabaseAdmin
      .from("seller_orders")
      .select("subtotal,commission_total,status")
      .eq("seller_id", sellerId)
      .in("status", ["delivered", "fulfilled"]);
    const salesTotal = (payableOrders ?? [])
      .filter((o) => o.status === "delivered")
      .reduce((sum, o) => sum + (o.subtotal ?? 0), 0);
    const commissionPayable = (payableOrders ?? []).reduce(
      (sum, o) => sum + (o.commission_total ?? 0),
      0,
    );

    let reviews: ProfileReview[] = [];
    const { data: productRows } = await supabaseAdmin
      .from("products")
      .select("id")
      .eq("seller_id", sellerId)
      .limit(500);
    const productIds = (productRows ?? []).map((p) => p.id);
    if (productIds.length) {
      const { data: reviewRows } = await supabaseAdmin
        .from("reviews")
        .select("id,product_id,rating,body,moderation_status,status,created_at,first_name,last_name,products(name)")
        .in("product_id", productIds)
        .order("created_at", { ascending: false })
        .limit(10);
      reviews = (reviewRows ?? []) as unknown as ProfileReview[];
    }

    return {
      seller,
      store: storeRes.data ?? null,
      stats: {
        productCount: productsCountRes.count ?? 0,
        salesTotal,
        commissionPayable,
      },
      recentOrders: recentOrdersRes.data ?? [],
      settlements: settlementsRes.data ?? [],
      staff: staffRes.data ?? [],
      commissionHistory: commissionHistoryRes.data ?? [],
      application: applicationRes.data ?? null,
      auditLogs: auditRes.data ?? [],
      reviews,
    };
  });

export const updateSellerStatus = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) =>
    z
      .object({
        sellerId: z.string().uuid(),
        accountStatus: z.enum(["pending", "active", "suspended", "disabled"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: seller } = await supabaseAdmin
      .from("sellers")
      .select("id,account_status")
      .eq("id", data.sellerId)
      .single();
    if (!seller) throw new Error("Seller not found.");
    const { error } = await supabaseAdmin
      .from("sellers")
      .update({ account_status: data.accountStatus })
      .eq("id", data.sellerId);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "seller_status_updated",
      resource: "seller",
      resource_id: data.sellerId,
      metadata: { from: seller.account_status, to: data.accountStatus },
    });

    // Notify the seller's team about the account status change (best-effort).
    try {
      await emitSellerNotification(data.sellerId, {
        type: "store_status_changed",
        params: { status: data.accountStatus },
        link: "/seller/settings",
        payload: { seller_id: data.sellerId, from: seller.account_status, to: data.accountStatus },
      });
    } catch {
      /* notifications are best-effort */
    }

    return { ok: true as const, accountStatus: data.accountStatus };
  });

export const updateStoreVerification = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) =>
    z
      .object({
        storeId: z.string().uuid(),
        verificationStatus: z.enum(["unverified", "verified"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: store } = await supabaseAdmin
      .from("stores")
      .select("id,verification_status,seller_id")
      .eq("id", data.storeId)
      .single();
    if (!store) throw new Error("Store not found.");
    const { error } = await supabaseAdmin
      .from("stores")
      .update({ verification_status: data.verificationStatus })
      .eq("id", data.storeId);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "store_verification_updated",
      resource: "store",
      resource_id: data.storeId,
      metadata: { from: store.verification_status, to: data.verificationStatus },
    });

    // Notify the seller's team about the verification change (best-effort).
    try {
      if (store.seller_id) {
        await emitSellerNotification(store.seller_id, {
          type: "store_verification_changed",
          params: { status: data.verificationStatus },
          link: "/seller/settings",
          payload: { store_id: data.storeId, to: data.verificationStatus },
        });
      }
    } catch {
      /* notifications are best-effort */
    }

    return { ok: true as const, verificationStatus: data.verificationStatus };
  });

const updateSellerDetailsInput = z.object({
  sellerId: z.string().uuid(),
  legalName: z.string().trim().min(2).max(160),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: z
    .string()
    .trim()
    .regex(/^\+213[5-7][0-9]{8}$/, "Use an Algerian mobile number, for example +213551234567.")
    .nullable()
    .optional(),
  email: z.string().trim().email().max(255).nullable().optional(),
});

/** Edit a seller's identity/contact details. Audited with a from/to diff. */
export const updateSellerDetails = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) => updateSellerDetailsInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: seller } = await supabaseAdmin
      .from("sellers")
      .select("id, legal_name, first_name, last_name, phone, email")
      .eq("id", data.sellerId)
      .maybeSingle();
    if (!seller) throw new Error("Seller not found.");
    const patch = {
      legal_name: data.legalName,
      first_name: data.firstName,
      last_name: data.lastName,
      phone: data.phone?.trim() || null,
      email: data.email?.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabaseAdmin.from("sellers").update(patch).eq("id", data.sellerId);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "seller_details_updated",
      resource: "seller",
      resource_id: data.sellerId,
      metadata: {
        from: {
          legal_name: seller.legal_name,
          first_name: seller.first_name,
          last_name: seller.last_name,
          phone: seller.phone,
          email: seller.email,
        },
        to: {
          legal_name: patch.legal_name,
          first_name: patch.first_name,
          last_name: patch.last_name,
          phone: patch.phone,
          email: patch.email,
        },
      },
    });
    return { ok: true as const };
  });

export const updateCommissionRate = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) =>
    z.object({ sellerId: z.string().uuid(), rate: z.number().min(0).max(100) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Accept either a percent (0–100) or a fraction (0–1); store as a fraction.
    const fraction = data.rate > 1 ? data.rate / 100 : data.rate;
    if (!(fraction >= 0 && fraction <= 1)) throw new Error("Rate must be between 0% and 100%.");
    const { data: seller } = await supabaseAdmin
      .from("sellers")
      .select("id,commission_rate")
      .eq("id", data.sellerId)
      .single();
    if (!seller) throw new Error("Seller not found.");
    const now = new Date().toISOString();
    const { error: historyError } = await supabaseAdmin.from("seller_commission_history").insert({
      seller_id: data.sellerId,
      rate: fraction,
      effective_from: now,
      changed_by: context.userId,
    });
    if (historyError) throw new Error(historyError.message);
    const { error } = await supabaseAdmin
      .from("sellers")
      .update({ commission_rate: fraction })
      .eq("id", data.sellerId);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "seller_commission_updated",
      resource: "seller",
      resource_id: data.sellerId,
      metadata: { from: seller.commission_rate, to: fraction },
    });
    return { ok: true as const, rate: fraction };
  });
