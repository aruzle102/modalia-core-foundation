/**
 * MODALIA — Secure Admin Invitation System.
 *
 * Only super_admin can create invitations. Tokens are:
 * - Cryptographically random (32 bytes)
 * - Stored as SHA-256 hashes (never plaintext in DB)
 * - Single-use, expiring (7 days default)
 * - Bound to the invited email address
 *
 * The recipient opens /invite/<token>, sets a password, and signs in.
 *
 * NOTE: Database tables (admin_invitations) are created by migration
 * 20261016170000_email_invitation_system.sql which is NOT yet applied.
 * The `db` helper uses `any` typing until types are regenerated.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash, randomBytes } from "crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getAdminIdentity } from "./admin-permissions";
import type { AdminRole } from "./admin-permissions";

const adminOnly = [requireSupabaseAuth] as const;

/* eslint-disable @typescript-eslint/no-explicit-any */

async function getDb(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function getUserId(context: unknown): Promise<string> {
  const ctx = context as { user?: { id?: string } };
  if (ctx.user?.id) return ctx.user.id;
  throw new Error("Not authenticated.");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function isSuperAdmin(identity: Awaited<ReturnType<typeof getAdminIdentity>>): boolean {
  return identity.kind === "super_admin";
}

// ---------------------------------------------------------------------------
// Create invitation (super_admin only)
// ---------------------------------------------------------------------------

const createInvitationSchema = z.object({
  email: z.string().email().max(254),
  role: z.enum(["admin", "supervisor", "viewer"]),
  permissions: z.array(z.string()).max(50),
  expiresInDays: z.number().int().min(1).max(30).default(7),
});

export const createAdminInvitation = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .validator((d) => createInvitationSchema.parse(d))
  .handler(async ({ context, data }) => {
    const identity = await getAdminIdentity(context);
    if (!isSuperAdmin(identity)) {
      throw new Error("Only super admins can invite team members.");
    }
    const userId = await getUserId(context);
    const db = await getDb();
    const email = data.email.trim().toLowerCase();

    const { data: existing } = await db
      .from("admin_invitations")
      .select("id")
      .eq("email", email)
      .eq("status", "pending")
      .maybeSingle();

    if (existing) {
      throw new Error("A pending invitation already exists for this email.");
    }

    const token = randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + data.expiresInDays * 86400000).toISOString();

    const { data: invitation, error } = await db
      .from("admin_invitations")
      .insert({
        email,
        role: data.role,
        permissions: data.permissions,
        token_hash: tokenHash,
        expires_at: expiresAt,
        invited_by: userId,
      })
      .select("id")
      .single();

    if (error || !invitation) {
      throw new Error("Could not create invitation.");
    }

    await db.from("audit_logs").insert({
      actor_id: userId,
      action: "invitation.create",
      resource_type: "admin_invitation",
      resource_id: invitation.id,
      details: { email, role: data.role },
    });

    return { invitationId: invitation.id, token, expiresAt };
  });

// ---------------------------------------------------------------------------
// List invitations (super_admin only)
// ---------------------------------------------------------------------------

export const listAdminInvitations = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .handler(async ({ context }) => {
    const identity = await getAdminIdentity(context);
    if (!isSuperAdmin(identity)) {
      throw new Error("Only super admins can view invitations.");
    }
    const db = await getDb();
    const { data, error } = await db
      .from("admin_invitations")
      .select("id,email,role,status,expires_at,accepted_at,created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw new Error("Could not load invitations.");
    return { invitations: data ?? [] };
  });

// ---------------------------------------------------------------------------
// Revoke invitation (super_admin only)
// ---------------------------------------------------------------------------

export const revokeAdminInvitation = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .validator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const identity = await getAdminIdentity(context);
    if (!isSuperAdmin(identity)) {
      throw new Error("Only super admins can revoke invitations.");
    }
    const userId = await getUserId(context);
    const db = await getDb();

    const { error } = await db
      .from("admin_invitations")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("status", "pending");

    if (error) throw new Error("Could not revoke invitation.");

    await db.from("audit_logs").insert({
      actor_id: userId,
      action: "invitation.revoke",
      resource_type: "admin_invitation",
      resource_id: data.id,
      details: {},
    });

    return { success: true };
  });

// ---------------------------------------------------------------------------
// Validate invitation token (public)
// ---------------------------------------------------------------------------

export const validateInvitationToken = createServerFn({ method: "GET" })
  .validator((d) => z.object({ token: z.string().min(1).max(128) }).parse(d))
  .handler(async ({ data }) => {
    const db = await getDb();
    const tokenHash = hashToken(data.token);

    const { data: invitation } = await db
      .from("admin_invitations")
      .select("id,email,role,expires_at,status")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (!invitation) {
      return { valid: false as const, reason: "Invalid invitation link." };
    }
    if (invitation.status !== "pending") {
      return {
        valid: false as const,
        reason:
          invitation.status === "accepted"
            ? "This invitation has already been used."
            : invitation.status === "revoked"
              ? "This invitation has been revoked."
              : "This invitation is no longer valid.",
      };
    }
    if (new Date(invitation.expires_at) < new Date()) {
      await db.from("admin_invitations").update({ status: "expired" }).eq("id", invitation.id);
      return { valid: false as const, reason: "This invitation has expired." };
    }

    return {
      valid: true as const,
      email: invitation.email as string,
      role: invitation.role as AdminRole,
    };
  });

// ---------------------------------------------------------------------------
// Accept invitation (public)
// ---------------------------------------------------------------------------

const acceptSchema = z.object({
  token: z.string().min(1).max(128),
  password: z.string().min(8).max(128),
});

export const acceptAdminInvitation = createServerFn({ method: "POST" })
  .validator((d) => acceptSchema.parse(d))
  .handler(async ({ data }) => {
    const db = await getDb();
    const tokenHash = hashToken(data.token);

    const { data: invitation } = await db
      .from("admin_invitations")
      .select("id,email,role,permissions,expires_at,status")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (!invitation || invitation.status !== "pending") {
      throw new Error("Invalid or already-used invitation.");
    }
    if (new Date(invitation.expires_at) < new Date()) {
      await db.from("admin_invitations").update({ status: "expired" }).eq("id", invitation.id);
      throw new Error("This invitation has expired.");
    }

    const { data: authUser, error: signUpError } = await db.auth.admin.createUser({
      email: invitation.email,
      password: data.password,
      email_confirm: true,
    });

    if (signUpError || !authUser?.user) {
      throw new Error("Could not create account. The email may already be registered.");
    }

    const { error: memberError } = await db.from("admin_members").insert({
      user_id: authUser.user.id,
      role: invitation.role,
      permissions: invitation.permissions,
      is_active: true,
    });

    if (memberError) {
      await db.auth.admin.deleteUser(authUser.user.id);
      throw new Error("Could not set up admin access.");
    }

    await db
      .from("admin_invitations")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
        accepted_by: authUser.user.id,
      })
      .eq("id", invitation.id)
      .eq("status", "pending");

    await db.from("audit_logs").insert({
      actor_id: authUser.user.id,
      action: "invitation.accept",
      resource_type: "admin_invitation",
      resource_id: invitation.id,
      details: { email: invitation.email, role: invitation.role },
    });

    return { success: true, email: invitation.email };
  });
