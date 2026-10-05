import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireSeller } from "@/lib/seller-auth";
import { phonePattern } from "@/lib/localization";

/* ------------------------------ Support --------------------------------- */

export const listSupportRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const seller = await requireSeller({ supabase: context.supabase, userId: context.userId });
    const { data, error } = await context.supabase
      .from("seller_support_requests")
      .select("id,subject,message,status,admin_response,responded_at,created_at")
      .eq("seller_id", seller.sellerId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return {
      isOwner: seller.isOwner,
      requests: (data ?? []).map((r: any) => ({
        id: r.id as string,
        subject: r.subject as string,
        message: r.message as string,
        status: r.status as string,
        adminResponse: (r.admin_response as string | null) ?? null,
        respondedAt: (r.responded_at as string | null) ?? null,
        createdAt: r.created_at as string,
      })),
    };
  });

export const createSupportRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        subject: z.string().min(3).max(200),
        message: z.string().min(10).max(4000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    // Any staff member of the seller may open a request; never from client-supplied seller id.
    const seller = await requireSeller({ supabase: context.supabase, userId: context.userId });
    const { data: row, error } = await context.supabase
      .from("seller_support_requests")
      .insert({ seller_id: seller.sellerId, subject: data.subject, message: data.message })
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Unable to submit request.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "seller_support.create",
      resource: "seller_support_requests",
      resource_id: row.id,
      metadata: { seller_id: seller.sellerId, subject: data.subject },
    });

    return { ok: true, id: row.id as string };
  });

/* ------------------------------ Profile --------------------------------- */

export const getSellerProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const seller = await requireSeller({ supabase: context.supabase, userId: context.userId });
    const { data, error } = await context.supabase
      .from("sellers")
      .select("id,legal_name,phone,email,account_status,commission_rate")
      .eq("id", seller.sellerId)
      .single();
    if (error || !data) throw new Error(error?.message ?? "Seller profile unavailable.");
    return {
      isOwner: seller.isOwner,
      profile: {
        id: data.id as string,
        legalName: data.legal_name as string,
        phone: (data.phone as string | null) ?? "",
        email: (data.email as string | null) ?? "",
        accountStatus: data.account_status as string,
        commissionRate: Number(data.commission_rate ?? 0),
      },
    };
  });

export const updateSellerProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        legalName: z.string().min(2).max(160),
        phone: z.string().max(30).optional(),
        email: z.string().email().max(160).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const seller = await requireSeller({ supabase: context.supabase, userId: context.userId });
    if (!seller.isOwner) throw new Error("Only the store owner can update the seller profile.");

    const phone = data.phone?.trim() || null;
    if (phone && !phonePattern().test(phone)) throw new Error("Phone number is not valid.");

    const { error } = await context.supabase
      .from("sellers")
      .update({ legal_name: data.legalName, phone, email: data.email ?? null })
      .eq("id", seller.sellerId);
    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "seller_profile.update",
      resource: "sellers",
      resource_id: seller.sellerId,
      metadata: { legal_name: data.legalName, phone, email: data.email ?? null },
    });

    return { ok: true };
  });
