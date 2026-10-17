/**
 * MODALIA — Email Center server functions.
 *
 * Sends emails via the Resend API directly (server-side only).
 * The RESEND_API_KEY never leaves the server — it lives in the
 * server environment, not in this code or the browser.
 *
 * Authorization: email.manage permission or super_admin.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getAdminIdentity, assertAdminPermission } from "./admin-permissions";
import { emailConfig, getFromAddress } from "./email.config";

const adminOnly = [requireSupabaseAuth] as const;

async function getUserId(context: unknown): Promise<string> {
  const ctx = context as { userId?: string };
  if (ctx.userId) return ctx.userId;
  throw new Error("Not authenticated.");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

async function getSupabaseAdmin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

/** Render template variables: {{variable_name}} */
export function renderTemplate(template: string, variables: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(variables)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  return out;
}

/** Send email via Resend API directly.
 *
 * Called only from authenticated server functions (admin permission already
 * verified by the caller). The RESEND_API_KEY is server-side only.
 */
async function invokeSendEmail(args: {
  to: string;
  subject: string;
  html: string;
  from?: string;
  templateId?: string;
  metadata?: Record<string, string>;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  
  const apiKey = emailConfig.resendApiKey;

  if (!apiKey) {
    return { success: false, error: "Email service not configured (RESEND_API_KEY missing)." };
  }

  const res = await fetch(emailConfig.resendApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: getFromAddress(args.from),
      to: args.to,
      subject: args.subject,
      html: args.html,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errMsg = typeof data?.message === "string" ? data.message : `HTTP ${res.status}`;
    return { success: false, error: errMsg };
  }
  return { success: true, id: data?.id };
}

// ---------------------------------------------------------------------------
// List email templates
// ---------------------------------------------------------------------------

export const listEmailTemplates = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .handler(async ({ context }) => {
    const identity = await getAdminIdentity(context);
    assertAdminPermission(identity, "email.view");

    const supabaseAdmin = await getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("email_templates")
      .select("id,slug,name,description,subject,variables,category,locale,is_active,created_at")
      .eq("is_active", true)
      .order("category")
      .order("name");

    if (error) throw new Error("Could not load email templates.");
    return { templates: data ?? [] };
  });

// ---------------------------------------------------------------------------
// Get single template (for preview/compose)
// ---------------------------------------------------------------------------

export const getEmailTemplate = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .validator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const identity = await getAdminIdentity(context);
    assertAdminPermission(identity, "email.view");

    const supabaseAdmin = await getSupabaseAdmin();
    const { data: template, error } = await supabaseAdmin
      .from("email_templates")
      .select("*")
      .eq("id", data.id)
      .single();

    if (error || !template) throw new Error("Template not found.");
    return { template };
  });

// ---------------------------------------------------------------------------
// Send email (via Resend API)
// ---------------------------------------------------------------------------

const sendEmailSchema = z.object({
  to: z.string().email().max(254),
  subject: z.string().min(1).max(200),
  html: z.string().min(1).max(500000),
  templateId: z.string().uuid().optional(),
  variables: z.record(z.string(), z.string()).optional(),
});

export const sendEmail = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .validator((d) => sendEmailSchema.parse(d))
  .handler(async ({ context, data }) => {
    const identity = await getAdminIdentity(context);
    assertAdminPermission(identity, "email.manage");

    // Rate limit: max 50 emails per admin per hour (prevent bulk abuse)
    const supabaseAdmin = await getSupabaseAdmin();
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const { count } = await supabaseAdmin
      .from("email_logs")
      .select("id", { count: "exact", head: true })
      .eq("sent_by", await getUserId(context))
      .gte("created_at", oneHourAgo);

    if ((count ?? 0) >= 50) {
      throw new Error("Rate limit exceeded: max 50 emails per hour.");
    }

    // Render template variables if provided
    let html = data.html;
    if (data.variables) {
      html = renderTemplate(html, data.variables);
    }

    const result = await invokeSendEmail({
      to: data.to,
      subject: data.subject,
      html,
      ...(data.templateId ? { templateId: data.templateId } : {}),
      ...(data.variables ? { metadata: data.variables } : {}),
    });

    // Log all sends (success and failure) for rate limiting and history
    await supabaseAdmin.from("email_logs").insert({
      to_email: data.to,
      from_email: emailConfig.defaultFrom,
      subject: data.subject,
      template_id: data.templateId ?? null,
      status: result.success ? "sent" : "failed",
      error_message: result.success ? null : result.error,
      sent_by: await getUserId(context),
    });

    if (!result.success) {
      throw new Error(result.error ?? "Email delivery failed.");
    }

    return { success: true, resendId: result.id };
  });

// ---------------------------------------------------------------------------
// Email history (searchable)
// ---------------------------------------------------------------------------

const historySchema = z.object({
  query: z.string().max(100).optional(),
  status: z.string().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
});

export const listEmailHistory = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .validator((d) => historySchema.parse(d))
  .handler(async ({ context, data }) => {
    const identity = await getAdminIdentity(context);
    assertAdminPermission(identity, "email.view");

    const supabaseAdmin = await getSupabaseAdmin();
    let query = supabaseAdmin
      .from("email_logs")
      .select("id,to_email,from_email,subject,status,resend_id,error_message,created_at", { count: "exact" })
      .order("created_at", { ascending: false });

    if (data.query) {
      query = query.or(`to_email.ilike.%${data.query}%,subject.ilike.%${data.query}%`);
    }
    if (data.status) {
      query = query.eq("status", data.status);
    }

    const from = (data.page - 1) * data.pageSize;
    query = query.range(from, from + data.pageSize - 1);

    const { data: logs, error, count } = await query;
    if (error) throw new Error("Could not load email history.");

    return {
      logs: logs ?? [],
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
    };
  });
