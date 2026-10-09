/**
 * New seller onboarding system — server functions.
 *
 * Admin flow: createStoreWithCredentials creates seller + store + auth identity
 * in one step, returning temp credentials for the merchant.
 *
 * Merchant flow: 4-step onboarding wizard (personal info → store info →
 * appearance → credentials). On completion, onboarded_at is set.
 *
 * Security: admin functions require adminOnly + sellers.manage permission.
 * Seller functions resolve identity server-side via requireSellerAllowMustReset
 * (onboarding sellers may still have must_reset_password=true).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdminPermission } from "@/lib/admin-permissions";
import { requireSellerAllowMustReset } from "@/lib/seller-auth";
import { generateUsername, syntheticEmailForUsername } from "@/lib/seller-identity";

const sellerAuth = [requireSupabaseAuth] as const;
const adminOnly = [requireSupabaseAuth] as const;

/* --------------------------- admin: create store --------------------------- */

const createStoreInput = z.object({
  commissionRate: z.number().min(0).max(1),
});

export type CreateStoreResult = {
  sellerId: string;
  storeId: string;
  storeSlug: string;
  username: string;
  tempPassword: string;
};

function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export const createStoreWithCredentials = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) => createStoreInput.parse(data))
  .handler(async ({ data, context }): Promise<CreateStoreResult> => {
    await assertAdminPermission(context, "sellers.manage");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const tempPassword = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "").slice(0, 12);
    const username = generateUsername();
    const syntheticEmail = syntheticEmailForUsername(username);
    const now = new Date().toISOString();

    // 1. Create Supabase Auth user with synthetic email
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: syntheticEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        display_name: username,
        provisioned_by: "modalia-admin-create-store",
      },
    });
    if (authError || !authUser?.user?.id) {
      throw new Error(`Could not create login: ${authError?.message ?? "unknown"}`);
    }
    const authUserId = authUser.user.id;

    try {
      // 2. Create sellers record (active, not onboarded yet)
      const { data: seller, error: sellerError } = await supabaseAdmin
        .from("sellers")
        .insert({
          owner_id: authUserId,
          legal_name: `Store ${username}`,
          status: "active",
          account_status: "active",
          commission_rate: data.commissionRate,
          must_reset_password: true,
          approved_at: now,
        })
        .select("id")
        .single();
      if (sellerError || !seller) throw new Error(`Could not create seller: ${sellerError?.message}`);
      const sellerId = seller.id as string;

      // 3. Create stores record with unique slug
      const baseSlug = `store-${username.toLowerCase().replace("seller_", "")}`;
      let storeSlug = baseSlug;
      let attempt = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data: existing } = await supabaseAdmin
          .from("stores")
          .select("id")
          .eq("slug", storeSlug)
          .maybeSingle();
        if (!existing) break;
        attempt += 1;
        storeSlug = `${baseSlug}-${attempt}`;
        if (attempt > 10) throw new Error("Could not generate unique store slug.");
      }

      const { data: store, error: storeError } = await supabaseAdmin
        .from("stores")
        .insert({
          seller_id: sellerId,
          name: `Store ${username}`,
          slug: storeSlug,
          status: "active",
        })
        .select("id, slug")
        .single();
      if (storeError || !store) throw new Error(`Could not create store: ${storeError?.message}`);

      // 4. Create seller_accounts identity record
      const { error: accountError } = await supabaseAdmin.from("seller_accounts").insert({
        seller_id: sellerId,
        username,
        auth_user_id: authUserId,
        login_method: "username",
        must_change_password: true,
        status: "active",
      });
      if (accountError) throw new Error(`Could not create identity: ${accountError.message}`);

      // 5. Audit log
      await supabaseAdmin.from("audit_logs").insert({
        actor_id: context.userId,
        action: "seller_store_created",
        resource: "seller",
        resource_id: sellerId,
        metadata: { username, store_slug: storeSlug, commission_rate: data.commissionRate },
      });

      return {
        sellerId,
        storeId: store.id as string,
        storeSlug: store.slug as string,
        username,
        tempPassword,
      };
    } catch (err) {
      // Best-effort cleanup: never leave partial state
      await supabaseAdmin.auth.admin.deleteUser(authUserId).catch(() => {});
      throw err;
    }
  });

/* --------------------- seller: onboarding step functions --------------------- */

const sellerOnlyOnboarding = async (context: any) => {
  const userId = context?.userId as string | undefined;
  if (!userId) throw new Error("Unauthorized");
  return requireSellerAllowMustReset({ supabase: context.supabase, userId });
};

export const getOnboardingStatus = createServerFn({ method: "GET" })
  .middleware(sellerAuth)
  .handler(async ({ context }): Promise<{ onboarded: boolean; mustResetPassword: boolean }> => {
    const seller = await sellerOnlyOnboarding(context);
    const { supabase } = context as any;
    const { data } = await supabase
      .from("sellers")
      .select("onboarded_at, must_reset_password")
      .eq("id", seller.sellerId)
      .maybeSingle();
    return {
      onboarded: data?.onboarded_at != null,
      mustResetPassword: data?.must_reset_password ?? false,
    };
  });

const personalInfoInput = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().max(255),
  phone: z.string().min(6).max(30),
  wilaya: z.string().min(1).max(100),
  address: z.string().max(500).optional().default(""),
  idCardNumber: z.string().max(50).optional().default(""),
});

export const saveOnboardingPersonalInfo = createServerFn({ method: "POST" })
  .middleware(sellerAuth)
  .inputValidator((data) => personalInfoInput.parse(data))
  .handler(async ({ data, context }) => {
    const seller = await sellerOnlyOnboarding(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("sellers")
      .update({
        first_name: data.firstName,
        last_name: data.lastName,
        email: data.email,
        phone: data.phone,
        legal_name: `${data.firstName} ${data.lastName}`.trim(),
      })
      .eq("id", seller.sellerId);
    if (error) throw new Error(`Could not save personal info: ${error.message}`);
    // Store wilaya/address/id in seller metadata via a separate update if columns exist
    return { ok: true };
  });

const storeInfoInput = z.object({
  storeName: z.string().min(2).max(120),
  storeSlug: z
    .string()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers and hyphens"),
  description: z.string().max(2000).optional().default(""),
  contactEmail: z.string().email().max(255).optional().or(z.literal("")),
  contactPhone: z.string().max(30).optional().default(""),
  facebookUrl: z.string().url().max(500).optional().or(z.literal("")),
  instagramUrl: z.string().url().max(500).optional().or(z.literal("")),
  tiktokUrl: z.string().url().max(500).optional().or(z.literal("")),
});

export const saveOnboardingStoreInfo = createServerFn({ method: "POST" })
  .middleware(sellerAuth)
  .inputValidator((data) => storeInfoInput.parse(data))
  .handler(async ({ data, context }) => {
    const seller = await sellerOnlyOnboarding(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Ensure slug uniqueness (excluding own store)
    const { data: existing } = await supabaseAdmin
      .from("stores")
      .select("id, seller_id")
      .eq("slug", data.storeSlug)
      .maybeSingle();
    if (existing && (existing as any).seller_id !== seller.sellerId) {
      throw new Error("This store URL is already taken. Please choose another.");
    }

    const socialLinks: Record<string, string> = {};
    if (data.facebookUrl) socialLinks['facebook'] = data.facebookUrl;
    if (data.instagramUrl) socialLinks['instagram'] = data.instagramUrl;
    if (data.tiktokUrl) socialLinks['tiktok'] = data.tiktokUrl;

    const { error } = await supabaseAdmin
      .from("stores")
      .update({
        name: data.storeName,
        slug: data.storeSlug,
        description: data.description || null,
        contact_email: data.contactEmail || null,
        contact_phone: data.contactPhone || null,
        settings: { social_links: socialLinks },
      })
      .eq("seller_id", seller.sellerId);
    if (error) throw new Error(`Could not save store info: ${error.message}`);
    return { ok: true, slug: data.storeSlug };
  });

export const checkStoreSlugAvailable = createServerFn({ method: "GET" })
  .middleware(sellerAuth)
  .inputValidator((data) => z.object({ slug: z.string().min(3).max(60) }).parse(data))
  .handler(async ({ data, context }) => {
    const seller = await sellerOnlyOnboarding(context);
    const { supabase } = context as any;
    const { data: existing } = await supabase
      .from("stores")
      .select("id, seller_id")
      .eq("slug", data.slug)
      .maybeSingle();
    const available = !existing || (existing as any).seller_id === seller.sellerId;
    return { available, suggestion: available ? null : `${data.slug}-${Math.floor(Math.random() * 100)}` };
  });

const appearanceInput = z.object({
  logoPath: z.string().max(1000).optional().default(""),
  bannerPath: z.string().max(1000).optional().default(""),
  bio: z.string().max(2000).optional().default(""),
  customLinks: z
    .array(z.object({ title: z.string().min(1).max(100), url: z.string().url().max(500) }))
    .max(10)
    .optional()
    .default([]),
});

export const saveOnboardingAppearance = createServerFn({ method: "POST" })
  .middleware(sellerAuth)
  .inputValidator((data) => appearanceInput.parse(data))
  .handler(async ({ data, context }) => {
    const seller = await sellerOnlyOnboarding(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("stores")
      .update({
        logo_path: data.logoPath || null,
        banner_path: data.bannerPath || null,
        ...(data.bio ? { description: data.bio } : {}),
        settings: { custom_links: data.customLinks },
      })
      .eq("seller_id", seller.sellerId);
    if (error) throw new Error(`Could not save appearance: ${error.message}`);
    return { ok: true };
  });

const completeInput = z.object({
  newUsername: z.string().min(3).max(60),
  newPassword: z.string().min(8).max(128),
});

export const completeSellerOnboarding = createServerFn({ method: "POST" })
  .middleware(sellerAuth)
  .inputValidator((data) => completeInput.parse(data))
  .handler(async ({ data, context }) => {
    const seller = await sellerOnlyOnboarding(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();

    // 1. Check username availability (if changed)
    const { data: existingAccount } = await supabaseAdmin
      .from("seller_accounts")
      .select("id, seller_id")
      .eq("username", data.newUsername)
      .maybeSingle();
    if (existingAccount && (existingAccount as any).seller_id !== seller.sellerId) {
      throw new Error("This username is already taken.");
    }

    // 2. Update auth password via admin API
    // Resolve the auth user id from seller_accounts
    const { data: account } = await supabaseAdmin
      .from("seller_accounts")
      .select("auth_user_id, username")
      .eq("seller_id", seller.sellerId)
      .maybeSingle();
    if (!account) throw new Error("Identity record not found.");

    const { error: pwError } = await supabaseAdmin.auth.admin.updateUserById(
      (account as any).auth_user_id,
      { password: data.newPassword },
    );
    if (pwError) throw new Error(`Could not update password: ${pwError.message}`);

    // 3. Update seller_accounts (username + clear must_change)
    const { error: accError } = await supabaseAdmin
      .from("seller_accounts")
      .update({
        username: data.newUsername,
        ...(data.newUsername.includes("@") ? { email: data.newUsername } : {}),
        login_method: data.newUsername.includes("@") ? "email" : "username",
        must_change_password: false,
      })
      .eq("seller_id", seller.sellerId);
    if (accError) throw new Error(`Could not update identity: ${accError.message}`);

    // 4. Mark onboarded + clear legacy flag
    const { error: sellerError } = await supabaseAdmin
      .from("sellers")
      .update({ onboarded_at: now, must_reset_password: false })
      .eq("id", seller.sellerId);
    if (sellerError) throw new Error(`Could not complete onboarding: ${sellerError.message}`);

    // 5. Notify admin (insert notification for super admins via audit log)
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: seller.sellerId,
      action: "seller_onboarding_completed",
      resource: "seller",
      resource_id: seller.sellerId,
      metadata: { username: data.newUsername },
    });

    return { ok: true };
  });

export { slugifyName };

/** Public wilaya list for the onboarding address step (seller-scoped read). */
export const listWilayasForOnboarding = createServerFn({ method: "GET" })
  .middleware(sellerAuth)
  .handler(async ({ context }) => {
    const { supabase } = context as any;
    const { data, error } = await supabase
      .from("wilayas")
      .select("id, code, name")
      .eq("active", true)
      .order("code");
    if (error) throw new Error(error.message);
    return {
      wilayas: (data ?? []).map((w: any) => ({
        id: w.id,
        code: w.code,
        name:
          typeof w.name === "object" && w.name !== null
            ? (w.name.fr ?? w.name.en ?? w.code)
            : String(w.name ?? w.code),
      })),
    };
  });
