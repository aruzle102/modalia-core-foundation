/**
 * MODALIA — Problem reports.
 * Public form (with image attachments) -> admin inbox at /admin/reports.
 */
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin-auth";
import { rateLimitEndpoint } from "@/lib/rate-limit";

/** Same public-client pattern as product.functions.ts: publishable key, no session. */
function createPublicClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("The problem report form is unavailable.");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

const reportSchema = z.object({
  reporterName: z.string().max(200).optional(),
  reporterEmail: z.string().email().max(254).optional(),
  reporterPhone: z.string().max(40).optional(),
  category: z.enum(["order", "product", "store", "payment", "account", "technical", "other"]),
  subject: z.string().min(3).max(200),
  description: z.string().min(20).max(5000),
  imageUrls: z.array(z.string().url().max(2000)).max(5).default([]),
  orderId: z.string().uuid().optional(),
});

const REPORT_BUCKET = "problem-reports";

/** Public: get a signed upload URL for a report image. */
export const getReportUploadUrl = createServerFn({ method: "POST" })
  .validator((d) =>
    z
      .object({
        contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
      })
      .parse(d)
  )
  .handler(async ({ data, context }): Promise<{ path: string; signedUrl: string; token: string }> => {
    // Public endpoint that mints service-role storage URLs: rate-limit first so
    // a single client cannot churn signed upload URLs. Generous (10/min per IP)
    // so legitimate multi-photo reports never break.
    rateLimitEndpoint("getReportUploadUrl", 10, 60_000);
    const url = process.env["SUPABASE_URL"]!;
    const key = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
    const supabaseAdmin = createClient(url, key);
    const extension = data.contentType === "image/png" ? "png" : data.contentType === "image/webp" ? "webp" : "jpg";
    const path = `reports/${crypto.randomUUID()}.${extension}`;
    const signed = await supabaseAdmin.storage.from(REPORT_BUCKET).createSignedUploadUrl(path);
    if (signed.error || !signed.data) throw new Error("The photo could not be prepared.");
    return { path, signedUrl: signed.data.signedUrl, token: signed.data.token };
  });

/** Public: submit a problem report. */
export const submitProblemReport = createServerFn({ method: "POST" })
  .validator((d) => reportSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    // Public function (no auth middleware): build the anon client directly —
    // context.supabase is only populated by requireSupabaseAuth middleware.
    const supabase = createPublicClient();
    const { error } = await supabase.from("problem_reports").insert({
      reporter_name: data.reporterName?.trim() || null,
      reporter_email: data.reporterEmail?.trim().toLowerCase() || null,
      reporter_phone: data.reporterPhone?.trim() || null,
      category: data.category,
      subject: data.subject.trim(),
      description: data.description.trim(),
      image_urls: data.imageUrls,
      order_id: data.orderId ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type ProblemReportRow = {
  id: string;
  reporterName: string | null;
  reporterEmail: string | null;
  reporterPhone: string | null;
  category: string;
  subject: string;
  description: string;
  imageUrls: string[];
  status: string;
  createdAt: string;
};

/** Admin: list problem reports. */
export const listProblemReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth] as const)
  .validator((d) => z.object({ status: z.string().optional() }).parse(d))
  .handler(async ({ data, context }): Promise<ProblemReportRow[]> => {
    await assertAdmin(context);
    const supabase = (context as any).supabase;
    let q = supabase
      .from("problem_reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({
      id: r.id,
      reporterName: r.reporter_name,
      reporterEmail: r.reporter_email,
      reporterPhone: r.reporter_phone,
      category: r.category,
      subject: r.subject,
      description: r.description,
      imageUrls: r.image_urls ?? [],
      status: r.status,
      createdAt: r.created_at,
    }));
  });

/** Admin: update report status + notes. */
export const updateProblemReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth] as const)
  .validator((d) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["new", "in_review", "resolved", "closed"]),
        adminNotes: z.string().max(2000).optional(),
      })
      .parse(d)
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    await assertAdmin(context);
    const supabase = (context as any).supabase;
    const { error } = await supabase
      .from("problem_reports")
      .update({
        status: data.status,
        admin_notes: data.adminNotes?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
