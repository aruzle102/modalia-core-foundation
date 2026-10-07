import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";
import { emitSellerNotification } from "@/lib/notifications.functions";
import { assertAdmin } from "@/lib/admin-auth";
import { assertAdminPermission } from "@/lib/admin-permissions";
import { ALL_SELLER_PERMISSIONS, type SellerPermission } from "@/lib/seller-auth";

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
    await assertAdminPermission(context, "applications.decide");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin.from("seller_applications").select("*", { count: "exact" });
    if (data.status) query = query.eq("status", data.status as Database["public"]["Enums"]["seller_application_status"]);
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
    await assertAdminPermission(context, "applications.decide");
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
    await assertAdminPermission(context, "applications.decide");
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
        .update({ status: "under_review" as Database["public"]["Enums"]["seller_application_status"], reviewed_by: context.userId, ...notesPatch })
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

    if (application.status !== "pending" && (application.status as string) !== "under_review") {
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
    await assertAdminPermission(context, "applications.decide");
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
/* Seller onboarding wizard: store slug availability + full provisioning */
/* ------------------------------------------------------------------ */

export const checkStoreSlug = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) => z.object({ slug: z.string().trim().min(1).max(80) }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdminPermission(context, "sellers.manage");
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

/** Permission keys the wizard may grant to a staff account — bound to the REAL
 * SellerPermission union (src/lib/seller-auth.ts), grouped by area for the UI.
 * Labels and group names live in the admin i18n dictionary
 * (`admin.sellers.sellerWizard.permissionLabels` / `.permissionGroups`).
 * Registry #4 fixed-inline: no bogus keys, no silently-dropped checkboxes.
 */
export type WizardPermissionGroup =
  | "products"
  | "orders"
  | "marketing"
  | "customers"
  | "store"
  | "team"
  | "reports"
  | "support";

export const WIZARD_STAFF_PERMISSIONS: readonly {
  key: SellerPermission;
  group: WizardPermissionGroup;
}[] = [
  { key: "products.view", group: "products" },
  { key: "products.edit", group: "products" },
  { key: "products.publish", group: "products" },
  { key: "inventory.manage", group: "products" },
  { key: "orders.view", group: "orders" },
  { key: "orders.update", group: "orders" },
  { key: "coupons.manage", group: "marketing" },
  { key: "promotions.manage", group: "marketing" },
  { key: "bundles.manage", group: "marketing" },
  { key: "customers.view", group: "customers" },
  { key: "reviews.manage", group: "customers" },
  { key: "store.manage", group: "store" },
  { key: "settings.manage", group: "store" },
  { key: "staff.manage", group: "team" },
  { key: "analytics.view", group: "reports" },
  { key: "finance.view", group: "reports" },
  { key: "support.manage", group: "support" },
];

// Fail fast (and loudly) on module load if the wizard list ever drifts from
// the union — a silent mismatch is what made bogus keys possible before.
{
  const listed = WIZARD_STAFF_PERMISSIONS.map((p) => p.key);
  if (new Set(listed).size !== ALL_SELLER_PERMISSIONS.length || listed.length !== ALL_SELLER_PERMISSIONS.length) {
    throw new Error("WIZARD_STAFF_PERMISSIONS is out of sync with the SellerPermission union.");
  }
}

/** Every staff permission key validated against the real union. */
const permissionKeySchema = z.enum(
  ALL_SELLER_PERMISSIONS as unknown as [SellerPermission, ...SellerPermission[]],
);

const ALREADY_REGISTERED_MESSAGE =
  "A login with this email already exists. Ask the account owner to sign in with their existing login, or use a different email.";

const PHONE_SCHEMA = z
  .string()
  .trim()
  .regex(/^\+213[5-7][0-9]{8}$/, "Use an Algerian mobile number, for example +213551234567.");

const personSchema = z.object({
  firstName: z.string().trim().min(2).max(100),
  lastName: z.string().trim().min(2).max(100),
  phone: PHONE_SCHEMA,
  email: z.string().trim().email().max(255),
});

/**
 * Owner provisioning — quick-create mode (user-requested flow):
 * the admin only supplies the login email + commission rate. Name/phone and
 * the store profile are OPTIONAL: the seller completes them himself in the
 * seller onboarding wizard after first login with the temporary credentials.
 * When an application is attached, its data still pre-fills everything.
 */
const ownerProvisionInput = z.object({
  mode: z.literal("owner"),
  applicationId: z.string().uuid().optional(),
  email: z.string().trim().email().max(255),
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(60).optional(),
  storeName: z.string().trim().min(2).max(160).optional(),
  storeSlug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug may only contain lowercase letters, numbers and dashes.")
    .optional(),
  storeDescription: z.string().trim().max(2000).optional(),
  storeLogoUrl: z.string().trim().max(500).optional(),
  storeBannerUrl: z.string().trim().max(500).optional(),
  storeContactEmail: z.string().trim().email().max(255).optional(),
  storeContactPhone: z.string().trim().max(60).optional(),
  commissionRate: z.number().min(0).max(100),
});

const staffProvisionInput = z.object({
  mode: z.literal("staff"),
  /** Must reference an existing, active seller — verified in the handler. */
  sellerId: z.string().uuid(),
  ...personSchema.shape,
  staffTitle: z.string().trim().max(120).optional(),
  staffPermissions: z
    .array(permissionKeySchema)
    .min(1, "Choose at least one permission for a staff account.")
    .max(ALL_SELLER_PERMISSIONS.length),
  staffRole: z.enum(["manager", "staff", "viewer"]).default("staff"),
});

const provisionSellerInput = z.discriminatedUnion("mode", [ownerProvisionInput, staffProvisionInput]);

export type ProvisionSellerResult = {
  tempPassword: string;
  userId: string;
  sellerId: string;
  storeId: string | null;
  storeSlug: string | null;
  mode: "owner" | "staff";
};

/** Server-side slugify shared with the wizard's client-side suggestion. */
function slugifyServer(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-+|-+$)/g, "") || "store"
  );
}

/**
 * Seller+store provisioning for the admin onboarding wizard (Section 18 rebuild).
 *
 * OWNER mode: full provisioning — auth user, sellers row with
 * `must_reset_password: true` (registry #2 fixed-inline), stores row with a
 * unique slug, user_roles (seller_owner), commission history, application →
 * converted (owner mode only), audit log.
 *
 * STAFF mode: creates NO sellers row and NO store — auth user + user_roles
 * (seller_staff) + a seller_staff row against an existing, active seller
 * (registry #4 fixed-inline). Every permission key is validated against the
 * real SellerPermission union, so none are silently dropped.
 *
 * An already-registered email is REJECTED with a clear message — the old
 * silent-password-reset branch is deleted entirely (registry #3
 * fixed-inline). Compensation on ANY failure: delete the seller_staff row
 * (staff mode) / sellers row (owner mode), delete the user's user_roles
 * residue, delete the auth user. No partial state is ever left behind.
 *
 * The temporary password is generated server-side, returned ONCE in the
 * result, never logged, never put in a URL, never stored.
 */
export const provisionSeller = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) => provisionSellerInput.parse(data))
  .handler(async ({ data, context }): Promise<ProvisionSellerResult> => {
    await assertAdminPermission(context, "sellers.manage");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const tempPassword = (crypto.randomUUID() + crypto.randomUUID()).slice(0, 20);
    const now = new Date().toISOString();

    /* ------------------------------- STAFF mode ------------------------------- */
    if (data.mode === "staff") {
      // The seller must exist and be active — staff are attached to it, never
      // given their own sellers row (registry #4 fixed-inline).
      const { data: seller, error: sellerLookupError } = await supabaseAdmin
        .from("sellers")
        .select("id,legal_name,account_status")
        .eq("id", data.sellerId)
        .single();
      if (sellerLookupError || !seller) throw new Error("Seller not found.");
      if (seller.account_status !== "active") {
        throw new Error("Staff accounts can only be added to an active seller.");
      }

      const { data: created, error: createError } =
        await supabaseAdmin.auth.admin.createUser({
          email: data.email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: {
            display_name: `${data.firstName} ${data.lastName}`.trim() || data.email.split("@")[0],
            force_password_reset: true,
            provisioned_by: "modalia-admin",
          },
        });
      if (createError) {
        // An already-registered email is REJECTED — never silently
        // password-reset an existing login (registry #3 fixed-inline).
        if (/already been registered|already exists|duplicate/i.test(createError.message ?? "")) {
          throw new Error(ALREADY_REGISTERED_MESSAGE);
        }
        throw new Error(`Could not create login: ${createError.message}`);
      }
      const authUserId = created?.user?.id;
      if (!authUserId) throw new Error("Could not create login.");

      let staffRowId: string | null = null;
      try {
        const { error: roleError } = await supabaseAdmin
          .from("user_roles")
          .upsert({ user_id: authUserId, role: "seller_staff" }, { onConflict: "user_id,role" });
        if (roleError) throw new Error(roleError.message);

        const { data: staffRow, error: staffError } = await supabaseAdmin
          .from("seller_staff")
          .upsert(
            {
              seller_id: seller.id,
              user_id: authUserId,
              role: "seller_staff",
              title: data.staffTitle?.trim() || "Staff",
              permissions: data.staffPermissions,
              staff_role: data.staffRole,
              active: true,
            },
            { onConflict: "seller_id,user_id" },
          )
          .select("id")
          .single();
        if (staffError || !staffRow) {
          throw new Error(staffError?.message ?? "Could not create staff record.");
        }
        staffRowId = staffRow.id;

        await supabaseAdmin.from("audit_logs").insert({
          actor_id: context.userId,
          action: "seller_staff_provisioned",
          resource: "seller",
          resource_id: seller.id,
          metadata: {
            user_id: authUserId,
            email: data.email,
            title: data.staffTitle?.trim() || "Staff",
            permissions: data.staffPermissions,
          },
        });

        return {
          tempPassword,
          userId: authUserId,
          sellerId: seller.id,
          storeId: null,
          storeSlug: null,
          mode: "staff",
        };
      } catch (err) {
        // Best-effort compensation: never leave partial state behind.
        if (staffRowId) await supabaseAdmin.from("seller_staff").delete().eq("id", staffRowId);
        await supabaseAdmin.from("user_roles").delete().eq("user_id", authUserId);
        await supabaseAdmin.auth.admin.deleteUser(authUserId);
        throw err;
      }
    }

    /* ------------------------------- OWNER mode ------------------------------- */
    // Quick-create defaults (data is narrowed to the owner variant here): the
    // seller fills the real profile/store data in onboarding — the admin only
    // guarantees a usable login + store row.
    const emailLocal = data.email.split("@")[0] || "seller";
    const displayName = `${data.firstName?.trim() ?? ""} ${data.lastName?.trim() ?? ""}`.trim() || emailLocal;
    const storeName = data.storeName?.trim() || displayName;
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

    const { data: created, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
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
      // An already-registered email is REJECTED — never silently
      // password-reset an existing login (registry #3 fixed-inline).
      if (/already been registered|already exists|duplicate/i.test(createError.message ?? "")) {
        throw new Error(ALREADY_REGISTERED_MESSAGE);
      }
      throw new Error(`Could not create login: ${createError.message}`);
    }
    const authUserId = created?.user?.id;
    if (!authUserId) throw new Error("Could not create login.");

    const commissionFraction = data.commissionRate / 100;
    let sellerId: string | null = null;
    try {
      // must_reset_password: true forces the first-login password change
      // (registry #2 fixed-inline; enforcement lands in Sections 20-28).
      const { data: seller, error: sellerError } = await supabaseAdmin
        .from("sellers")
        .insert({
          owner_id: authUserId,
          legal_name: storeName,
          first_name: data.firstName?.trim() || null,
          last_name: data.lastName?.trim() || null,
          phone: data.phone?.trim() || null,
          email: data.email,
          status: "active",
          account_status: "active",
          commission_rate: commissionFraction,
          approved_at: now,
          must_reset_password: true,
        })
        .select("id")
        .single();
      if (sellerError || !seller) throw new Error(sellerError?.message ?? "Could not create seller.");
      sellerId = seller.id;

      // Unique store slug.
      const base = data.storeSlug ?? slugifyServer(storeName);
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
          name: storeName,
          slug,
          status: "active",
          verification_status: "unverified",
          description: data.storeDescription || null,
          logo_path: data.storeLogoUrl || null,
          banner_path: data.storeBannerUrl || null,
          contact_email: data.storeContactEmail || null,
          contact_phone: data.storeContactPhone || null,
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
          .update({ seller_id: seller.id, status: "converted" as Database["public"]["Enums"]["seller_application_status"] })
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
          role: "seller_owner",
          commission_rate: commissionFraction,
          must_reset_password: true,
        },
      });

      return {
        tempPassword,
        userId: authUserId,
        sellerId: seller.id,
        storeId: store.id,
        storeSlug: slug,
        mode: "owner",
      };
    } catch (err) {
      // Best-effort compensation: clean the user_roles residue, the sellers
      // row, then the auth user — never leave a half-provisioned account.
      if (sellerId) await supabaseAdmin.from("sellers").delete().eq("id", sellerId);
      await supabaseAdmin.from("user_roles").delete().eq("user_id", authUserId);
      await supabaseAdmin.auth.admin.deleteUser(authUserId);
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
    await assertAdminPermission(context, "sellers.view");
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
    await assertAdminPermission(context, "sellers.view");
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

    // Orders by status for the profile analytics card (real seller_orders rows).
    const { data: allSellerOrders } = await supabaseAdmin
      .from("seller_orders")
      .select("status")
      .eq("seller_id", sellerId)
      .limit(5000);
    const orderStatusCountsMap = new Map<string, number>();
    for (const o of allSellerOrders ?? []) {
      orderStatusCountsMap.set(o.status, (orderStatusCountsMap.get(o.status) ?? 0) + 1);
    }
    const orderStatusCounts = [...orderStatusCountsMap.entries()].map(([status, count]) => ({
      status,
      count,
    }));
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
      orderStatusCounts,
    };
  });

/* ------------------------------------------------------------------ */
/* Monthly profit                                                       */
/* ------------------------------------------------------------------ */

const monthlyProfitInput = z.object({
  sellerId: z.string().uuid(),
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
});

export type SellerMonthlyProfit = {
  year: number;
  month: number;
  orderCount: number;
  revenue: number;
  costTotal: number;
  commissionTotal: number;
  sellerProfit: number;
  platformProfit: number;
  costEstimated: boolean;
};

/**
 * Monthly per-store profit breakdown for the admin (user-requested):
 * when inspecting a store, the admin sees for a given month how much was
 * sold (revenue), the seller's profit and the platform's profit.
 *
 * - revenue: sum of seller_orders.subtotal (delivered + fulfilled only)
 * - platformProfit: sum of seller_orders.commission_total (server-authoritative)
 * - costTotal: sum over order items of qty * products.cost_price
 * - sellerProfit: revenue - costTotal - commissionTotal
 *
 * NOTE (honest): costTotal uses the product's CURRENT cost_price, because
 * order_items do not snapshot the cost at sale time. If the seller later
 * edits a cost price, past months are recomputed with the new value — the
 * `costEstimated` flag surfaces this. Commission is server-authoritative and
 * never estimated.
 */
export const getSellerMonthlyProfit = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) => monthlyProfitInput.parse(data))
  .handler(async ({ data, context }): Promise<SellerMonthlyProfit> => {
    await assertAdminPermission(context, "sellers.view");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const start = new Date(Date.UTC(data.year, data.month - 1, 1)).toISOString();
    const end = new Date(Date.UTC(data.year, data.month, 1)).toISOString();

    const { data: orders, error: ordersError } = await supabaseAdmin
      .from("seller_orders")
      .select("id, subtotal, commission_total, status")
      .eq("seller_id", data.sellerId)
      .gte("created_at", start)
      .lt("created_at", end)
      .in("status", ["delivered", "fulfilled"])
      .limit(5000);
    if (ordersError) throw new Error(ordersError.message);

    const orderIds = (orders ?? []).map((o) => o.id);
    let costTotal = 0;
    if (orderIds.length > 0) {
      const { data: items, error: itemsError } = await supabaseAdmin
        .from("order_items")
        .select("quantity, product_id, products(cost_price)")
        .in("seller_order_id", orderIds)
        .limit(20000);
      if (itemsError) throw new Error(itemsError.message);
      for (const it of items ?? []) {
        const qty = Number(it.quantity ?? 0);
        const prod = it.products as unknown as { cost_price?: number | null } | null;
        const cost = Number(prod?.cost_price ?? 0);
        if (Number.isFinite(qty) && Number.isFinite(cost)) costTotal += qty * cost;
      }
    }

    const revenue = (orders ?? []).reduce((s, o) => s + Number(o.subtotal ?? 0), 0);
    const commissionTotal = (orders ?? []).reduce((s, o) => s + Number(o.commission_total ?? 0), 0);
    const sellerProfit = revenue - costTotal - commissionTotal;

    return {
      year: data.year,
      month: data.month,
      orderCount: (orders ?? []).length,
      revenue,
      costTotal,
      commissionTotal,
      sellerProfit,
      platformProfit: commissionTotal,
      costEstimated: true,
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
    await assertAdminPermission(context, "sellers.manage");
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

/**
 * Update a staff member's permissions and active flag (admin-only).
 * Registry #230: permissions were selectable only at provisioning; this makes
 * them manageable afterwards. Keys validated against the real SellerPermission
 * union; every change is audit-logged.
 */
export const updateStaffPermissions = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) =>
    z
      .object({
        staffId: z.string().uuid(),
        permissions: z
          .array(permissionKeySchema)
          .min(1, "Choose at least one permission for a staff account.")
          .max(ALL_SELLER_PERMISSIONS.length),
        active: z.boolean(),
        role: z.enum(["manager", "staff", "viewer"]).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdminPermission(context, "sellers.manage");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: staff } = await supabaseAdmin
      .from("seller_staff")
      .select("id,seller_id,user_id,permissions,active")
      .eq("id", data.staffId)
      .single();
    if (!staff) throw new Error("Staff member not found.");
    // Structural: the store owner is never a staff row — refuse if it ever happens.
    const { data: seller } = await supabaseAdmin
      .from("sellers")
      .select("owner_id")
      .eq("id", staff.seller_id)
      .maybeSingle();
    if (seller && seller.owner_id === staff.user_id) {
      throw new Error("The store owner cannot be managed as staff.");
    }
    const { error } = await supabaseAdmin
      .from("seller_staff")
      .update({
        permissions: data.permissions,
        active: data.active,
        ...(data.role ? { staff_role: data.role } : {}),
      })
      .eq("id", data.staffId);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "seller_staff_permissions_updated",
      resource: "seller_staff",
      resource_id: data.staffId,
      metadata: {
        seller_id: staff.seller_id,
        active: data.active,
        permissionCount: data.permissions.length,
      },
    });
    return { ok: true as const };
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
    await assertAdminPermission(context, "sellers.manage");
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
    await assertAdminPermission(context, "sellers.manage");
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
