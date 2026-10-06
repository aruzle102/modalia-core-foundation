import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { assertAdmin } from "@/lib/admin-auth";
import { storeCollectionSchema } from "@/lib/store-settings";

const adminOnly = [requireSupabaseAuth] as const;

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type StoreCollectionSummary = {
  id: string;
  title: string;
  productCount: number;
  storeId: string;
  storeName: string | null;
  storeSlug: string | null;
};

function collectionTitle(title: unknown): string {
  if (typeof title === "string") return title;
  if (title && typeof title === "object") {
    const t = title as Record<string, unknown>;
    for (const k of ["en", "fr", "ar"]) {
      if (typeof t[k] === "string" && t[k]) return t[k] as string;
    }
  }
  return "Untitled";
}

/** List curated collections across all stores (stored in stores.settings.official_collections). */
export const listAllCollections = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) => z.object({}).parse(data))
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await adminClient();
    const { data, error } = await supabaseAdmin
      .from("stores")
      .select("id, name, slug, settings")
      .order("name");
    if (error) throw new Error(error.message);

    const out: StoreCollectionSummary[] = [];
    for (const store of data ?? []) {
      const raw = (store.settings as Record<string, Json> | null)?.["official_collections"];
      const parsed = z.array(storeCollectionSchema).safeParse(raw);
      if (!parsed.success) continue;
      for (const c of parsed.data) {
        out.push({
          id: c.id,
          title: collectionTitle(c.title),
          productCount: Array.isArray(c.product_ids) ? c.product_ids.length : 0,
          storeId: store.id,
          storeName: store.name,
          storeSlug: store.slug,
        });
      }
    }
    return { collections: out };
  });
