import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireSeller } from "@/lib/seller-auth";
import { assertAdminPermission, type AdminPermission } from "@/lib/admin-permissions";
import type { Json } from "@/integrations/supabase/types";

/**
 * Notifications (DB-first, in-app only — no email/SMS provider).
 *
 * Two halves:
 *  1. Public server functions the UI calls: list, unread count, mark read,
 *     preferences. Session + ownership are re-verified server-side; admin
 *     rows are readable only through these functions (no client RLS policy).
 *  2. Internal `emit*` helpers called from real order/product/inventory
 *     events (checkout, seller-orders, admin-catalog, seller-application,
 *     seller-products, admin-sellers). They never throw — a notification
 *     failure must never break the underlying business flow.
 */

export type NotificationScope = "customer" | "seller" | "admin";

export type Localized = { ar: string; fr: string; en: string };

export type CustomerNotificationType = "order_received" | "order_status" | "back_in_stock" | "promotion";
export type SellerNotificationType =
  | "new_order"
  | "product_approved"
  | "product_rejected"
  | "product_hidden"
  | "settlement_updated"
  | "store_status_changed"
  | "store_verification_changed"
  | "low_stock";
export type AdminNotificationType = "seller_application" | "operational_alert";

export type NotificationType = CustomerNotificationType | SellerNotificationType | AdminNotificationType;

export interface NotificationItem {
  id: string;
  type: string;
  title: Localized;
  body: Localized;
  payload: Record<string, Json | undefined>;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

/** Preference keys per scope; unknown keys are rejected. */
export const CUSTOMER_PREFERENCE_KEYS = ["order_updates", "order_status", "back_in_stock", "promotions"] as const;
export const SELLER_PREFERENCE_KEYS = ["new_order", "product_moderation", "settlements", "store_status", "low_stock"] as const;

/** Which preference key gates each notification type. Admin types are always sent. */
const TYPE_PREFERENCE_KEY: Record<string, { scope: "customer" | "seller"; key: string }> = {
  order_received: { scope: "customer", key: "order_updates" },
  order_status: { scope: "customer", key: "order_status" },
  back_in_stock: { scope: "customer", key: "back_in_stock" },
  promotion: { scope: "customer", key: "promotions" },
  new_order: { scope: "seller", key: "new_order" },
  product_approved: { scope: "seller", key: "product_moderation" },
  product_rejected: { scope: "seller", key: "product_moderation" },
  product_hidden: { scope: "seller", key: "product_moderation" },
  settlement_updated: { scope: "seller", key: "settlements" },
  store_status_changed: { scope: "seller", key: "store_status" },
  store_verification_changed: { scope: "seller", key: "store_status" },
  low_stock: { scope: "seller", key: "low_stock" },
};

const scopeInput = z.object({
  scope: z.enum(["customer", "seller", "admin"]),
});

const pageInput = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().min(1).max(30).default(15),
});

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type Recipient =
  | { kind: "customer"; userId: string }
  | { kind: "seller"; sellerId: string }
  | { kind: "admin" };

/**
 * Resolve who the caller is asking for. Never trusts client-supplied ids:
 * customer = auth user, seller = session-resolved seller (owner or active
 * staff), admin = super_admin RPC.
 */
async function resolveRecipient(
  context: any,
  scope: NotificationScope,
  adminPerm: AdminPermission = "notifications.view",
): Promise<Recipient> {
  const userId = context?.userId;
  if (typeof userId !== "string" || !userId) throw new Error("Unauthorized");
  if (scope === "admin") {
    await assertAdminPermission(context, adminPerm);
    return { kind: "admin" };
  }
  if (scope === "seller") {
    const seller = await requireSeller({ supabase: context.supabase, userId });
    return { kind: "seller", sellerId: seller.sellerId };
  }
  return { kind: "customer", userId };
}

function localizedOr(value: unknown, fallback: Localized): Localized {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const pick = (key: string) => (typeof record[key] === "string" && (record[key] as string).trim() ? (record[key] as string) : null);
    return {
      ar: pick("ar") ?? fallback.ar,
      fr: pick("fr") ?? fallback.fr,
      en: pick("en") ?? fallback.en,
    };
  }
  return fallback;
}

function toItem(row: {
  id: string;
  type: string;
  title: Json;
  body: Json;
  payload: Json;
  link: string | null;
  read_at: string | null;
  created_at: string;
}): NotificationItem {
  const fallback: Localized = { ar: "", fr: "", en: "" };
  return {
    id: row.id,
    type: row.type,
    title: localizedOr(row.title, fallback),
    body: localizedOr(row.body, fallback),
    payload: (row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? row.payload : {}) as Record<string, Json | undefined>,
    link: row.link,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

/** Build the service-role query for one recipient scope. */
function scopedQuery(sb: any, recipient: Recipient) {
  let query = sb.from("notifications");
  if (recipient.kind === "customer") {
    query = query.eq("user_id", recipient.userId).eq("is_admin", false);
  } else if (recipient.kind === "seller") {
    query = query.eq("seller_id", recipient.sellerId).eq("is_admin", false);
  } else {
    query = query.eq("is_admin", true);
  }
  return query;
}

// ---------------------------------------------------------------------------
// Public server functions
// ---------------------------------------------------------------------------

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data) => scopeInput.merge(pageInput).parse(data))
  .handler(async ({ data, context }) => {
    const recipient = await resolveRecipient(context, data.scope, "notifications.view");
    const sb = await adminClient();
    const from = (data.page - 1) * data.pageSize;
    const result = await scopedQuery(sb, recipient)
      .select("id,type,title,body,payload,link,read_at,created_at")
      .order("created_at", { ascending: false })
      .range(from, from + data.pageSize);
    if (result.error) throw new Error("Notifications could not be loaded.");
    const records = (result.data ?? []) as Parameters<typeof toItem>[0][];
    return {
      notifications: records.slice(0, data.pageSize).map(toItem),
      page: data.page,
      hasMore: records.length > data.pageSize,
    };
  });

export const unreadCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data) => scopeInput.parse(data))
  .handler(async ({ data, context }) => {
    const recipient = await resolveRecipient(context, data.scope, "notifications.view");
    const sb = await adminClient();
    const result = await scopedQuery(sb, recipient)
      .select("id", { count: "exact", head: true })
      .is("read_at", null);
    if (result.error) throw new Error("Notification count could not be loaded.");
    return { count: result.count ?? 0 };
  });

export const markRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => scopeInput.merge(z.object({ id: z.string().uuid() })).parse(data))
  .handler(async ({ data, context }) => {
    const recipient = await resolveRecipient(context, data.scope, "notifications.manage");
    const sb = await adminClient();
    const result = await scopedQuery(sb, recipient)
      .update({ read_at: new Date().toISOString() })
      .eq("id", data.id)
      .select("id")
      .maybeSingle();
    if (result.error || !result.data) throw new Error("Notification not found.");
    return { ok: true as const };
  });

export const markAllRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => scopeInput.parse(data))
  .handler(async ({ data, context }) => {
    const recipient = await resolveRecipient(context, data.scope, "notifications.manage");
    const sb = await adminClient();
    const result = await scopedQuery(sb, recipient)
      .update({ read_at: new Date().toISOString() })
      .is("read_at", null);
    if (result.error) throw new Error("Notifications could not be updated.");
    return { ok: true as const };
  });

function preferenceKeysFor(scope: "customer" | "seller"): readonly string[] {
  return scope === "customer" ? CUSTOMER_PREFERENCE_KEYS : SELLER_PREFERENCE_KEYS;
}

async function readPreferences(
  scope: "customer" | "seller",
  id: string,
): Promise<Record<string, boolean>> {
  const sb = await adminClient();
  const keys = preferenceKeysFor(scope);
  const defaults: Record<string, boolean> = Object.fromEntries(keys.map((key) => [key, true]));
  try {
    const column = scope === "customer" ? "user_id" : "seller_id";
    const result = await sb.from("notification_preferences").select("prefs").eq(column, id).maybeSingle();
    if (result.error || !result.data) return defaults;
    const stored = result.data.prefs;
    if (stored && typeof stored === "object" && !Array.isArray(stored)) {
      for (const key of keys) {
        const value = (stored as Record<string, unknown>)[key];
        if (typeof value === "boolean") defaults[key] = value;
      }
    }
  } catch {
    /* preferences are best-effort; fall back to defaults */
  }
  return defaults;
}

export const getPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ scope: z.enum(["customer", "seller"]) }).parse(data))
  .handler(async ({ data, context }) => {
    const recipient = await resolveRecipient(context, data.scope);
    const id = recipient.kind === "customer" ? recipient.userId : (recipient as { sellerId: string }).sellerId;
    return {
      scope: data.scope,
      keys: [...preferenceKeysFor(data.scope)],
      prefs: await readPreferences(data.scope, id),
    };
  });

export const updatePreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    z
      .object({
        scope: z.enum(["customer", "seller"]),
        prefs: z.record(z.string(), z.boolean()),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const recipient = await resolveRecipient(context, data.scope);
    const id = recipient.kind === "customer" ? recipient.userId : (recipient as { sellerId: string }).sellerId;
    const keys = preferenceKeysFor(data.scope);
    const clean: Record<string, boolean> = {};
    for (const key of keys) {
      if (typeof data.prefs[key] === "boolean") clean[key] = data.prefs[key];
    }
    if (Object.keys(clean).length === 0) throw new Error("No valid preferences to save.");
    const sb = await adminClient();
    const column = data.scope === "customer" ? "user_id" : "seller_id";
    const existing = await sb.from("notification_preferences").select("id").eq(column, id).maybeSingle();
    if (existing.error) throw new Error("Preferences could not be saved.");
    const merged = { ...(await readPreferences(data.scope, id)), ...clean };
    if (existing.data) {
      const updatePayload: { prefs: Record<string, boolean>; updated_at: string } = {
        prefs: merged,
        updated_at: new Date().toISOString(),
      };
      const updated = await sb
        .from("notification_preferences")
        .update(updatePayload)
        .eq("id", existing.data.id);
      if (updated.error) throw new Error("Preferences could not be saved.");
    } else {
      const insertPayload: { user_id?: string; seller_id?: string; prefs: Record<string, boolean> } =
        data.scope === "customer" ? { user_id: id, prefs: merged } : { seller_id: id, prefs: merged };
      const inserted = await sb.from("notification_preferences").insert(insertPayload);
      if (inserted.error) throw new Error("Preferences could not be saved.");
    }
    return { ok: true as const, prefs: merged };
  });

// ---------------------------------------------------------------------------
// Content templates (trilingual, built server-side so every locale is stored)
// ---------------------------------------------------------------------------

export interface NotificationParams {
  orderNumber?: string | undefined;
  total?: number | undefined;
  currency?: string | undefined;
  status?: string | undefined;
  productName?: string | undefined;
  variantLabel?: string | undefined;
  quantity?: number | undefined;
  threshold?: number | undefined;
  amount?: number | undefined;
  storeName?: string | undefined;
  applicantName?: string | undefined;
  reason?: string | undefined;
  sellerName?: string | undefined;
}

const ORDER_STATUS_LABELS: Record<string, Localized> = {
  pending: { ar: "قيد الانتظار", fr: "En attente", en: "Pending" },
  accepted: { ar: "مقبول", fr: "Acceptée", en: "Accepted" },
  confirmed: { ar: "مؤكد", fr: "Confirmée", en: "Confirmed" },
  processing: { ar: "قيد التجهيز", fr: "En préparation", en: "Processing" },
  ready_for_shipping: { ar: "جاهز للشحن", fr: "Prête pour l'expédition", en: "Ready for shipping" },
  handed_to_courier: { ar: "سُلّم لشركة التوصيل", fr: "Remise au transporteur", en: "Handed to courier" },
  in_transit: { ar: "في الطريق إليك", fr: "En transit", en: "In transit" },
  fulfilled: { ar: "مُنجز", fr: "Traitée", en: "Fulfilled" },
  delivered: { ar: "تم التوصيل", fr: "Livrée", en: "Delivered" },
  cancelled: { ar: "ملغي", fr: "Annulée", en: "Cancelled" },
  returned: { ar: "مُرجع", fr: "Retournée", en: "Returned" },
  refunded: { ar: "تم استرداد المبلغ", fr: "Remboursée", en: "Refunded" },
};

const SETTLEMENT_STATUS_LABELS: Record<string, Localized> = {
  approved: { ar: "معتمدة", fr: "Approuvée", en: "Approved" },
  paid: { ar: "مدفوعة", fr: "Payée", en: "Paid" },
  rejected: { ar: "مرفوضة", fr: "Rejetée", en: "Rejected" },
  cancelled: { ar: "ملغاة", fr: "Annulée", en: "Cancelled" },
};

function money(amount: number | undefined, currency: string | undefined): Localized {
  const value = Number.isFinite(amount) ? Number(amount) : 0;
  const code = currency || "DZD";
  const fr = `${value.toLocaleString("fr-DZ")} ${code}`;
  return { ar: `${value.toLocaleString("ar-DZ")} دج`, fr, en: `${value.toLocaleString("en-US")} ${code}` };
}

function buildContent(type: NotificationType, p: NotificationParams): { title: Localized; body: Localized } {
  const order = p.orderNumber ?? "";
  const total = money(p.total ?? p.amount, p.currency);
  switch (type) {
    case "order_received":
      return {
        title: { ar: "تم استلام طلبك", fr: "Commande reçue", en: "Order received" },
        body: {
          ar: `طلبك ${order} بقيمة ${total.ar} قيد المعالجة. سنعلمك بكل جديد.`,
          fr: `Votre commande ${order} (${total.fr}) est en cours de traitement. Nous vous tiendrons informé.`,
          en: `Your order ${order} (${total.en}) is being processed. We'll keep you posted.`,
        },
      };
    case "order_status": {
      const label = ORDER_STATUS_LABELS[p.status ?? ""] ?? { ar: p.status ?? "", fr: p.status ?? "", en: p.status ?? "" };
      return {
        title: { ar: "تحديث حالة الطلب", fr: "Mise à jour de la commande", en: "Order status update" },
        body: {
          ar: `طلبك ${order} أصبح الآن: ${label.ar}.`,
          fr: `Votre commande ${order} est maintenant : ${label.fr}.`,
          en: `Your order ${order} is now: ${label.en}.`,
        },
      };
    }
    case "back_in_stock":
      return {
        title: { ar: "عاد للتوفر", fr: "De nouveau disponible", en: "Back in stock" },
        body: {
          ar: `${p.productName ?? "المنتج"}${p.variantLabel ? ` (${p.variantLabel})` : ""} عاد للتوفر. اطلبه قبل نفاد الكمية.`,
          fr: `${p.productName ?? "Le produit"}${p.variantLabel ? ` (${p.variantLabel})` : ""} est de nouveau disponible. Commandez avant rupture.`,
          en: `${p.productName ?? "The product"}${p.variantLabel ? ` (${p.variantLabel})` : ""} is back in stock. Order before it runs out.`,
        },
      };
    case "promotion":
      return {
        title: { ar: "عرض جديد", fr: "Nouvelle offre", en: "New offer" },
        body: {
          ar: p.reason ?? "اكتشف أحدث العروض على موداليا.",
          fr: p.reason ?? "Découvrez les dernières offres sur Modalia.",
          en: p.reason ?? "Discover the latest offers on Modalia.",
        },
      };
    case "new_order":
      return {
        title: { ar: "طلب جديد", fr: "Nouvelle commande", en: "New order" },
        body: {
          ar: `طلب جديد ${order} بقيمة ${total.ar}. جهّزه للشحن في أقرب وقت.`,
          fr: `Nouvelle commande ${order} (${total.fr}). Préparez-la pour l'expédition.`,
          en: `New order ${order} (${total.en}). Prepare it for shipping.`,
        },
      };
    case "product_approved":
      return {
        title: { ar: "تم قبول منتجك", fr: "Produit approuvé", en: "Product approved" },
        body: {
          ar: `تم قبول «${p.productName ?? "منتجك"}» وهو الآن ظاهر في المتجر.`,
          fr: `« ${p.productName ?? "Votre produit"} » a été approuvé et est visible dans la boutique.`,
          en: `"${p.productName ?? "Your product"}" was approved and is now visible in the store.`,
        },
      };
    case "product_rejected":
      return {
        title: { ar: "تم رفض منتجك", fr: "Produit refusé", en: "Product rejected" },
        body: {
          ar: `تم رفض «${p.productName ?? "منتجك"}».${p.reason ? ` السبب: ${p.reason}` : " راجع معايير النشر وحاول مجددًا."}`,
          fr: `« ${p.productName ?? "Votre produit"} » a été refusé.${p.reason ? ` Motif : ${p.reason}` : " Consultez les règles de publication et réessayez."}`,
          en: `"${p.productName ?? "Your product"}" was rejected.${p.reason ? ` Reason: ${p.reason}` : " Review the publishing rules and try again."}`,
        },
      };
    case "product_hidden":
      return {
        title: { ar: "تم إخفاء منتجك", fr: "Produit masqué", en: "Product hidden" },
        body: {
          ar: `تم إخفاء «${p.productName ?? "منتجك"}» من المتجر.${p.reason ? ` السبب: ${p.reason}` : ""}`,
          fr: `« ${p.productName ?? "Votre produit"} » a été masqué de la boutique.${p.reason ? ` Motif : ${p.reason}` : ""}`,
          en: `"${p.productName ?? "Your product"}" was hidden from the store.${p.reason ? ` Reason: ${p.reason}` : ""}`,
        },
      };
    case "settlement_updated": {
      const label = SETTLEMENT_STATUS_LABELS[p.status ?? ""] ?? { ar: p.status ?? "", fr: p.status ?? "", en: p.status ?? "" };
      return {
        title: { ar: "تحديث التسوية", fr: "Mise à jour du règlement", en: "Settlement update" },
        body: {
          ar: `تسويتك بقيمة ${total.ar} أصبحت: ${label.ar}.`,
          fr: `Votre règlement de ${total.fr} est maintenant : ${label.fr}.`,
          en: `Your settlement of ${total.en} is now: ${label.en}.`,
        },
      };
    }
    case "store_status_changed":
      return {
        title: { ar: "تغيّر حالة متجرك", fr: "Statut de votre boutique", en: "Store status changed" },
        body: {
          ar: `حالة حساب البائع أصبحت: ${p.status ?? ""}.`,
          fr: `Le statut de votre compte vendeur est maintenant : ${p.status ?? ""}.`,
          en: `Your seller account status is now: ${p.status ?? ""}.`,
        },
      };
    case "store_verification_changed":
      return {
        title: { ar: "تحديث توثيق المتجر", fr: "Vérification de la boutique", en: "Store verification update" },
        body: {
          ar: `حالة توثيق متجرك أصبحت: ${p.status ?? ""}.`,
          fr: `Le statut de vérification de votre boutique est maintenant : ${p.status ?? ""}.`,
          en: `Your store verification status is now: ${p.status ?? ""}.`,
        },
      };
    case "low_stock":
      return {
        title: { ar: "مخزون منخفض", fr: "Stock faible", en: "Low stock" },
        body: {
          ar: `المخزون منخفض لـ «${p.productName ?? "منتج"}»${p.variantLabel ? ` (${p.variantLabel})` : ""}: ${p.quantity ?? 0} متبقٍ (الحد: ${p.threshold ?? 0}).`,
          fr: `Stock faible pour « ${p.productName ?? "produit"} »${p.variantLabel ? ` (${p.variantLabel})` : ""} : ${p.quantity ?? 0} restant(s) (seuil : ${p.threshold ?? 0}).`,
          en: `Low stock for "${p.productName ?? "product"}"${p.variantLabel ? ` (${p.variantLabel})` : ""}: ${p.quantity ?? 0} left (threshold: ${p.threshold ?? 0}).`,
        },
      };
    case "seller_application":
      return {
        title: { ar: "طلب بائع جديد", fr: "Nouvelle candidature vendeur", en: "New seller application" },
        body: {
          ar: `طلب جديد من ${p.applicantName ?? "متقدم"} لمتجر «${p.storeName ?? ""}». راجعه من لوحة الإدارة.`,
          fr: `Nouvelle candidature de ${p.applicantName ?? "un candidat"} pour la boutique « ${p.storeName ?? ""} ». À examiner dans l'administration.`,
          en: `New application from ${p.applicantName ?? "an applicant"} for store "${p.storeName ?? ""}". Review it in the admin panel.`,
        },
      };
    case "operational_alert":
      return {
        title: { ar: "تنبيه تشغيلي", fr: "Alerte opérationnelle", en: "Operational alert" },
        body: {
          ar: p.reason ?? "تنبيه جديد يتطلب الانتباه.",
          fr: p.reason ?? "Nouvelle alerte nécessitant votre attention.",
          en: p.reason ?? "New alert requiring attention.",
        },
      };
  }
}

// ---------------------------------------------------------------------------
// Internal emitters (called from real business events; never throw)
// ---------------------------------------------------------------------------

interface EmitInput {
  type: NotificationType;
  params?: NotificationParams;
  link?: string | null;
  payload?: Record<string, Json | undefined>;
}

async function preferenceAllows(scope: "customer" | "seller", id: string, type: string): Promise<boolean> {
  const mapping = TYPE_PREFERENCE_KEY[type];
  if (!mapping || mapping.scope !== scope) return true;
  const prefs = await readPreferences(scope, id);
  return prefs[mapping.key] !== false;
}

async function insertNotification(row: {
  user_id?: string | null;
  seller_id?: string | null;
  is_admin?: boolean;
  type: string;
  title: Localized;
  body: Localized;
  payload?: Record<string, Json | undefined> | undefined;
  link?: string | null;
}): Promise<boolean> {
  try {
    const sb = await adminClient();
    const { error } = await sb.from("notifications").insert({
      user_id: row.user_id ?? null,
      seller_id: row.seller_id ?? null,
      is_admin: row.is_admin ?? false,
      type: row.type,
      title: row.title as unknown as Json,
      body: row.body as unknown as Json,
      payload: (row.payload ?? {}) as unknown as Json,
      link: row.link ?? null,
    });
    if (error) {
      console.error("[notifications] insert failed", error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[notifications] insert failed", error instanceof Error ? error.message : error);
    return false;
  }
}

/** Notify a customer (auth user id). Respects their notification preferences. */
export async function emitCustomerNotification(
  profileId: string,
  input: EmitInput & { type: CustomerNotificationType },
): Promise<boolean> {
  try {
    if (!profileId) return false;
    if (!(await preferenceAllows("customer", profileId, input.type))) return false;
    const content = buildContent(input.type, input.params ?? {});
    return await insertNotification({
      user_id: profileId,
      type: input.type,
      title: content.title,
      body: content.body,
      payload: input.payload,
      link: input.link ?? null,
    });
  } catch (error) {
    console.error("[notifications] emitCustomerNotification failed", error instanceof Error ? error.message : error);
    return false;
  }
}

/** Notify a seller's whole team (owner + active staff see seller_id rows). */
export async function emitSellerNotification(
  sellerId: string,
  input: EmitInput & { type: SellerNotificationType },
): Promise<boolean> {
  try {
    if (!sellerId) return false;
    if (!(await preferenceAllows("seller", sellerId, input.type))) return false;
    const content = buildContent(input.type, input.params ?? {});
    return await insertNotification({
      seller_id: sellerId,
      type: input.type,
      title: content.title,
      body: content.body,
      payload: input.payload,
      link: input.link ?? null,
    });
  } catch (error) {
    console.error("[notifications] emitSellerNotification failed", error instanceof Error ? error.message : error);
    return false;
  }
}

/** Broadcast a notification to all super admins. */
export async function emitAdminNotification(input: EmitInput & { type: AdminNotificationType }): Promise<boolean> {
  try {
    const content = buildContent(input.type, input.params ?? {});
    return await insertNotification({
      is_admin: true,
      type: input.type,
      title: content.title,
      body: content.body,
      payload: input.payload,
      link: input.link ?? null,
    });
  } catch (error) {
    console.error("[notifications] emitAdminNotification failed", error instanceof Error ? error.message : error);
    return false;
  }
}
