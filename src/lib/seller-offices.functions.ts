import { createServerFn } from "@tanstack/react-start";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireSeller, type SellerPermission } from "@/lib/seller-auth";
import type { Database, Json } from "@/integrations/supabase/types";

/** Local TS interface — types.ts is generated; sync regenerates it for seller_offices. */
export interface SellerOffice {
  id: string;
  seller_id: string;
  name: string;
  wilaya_id: string;
  commune_id: string | null;
  address: string | null;
  phone: string | null;
  opening_hours: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  wilayas: { id: string; code: string; name: Json } | null;
  communes: { id: string; code: string; name: Json } | null;
}

/** Public shape for checkout (Sec 29–32): no internal ids beyond what checkout needs. */
export interface SellerOfficePublic {
  id: string;
  name: string;
  commune_id: string | null;
  address: string | null;
  phone: string | null;
  opening_hours: string | null;
}

// ---------------------------------------------------------------------------
// V8 tables typing.
//
// seller_offices / seller_shipping_settings are added by migration
// 20261006170000_seller_offices_v8.sql. types.ts is GENERATED (never
// hand-edited) and regenerates on sync; until then these local table types
// keep every query fully typed. Exported so the shipping-settings fns in
// seller-marketing.functions.ts can share them.
// ---------------------------------------------------------------------------

interface SellerOfficesTable {
  Row: {
    id: string;
    seller_id: string;
    name: string;
    wilaya_id: string;
    commune_id: string | null;
    address: string | null;
    phone: string | null;
    opening_hours: string | null;
    active: boolean;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id?: string;
    seller_id: string;
    name: string;
    wilaya_id: string;
    commune_id?: string | null;
    address?: string | null;
    phone?: string | null;
    opening_hours?: string | null;
    active?: boolean;
    created_at?: string;
    updated_at?: string;
  };
  Update: {
    id?: string;
    seller_id?: string;
    name?: string;
    wilaya_id?: string;
    commune_id?: string | null;
    address?: string | null;
    phone?: string | null;
    opening_hours?: string | null;
    active?: boolean;
    created_at?: string;
    updated_at?: string;
  };
  Relationships: [];
}

interface SellerShippingSettingsTable {
  Row: { seller_id: string; office_enabled: boolean; created_at: string; updated_at: string };
  Insert: { seller_id: string; office_enabled?: boolean; created_at?: string; updated_at?: string };
  Update: { seller_id?: string; office_enabled?: boolean; created_at?: string; updated_at?: string };
  Relationships: [];
}

export type DatabaseV8 = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables"> & {
    Tables: Database["public"]["Tables"] & {
      seller_offices: SellerOfficesTable;
      seller_shipping_settings: SellerShippingSettingsTable;
    };
  };
};

/** Service-role client typed for the V8 tables (bypasses RLS; scope by sellerId). */
export async function v8Admin(): Promise<SupabaseClient<DatabaseV8>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient<DatabaseV8>;
}

/** Public (anon-key) client typed for the V8 tables. */
export function v8Public(): SupabaseClient<DatabaseV8> {
  // Prefer server env; fall back to VITE_ vars (some hosts only inject those).
  const url = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("The marketplace catalogue is unavailable.");
  return createClient<DatabaseV8>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Seller delivery offices (MODALIA V8, Section 28).
 *
 * The seller's pickup points for "office" (desk-pickup) delivery. Seller-side
 * CRUD requires the session to resolve to the seller's owner (or a staff
 * member with the "store.manage" permission — reads/writes use the
 * service-role client because RLS only covers owner accounts, mirroring
 * shipping_rules); every read/write is scoped to `seller.sellerId`
 * (anti-IDOR). All seller-authored text is stored as PLAIN TEXT.
 *
 * `getSellerOffices` is intentionally public (no seller session): it powers
 * the checkout office picker (Sections 29–32). It returns only active
 * offices via the public RLS SELECT policy.
 *
 * Delete policy: HARD delete. No orders table holds an office FK — the
 * checkout RPC snapshots the delivery address into order rows, so removing
 * an office never orphans an order. Deactivate (active=false) is the
 * non-destructive alternative offered in the UI.
 */

const sellerOnly = [requireSupabaseAuth] as const;

type ResolvedSeller = Awaited<ReturnType<typeof requireSeller>>;

async function sellerSession(
  context: { supabase: unknown; userId: string },
  ...permissions: SellerPermission[]
): Promise<ResolvedSeller> {
  return requireSeller({ supabase: context.supabase as never, userId: context.userId }, ...permissions);
}

async function adminClient() {
  return v8Admin();
}

function publicClient() {
  return v8Public();
}

async function auditLog(
  actorId: string | null,
  action: string,
  resource: string,
  resourceId: string | null,
  metadata: Record<string, Json> = {},
) {
  try {
    const db = await adminClient();
    await db.from("audit_logs").insert({
      actor_id: actorId,
      action,
      resource,
      resource_id: resourceId,
      metadata,
    });
  } catch {
    // Audit logging must never block the underlying mutation.
  }
}

const id = z.string().uuid();

const OFFICE_COLUMNS =
  "id,seller_id,name,wilaya_id,commune_id,address,phone,opening_hours,active,created_at,updated_at,wilayas(id,code,name),communes(id,code,name)";

const phoneSchema = z
  .string()
  .trim()
  .min(6, "Phone number looks too short.")
  .max(24, "Phone number looks too long.")
  .regex(/^[+0-9][0-9\s\-/]*$/, "Phone number may only contain digits, spaces, + and -.");

const officeInput = z.object({
  name: z.string().trim().min(2, "Name needs at least 2 characters.").max(120),
  wilaya_id: id,
  commune_id: id.nullable().optional(),
  address: z.string().trim().max(500).optional().transform((v) => (v && v.length > 0 ? v : null)),
  phone: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null))
    .pipe(phoneSchema.nullable()),
  opening_hours: z.string().trim().max(300).optional().transform((v) => (v && v.length > 0 ? v : null)),
  active: z.boolean().default(true),
});

async function assertDestination(db: SupabaseClient<DatabaseV8>, wilayaId: string, communeId: string | null) {
  const { data: wilaya } = await db
    .from("wilayas")
    .select("id")
    .eq("id", wilayaId)
    .eq("active", true)
    .maybeSingle();
  if (!wilaya) throw new Error("Wilaya not found.");
  if (communeId) {
    const { data: commune } = await db
      .from("communes")
      .select("id,wilaya_id")
      .eq("id", communeId)
      .eq("active", true)
      .maybeSingle();
    if (!commune) throw new Error("Commune not found.");
    if (commune.wilaya_id !== wilayaId) throw new Error("Commune does not belong to the selected wilaya.");
  }
}

/** All offices of the current seller (permission: store.manage). */
export const listSellerOffices = createServerFn({ method: "GET" })
  .middleware(sellerOnly)
  .handler(async ({ context }) => {
    const seller = await sellerSession(context, "store.manage");
    const db = await adminClient();
    const { data: rows, error } = await db
      .from("seller_offices")
      .select(OFFICE_COLUMNS)
      .eq("seller_id", seller.sellerId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { offices: (rows ?? []) as unknown as SellerOffice[] };
  });

/** Create an office for the current seller (permission: store.manage). */
export const createSellerOffice = createServerFn({ method: "POST" })
  .middleware(sellerOnly)
  .inputValidator((data) => officeInput.parse(data))
  .handler(async ({ data, context }) => {
    const seller = await sellerSession(context, "store.manage");
    const db = await adminClient();
    await assertDestination(db, data.wilaya_id, data.commune_id ?? null);
    const { data: created, error } = await db
      .from("seller_offices")
      .insert({
        seller_id: seller.sellerId,
        name: data.name,
        wilaya_id: data.wilaya_id,
        commune_id: data.commune_id ?? null,
        address: data.address ?? null,
        phone: data.phone ?? null,
        opening_hours: data.opening_hours ?? null,
        active: data.active,
      })
      .select("id")
      .single();
    if (error || !created) throw new Error(error?.message ?? "Could not create the office.");
    await auditLog(context.userId ?? null, "seller_office_created", "seller_office", created.id, {
      name: data.name,
      wilaya_id: data.wilaya_id,
    });
    return { id: created.id as string };
  });

/** Update an office of the current seller (permission: store.manage). */
const officePatchInput = z.object({
  id,
  name: z.string().trim().min(2, "Name needs at least 2 characters.").max(120).optional(),
  wilaya_id: id.optional(),
  commune_id: id.nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  phone: z
    .string()
    .trim()
    .max(24)
    .nullable()
    .optional()
    .refine((v) => v == null || v.length === 0 || phoneSchema.safeParse(v).success, {
      message: "Phone number may only contain digits, spaces, + and -.",
    }),
  opening_hours: z.string().trim().max(300).nullable().optional(),
  active: z.boolean().optional(),
});

export const updateSellerOffice = createServerFn({ method: "POST" })
  .middleware(sellerOnly)
  .inputValidator((data) => officePatchInput.parse(data))
  .handler(async ({ data, context }) => {
    const seller = await sellerSession(context, "store.manage");
    const db = await adminClient();
    const { data: existing } = await db
      .from("seller_offices")
      .select("id,wilaya_id,commune_id")
      .eq("id", data.id)
      .eq("seller_id", seller.sellerId)
      .maybeSingle();
    if (!existing) throw new Error("Office not found.");
    const wilayaId = data.wilaya_id ?? existing.wilaya_id;
    const communeId = data.commune_id !== undefined ? data.commune_id : existing.commune_id;
    await assertDestination(db, wilayaId, communeId ?? null);
    type OfficeUpdate = DatabaseV8["public"]["Tables"]["seller_offices"]["Update"];
    const patch: OfficeUpdate = { updated_at: new Date().toISOString() };
    if (data.name !== undefined) patch.name = data.name;
    if (data.wilaya_id !== undefined) patch.wilaya_id = data.wilaya_id;
    if (data.commune_id !== undefined) patch.commune_id = data.commune_id;
    // Empty string clears a nullable text field; undefined leaves it untouched.
    if (data.address !== undefined) patch.address = data.address && data.address.length > 0 ? data.address : null;
    if (data.phone !== undefined) patch.phone = data.phone && data.phone.length > 0 ? data.phone : null;
    if (data.opening_hours !== undefined)
      patch.opening_hours = data.opening_hours && data.opening_hours.length > 0 ? data.opening_hours : null;
    if (data.active !== undefined) patch.active = data.active;
    const { error } = await db.from("seller_offices").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    await auditLog(
      context.userId ?? null,
      data.active === false ? "seller_office_deactivated" : "seller_office_updated",
      "seller_office",
      data.id,
      {},
    );
    return { ok: true as const };
  });

/**
 * Hard-delete an office of the current seller (permission: store.manage).
 * Safe: no orders table references seller_offices (checkout snapshots the
 * address). Prefer deactivating (active=false) when the office may come back.
 */
export const deleteSellerOffice = createServerFn({ method: "POST" })
  .middleware(sellerOnly)
  .inputValidator((data) => z.object({ id }).parse(data))
  .handler(async ({ data, context }) => {
    const seller = await sellerSession(context, "store.manage");
    const db = await adminClient();
    const { data: existing } = await db
      .from("seller_offices")
      .select("id,name")
      .eq("id", data.id)
      .eq("seller_id", seller.sellerId)
      .maybeSingle();
    if (!existing) throw new Error("Office not found.");
    const { error } = await db.from("seller_offices").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await auditLog(context.userId ?? null, "seller_office_deleted", "seller_office", data.id, {
      name: existing.name,
    });
    return { ok: true as const };
  });

/**
 * PUBLIC — active offices of a seller in one wilaya.
 * Consumed by checkout (Sec 29–32) via the public RLS SELECT policy
 * (active = true). Signature is stable: do not change without coordinating
 * with the checkout track.
 *
 * @param sellerId - the seller's id (uuid)
 * @param wilayaId - the customer's wilaya id (uuid)
 * @returns { offices: SellerOfficePublic[] } — active offices only
 */
export const getSellerOffices = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ sellerId: id, wilayaId: id }).parse(data))
  .handler(async ({ data }) => {
    const db = publicClient();
    const { data: rows, error } = await db
      .from("seller_offices")
      .select("id,name,commune_id,address,phone,opening_hours")
      .eq("seller_id", data.sellerId)
      .eq("wilaya_id", data.wilayaId)
      .eq("active", true)
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return { offices: (rows ?? []) as SellerOfficePublic[] };
  });
