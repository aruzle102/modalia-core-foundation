/**
 * MODALIA — B2B partnership requests.
 * Public form -> admin inbox at /admin/partnerships.
 */
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin-auth";

/** Same public-client pattern as product.functions.ts: publishable key, no session. */
function createPublicClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("The partnership form is unavailable.");
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

const partnershipSchema = z.object({
  companyName: z.string().min(2).max(200),
  contactName: z.string().min(2).max(200),
  email: z.string().email().max(254),
  phone: z.string().max(40).optional(),
  partnershipType: z.enum(["general", "supplier", "distributor", "brand", "logistics", "other"]),
  description: z.string().min(20).max(5000),
  website: z.string().max(254).optional(),
});

/** Public: submit a partnership request. */
export const submitPartnershipRequest = createServerFn({ method: "POST" })
  .validator((d) => partnershipSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    // Public function (no auth middleware): build the anon client directly —
    // context.supabase is only populated by requireSupabaseAuth middleware.
    const supabase = createPublicClient();
    const { error } = await supabase.from("partnership_requests").insert({
      company_name: data.companyName.trim(),
      contact_name: data.contactName.trim(),
      email: data.email.trim().toLowerCase(),
      phone: data.phone?.trim() || null,
      partnership_type: data.partnershipType,
      description: data.description.trim(),
      website: data.website?.trim() || null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type PartnershipRow = {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string | null;
  partnershipType: string;
  description: string;
  website: string | null;
  status: string;
  createdAt: string;
};

/** Admin: list partnership requests. */
export const listPartnershipRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth] as const)
  .validator((d) => z.object({ status: z.string().optional() }).parse(d))
  .handler(async ({ data, context }): Promise<PartnershipRow[]> => {
    await assertAdmin(context);
    const supabase = (context as any).supabase;
    let q = supabase
      .from("partnership_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({
      id: r.id,
      companyName: r.company_name,
      contactName: r.contact_name,
      email: r.email,
      phone: r.phone,
      partnershipType: r.partnership_type,
      description: r.description,
      website: r.website,
      status: r.status,
      createdAt: r.created_at,
    }));
  });

/** Admin: update partnership request status + notes. */
export const updatePartnershipStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth] as const)
  .validator((d) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["new", "contacted", "in_progress", "closed", "rejected"]),
        adminNotes: z.string().max(2000).optional(),
      })
      .parse(d)
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    await assertAdmin(context);
    const supabase = (context as any).supabase;
    const { error } = await supabase
      .from("partnership_requests")
      .update({
        status: data.status,
        admin_notes: data.adminNotes?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
