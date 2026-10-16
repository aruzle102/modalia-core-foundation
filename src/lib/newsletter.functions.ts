/**
 * MODALIA — Newsletter Campaign Management
 *
 * Super-admin + email.manage only. Campaigns send via Resend Edge Function
 * with batching, rate limiting, and duplicate prevention.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getAdminIdentity, assertAdminPermission } from "./admin-permissions";
import { buildNewsletterHtml } from "./newsletter-template";

/* eslint-disable @typescript-eslint/no-explicit-any */

const adminOnly = [requireSupabaseAuth] as const;

async function getDb(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function getUserId(context: unknown): Promise<string> {
  const ctx = context as { userId?: string };
  if (ctx.userId) return ctx.userId;
  throw new Error("Not authenticated.");
}

// ---------------------------------------------------------------------------
// List subscribers
// ---------------------------------------------------------------------------

const listSubscribersSchema = z.object({
  query: z.string().max(100).optional(),
  status: z.string().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
});

export const listNewsletterSubscribers = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .validator((d) => listSubscribersSchema.parse(d))
  .handler(async ({ context, data }) => {
    const identity = await getAdminIdentity(context);
    assertAdminPermission(identity, "email.view");
    const db = await getDb();

    let query = db
      .from("newsletter_subscribers")
      .select("id,email,locale,status,subscribed_at,consent_at,unsubscribed_at,source", { count: "exact" })
      .order("subscribed_at", { ascending: false });

    if (data.query) query = query.ilike("email", `%${data.query}%`);
    if (data.status) query = query.eq("status", data.status);

    const from = (data.page - 1) * data.pageSize;
    const { data: subs, error, count } = await query.range(from, from + data.pageSize - 1);
    if (error) throw new Error("Could not load subscribers.");

    return { subscribers: subs ?? [], total: count ?? 0, page: data.page, pageSize: data.pageSize };
  });

// ---------------------------------------------------------------------------
// Campaign CRUD
// ---------------------------------------------------------------------------

const campaignSchema = z.object({
  name: z.string().min(1).max(200),
  subject: z.string().min(1).max(200),
  previewText: z.string().max(300).optional(),
  htmlContent: z.string().min(1).max(500000),
  locale: z.enum(["ar", "fr", "en"]),
});

export const createNewsletterCampaign = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .validator((d) => campaignSchema.parse(d))
  .handler(async ({ context, data }) => {
    const identity = await getAdminIdentity(context);
    assertAdminPermission(identity, "email.manage");
    const db = await getDb();
    const userId = await getUserId(context);

    const { data: campaign, error } = await db
      .from("newsletter_campaigns")
      .insert({
        name: data.name,
        subject: data.subject,
        preview_text: data.previewText ?? null,
        html_content: data.htmlContent,
        locale: data.locale,
        status: "draft",
        created_by: userId,
      })
      .select("id")
      .single();

    if (error || !campaign) throw new Error("Could not create campaign.");
    return { id: campaign.id };
  });

export const listNewsletterCampaigns = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .handler(async ({ context }) => {
    const identity = await getAdminIdentity(context);
    assertAdminPermission(identity, "email.view");
    const db = await getDb();

    const { data, error } = await db
      .from("newsletter_campaigns")
      .select("id,name,subject,locale,status,recipient_count,sent_count,failed_count,created_at,sent_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw new Error("Could not load campaigns.");
    return { campaigns: data ?? [] };
  });

export const getNewsletterCampaign = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .validator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const identity = await getAdminIdentity(context);
    assertAdminPermission(identity, "email.view");
    const db = await getDb();

    const { data: campaign, error } = await db
      .from("newsletter_campaigns")
      .select("*")
      .eq("id", data.id)
      .single();

    if (error || !campaign) throw new Error("Campaign not found.");
    return { campaign };
  });

// ---------------------------------------------------------------------------
// Send test email
// ---------------------------------------------------------------------------

export const sendNewsletterTest = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .validator((d) => z.object({ id: z.string().uuid(), to: z.string().email() }).parse(d))
  .handler(async ({ context, data }) => {
    const identity = await getAdminIdentity(context);
    assertAdminPermission(identity, "email.manage");
    const db = await getDb();

    const { data: campaign } = await db
      .from("newsletter_campaigns")
      .select("*")
      .eq("id", data.id)
      .single();

    if (!campaign) throw new Error("Campaign not found.");

    const siteUrl = process.env["SITE_URL"] ?? "https://modalia-core-foundation.lovable.app";
    const logoUrl = `${siteUrl}/brand/modalia-logo.png`;

    const html = buildNewsletterHtml({
      title: campaign.name,
      previewText: campaign.preview_text,
      contentHtml: campaign.html_content,
      locale: campaign.locale,
      unsubscribeUrl: `${siteUrl}/unsubscribe?token=TEST`,
      siteUrl,
      logoUrl,
    });

    // Call Edge Function
    const supabaseUrl = process.env["SUPABASE_URL"];
    const anonKey = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
    if (!supabaseUrl || !anonKey) throw new Error("Email service not configured.");

    const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anonKey },
      body: JSON.stringify({
        to: data.to,
        subject: `[TEST] ${campaign.subject}`,
        html,
        metadata: { campaign_id: data.id, test: "true" },
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error ?? "Test email failed.");
    }

    return { success: true };
  });

// ---------------------------------------------------------------------------
// Send campaign (batched)
// ---------------------------------------------------------------------------

export const sendNewsletterCampaign = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .validator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const identity = await getAdminIdentity(context);
    assertAdminPermission(identity, "email.manage");
    const db = await getDb();
    const userId = await getUserId(context);

    const { data: campaign } = await db
      .from("newsletter_campaigns")
      .select("*")
      .eq("id", data.id)
      .single();

    if (!campaign) throw new Error("Campaign not found.");
    if (campaign.status !== "draft") throw new Error("Campaign already sent or in progress.");

    // Get eligible subscribers (active + consented only)
    const { data: subscribers, error: subError } = await db
      .from("newsletter_subscribers")
      .select("id,email,locale,unsubscribe_token")
      .eq("status", "active")
      .not("consent_at", "is", null);

    if (subError) throw new Error("Could not load subscribers.");
    if (!subscribers?.length) throw new Error("No eligible subscribers.");

    // Mark as sending
    await db.from("newsletter_campaigns").update({ status: "sending" }).eq("id", data.id);

    const siteUrl = process.env["SITE_URL"] ?? "https://modalia-core-foundation.lovable.app";
    const logoUrl = `${siteUrl}/brand/modalia-logo.png`;
    const supabaseUrl = process.env["SUPABASE_URL"];
    const anonKey = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];

    if (!supabaseUrl || !anonKey) throw new Error("Email service not configured.");

    let sent = 0;
    let failed = 0;

    // Batch: 10 at a time to respect rate limits
    const BATCH_SIZE = 10;
    for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
      const batch = subscribers.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (sub: any) => {
          // Duplicate prevention
          const { data: existing } = await db
            .from("newsletter_sends")
            .select("id")
            .eq("campaign_id", data.id)
            .eq("subscriber_id", sub.id)
            .maybeSingle();
          if (existing) return;

          const unsubscribeUrl = `${siteUrl}/unsubscribe?token=${sub.unsubscribe_token}`;
          const html = buildNewsletterHtml({
            title: campaign.name,
            previewText: campaign.preview_text,
            contentHtml: campaign.html_content,
            locale: campaign.locale,
            unsubscribeUrl,
            siteUrl,
            logoUrl,
          });

          try {
            const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: anonKey },
              body: JSON.stringify({
                to: sub.email,
                subject: campaign.subject,
                html,
                metadata: { campaign_id: data.id },
              }),
            });
            const result = await res.json().catch(() => ({}));

            await db.from("newsletter_sends").insert({
              campaign_id: data.id,
              subscriber_id: sub.id,
              email: sub.email,
              resend_id: result?.id ?? null,
              status: res.ok ? "sent" : "failed",
              error_message: res.ok ? null : result?.error,
              sent_at: res.ok ? new Date().toISOString() : null,
            });

            if (res.ok) sent++;
            else failed++;
          } catch {
            await db.from("newsletter_sends").insert({
              campaign_id: data.id,
              subscriber_id: sub.id,
              email: sub.email,
              status: "failed",
              error_message: "Network error",
            });
            failed++;
          }
        })
      );
      // Small delay between batches
      if (i + BATCH_SIZE < subscribers.length) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    await db
      .from("newsletter_campaigns")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        recipient_count: subscribers.length,
        sent_count: sent,
        failed_count: failed,
      })
      .eq("id", data.id);

    await db.from("audit_logs").insert({
      actor_id: userId,
      action: "newsletter.send",
      resource_type: "newsletter_campaign",
      resource_id: data.id,
      details: { sent, failed, total: subscribers.length },
    });

    return { success: true, sent, failed, total: subscribers.length };
  });
