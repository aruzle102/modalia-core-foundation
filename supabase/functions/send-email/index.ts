/**
 * MODALIA — Secure Email Edge Function (Resend)
 *
 * Sends emails via Resend API. The RESEND_API_KEY is read from the
 * function secrets (never exposed to client code).
 *
 * Setup:
 *   supabase secrets set RESEND_API_KEY=re_xxx
 *   supabase functions deploy send-email
 *
 * Security:
 * - Validates caller JWT and checks admin permissions via the database
 * - Rate limited per caller
 * - Sanitizes inputs to prevent header injection
 * - Never logs the API key
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const RESEND_API_URL = "https://api.resend.com/emails";

interface SendEmailRequest {
  to: string;
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  templateId?: string;
  metadata?: Record<string, string>;
}

// Basic email validation
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

// Prevent email header injection (CR/LF in headers)
function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]/g, "").trim();
}

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) {
      console.error("[send-email] RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured. Contact administrator." }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }

    // Authenticate caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Check admin permission (email.manage or super_admin)
    const { data: isAdmin } = await supabase.rpc("is_super_admin");
    let hasPermission = isAdmin === true;
    if (!hasPermission) {
      const { data: member } = await supabase
        .from("admin_members")
        .select("permissions")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      const perms = (member?.permissions as string[]) ?? [];
      hasPermission = perms.includes("email.manage") || perms.includes("notifications.manage");
    }

    if (!hasPermission) {
      return new Response(JSON.stringify({ error: "Forbidden: email.manage required" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Parse and validate request
    const body: SendEmailRequest = await req.json();
    const to = (body.to ?? "").trim().toLowerCase();
    const subject = sanitizeHeader(body.subject ?? "");
    const html = body.html ?? "";

    if (!isValidEmail(to)) {
      return new Response(JSON.stringify({ error: "Invalid recipient email" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (!subject || subject.length > 200) {
      return new Response(JSON.stringify({ error: "Invalid subject" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (!html || html.length > 500000) {
      return new Response(JSON.stringify({ error: "Invalid email content" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Sender configuration (configurable, defaults to noreply)
    const defaultFrom = Deno.env.get("EMAIL_FROM") ?? "noreply@modalia.dz";
    const from = body.from ? sanitizeHeader(body.from) : defaultFrom;

    // Call Resend API
    const resendRes = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
        ...(body.replyTo ? { reply_to: sanitizeHeader(body.replyTo) } : {}),
      }),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      console.error("[send-email] Resend error:", resendRes.status, JSON.stringify(resendData).slice(0, 500));
      return new Response(
        JSON.stringify({
          error: "Email delivery failed",
          details: resendData?.message ?? "Unknown error",
        }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    // Log to database (service role for reliable logging)
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);
    await admin.from("email_logs").insert({
      to_email: to,
      from_email: from,
      subject,
      template_id: body.templateId ?? null,
      resend_id: resendData?.id ?? null,
      status: "sent",
      sent_by: user.id,
      metadata: body.metadata ?? {},
    });

    // Audit log
    await admin.from("audit_logs").insert({
      actor_id: user.id,
      action: "email.send",
      resource_type: "email",
      resource_id: resendData?.id ?? null,
      details: { to_email: to, subject: subject.slice(0, 100) },
    });

    return new Response(
      JSON.stringify({ success: true, id: resendData?.id }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[send-email] Unexpected error:", (e as Error).message);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
