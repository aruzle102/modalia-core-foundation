/**
 * MODALIA — Partner banners (rotating ads).
 * Public read of active banners; admin CRUD at /admin/banners.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin-auth";

export type PartnerBanner = {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl: string;
  sortOrder: number;
  isActive: boolean;
};

/** Public: list active partner banners for the homepage carousel. */
export const getActivePartnerBanners = createServerFn({ method: "GET" }).handler(
  async (): Promise<PartnerBanner[]> => {
    // Use public client (anon key) — RLS policy partner_banners_public_read allows it
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) throw new Error("Service unavailable");
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase
      .from("partner_banners")
      .select("id, title, image_url, link_url, sort_order, is_active")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .limit(10);
    if (error) throw new Error(error.message);
    return (data ?? []).map((b: any) => ({
      id: b.id,
      title: b.title,
      imageUrl: b.image_url,
      linkUrl: b.link_url,
      sortOrder: b.sort_order,
      isActive: b.is_active,
    }));
  }
);

/** Admin: list all banners. */
export const listPartnerBanners = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth] as const)
  .handler(async ({ context }): Promise<PartnerBanner[]> => {
    await assertAdmin(context);
    const supabase = (context as any).supabase;
    const { data, error } = await supabase
      .from("partner_banners")
      .select("id, title, image_url, link_url, sort_order, is_active")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((b: any) => ({
      id: b.id,
      title: b.title,
      imageUrl: b.image_url,
      linkUrl: b.link_url,
      sortOrder: b.sort_order,
      isActive: b.is_active,
    }));
  });

const bannerInput = z.object({
  title: z.string().min(1).max(200),
  imageUrl: z.string().url().max(2000),
  linkUrl: z.string().max(2000),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

/** Admin: create a banner. */
export const createPartnerBanner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth] as const)
  .validator((d) => bannerInput.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    await assertAdmin(context);
    const supabase = (context as any).supabase;
    const { error } = await supabase.from("partner_banners").insert({
      title: data.title.trim(),
      image_url: data.imageUrl,
      link_url: data.linkUrl,
      sort_order: data.sortOrder,
      is_active: data.isActive,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Admin: update a banner. */
export const updatePartnerBanner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth] as const)
  .validator((d) => bannerInput.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    await assertAdmin(context);
    const supabase = (context as any).supabase;
    const { error } = await supabase
      .from("partner_banners")
      .update({
        title: data.title.trim(),
        image_url: data.imageUrl,
        link_url: data.linkUrl,
        sort_order: data.sortOrder,
        is_active: data.isActive,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Admin: delete a banner. */
export const deletePartnerBanner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth] as const)
  .validator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    await assertAdmin(context);
    const supabase = (context as any).supabase;
    const { error } = await supabase.from("partner_banners").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
