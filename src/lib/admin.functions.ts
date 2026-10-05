import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const adminOnly = [requireSupabaseAuth] as const;
async function assertAdmin(context: any){if (!context) throw new Error("Unauthorized"); const {data,error}=await context.supabase.rpc("is_super_admin");if(error||data!==true)throw new Error("Forbidden");}

export type TableDiagnostic = { table: string; ok: boolean; message?: string };

/**
 * Runs one dashboard query and records a diagnostic entry for it instead of
 * letting a single failing table take down the whole dashboard.
 * The query is typed as `any` on purpose: Supabase query builders are
 * thenables with deeply generic types that add nothing here; the returned
 * rows are cast to the declared row shape T.
 */
async function fetchTable<T>(table: string, diagnostics: TableDiagnostic[], query: any): Promise<T[]> {
  try {
    const { data, error } = await query;
    if (error) {
      const message = (error as { message?: string } | null)?.message ?? "Query failed";
      diagnostics.push({ table, ok: false, message });
      return [];
    }
    diagnostics.push({ table, ok: true });
    return (data ?? []) as T[];
  } catch (err) {
    diagnostics.push({
      table,
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

type SellerRow = { id: string; legal_name: string; account_status: string; commission_rate: number; created_at: string };
type ApplicationRow = { id: string; first_name: string; last_name: string; email: string; proposed_store_name: string; status: string; created_at: string };
type ProductRow = { id: string; slug: string; name: Record<string, string> | null; base_price: number; status: string; publication_status: string; moderation_status: string; seller_id: string; created_at: string };
type OrderRow = { id: string; order_number: string; grand_total: number | string | null; status: string; created_at: string; first_name: string; last_name: string };
type ReviewRow = { id: string; product_id: string; rating: number; body: string; moderation_status: string; created_at: string };
type SettlementRow = { id: string; seller_id: string; amount: number; status: string; created_at: string; payment_reference: string | null };
type HomepageSectionRow = { id: string; section_key: string; kind: string; title: string | null; enabled: boolean; sort_order: number };

const TABLE_ORDER = ["sellers", "seller_applications", "products", "orders", "reviews", "seller_settlements", "homepage_sections"];

export const getAdminDashboard=createServerFn({method:"GET"}).middleware(adminOnly).handler(async({context})=>{await assertAdmin(context);const diagnostics: TableDiagnostic[] = [];const [sellers,applications,products,orders,reviews,settlements,homepage]=await Promise.all([fetchTable<SellerRow>("sellers",diagnostics,context.supabase.from("sellers").select("id,legal_name,account_status,commission_rate,created_at").order("created_at",{ascending:false}).limit(50)),fetchTable<ApplicationRow>("seller_applications",diagnostics,context.supabase.from("seller_applications").select("id,first_name,last_name,email,proposed_store_name,status,created_at").order("created_at",{ascending:false}).limit(50)),fetchTable<ProductRow>("products",diagnostics,context.supabase.from("products").select("id,slug,name,base_price,status,publication_status,moderation_status,seller_id,created_at").order("created_at",{ascending:false}).limit(80)),fetchTable<OrderRow>("orders",diagnostics,context.supabase.from("orders").select("id,order_number,grand_total,status,created_at,first_name,last_name").order("created_at",{ascending:false}).limit(80)),fetchTable<ReviewRow>("reviews",diagnostics,context.supabase.from("reviews").select("id,product_id,rating,body,moderation_status,created_at").order("created_at",{ascending:false}).limit(50)),fetchTable<SettlementRow>("seller_settlements",diagnostics,context.supabase.from("seller_settlements").select("id,seller_id,amount,status,created_at,payment_reference").order("created_at",{ascending:false}).limit(50)),fetchTable<HomepageSectionRow>("homepage_sections",diagnostics,context.supabase.from("homepage_sections").select("id,section_key,kind,title,enabled,sort_order").order("sort_order"))]);diagnostics.sort((a,b)=>TABLE_ORDER.indexOf(a.table)-TABLE_ORDER.indexOf(b.table));return {sellers,applications,products,orders,reviews,settlements,homepage,diagnostics};});

export const approveSellerApplication=createServerFn({method:"POST"}).middleware(adminOnly).inputValidator(data=>z.object({applicationId:z.string().uuid()}).parse(data)).handler(async({data,context})=>{await assertAdmin(context);const {supabaseAdmin}=await import("@/integrations/supabase/client.server");const {data:app,error}=await supabaseAdmin.from("seller_applications").select("*").eq("id",data.applicationId).maybeSingle();if(error||!app)throw new Error("Application not found.");if(app.status!=="pending")throw new Error("Application is not pending.");if(!app.applicant_id){const {error:updateError}=await supabaseAdmin.from("seller_applications").update({status:"approved",reviewed_at:new Date().toISOString(),reviewed_by:context.userId}).eq("id",app.id);if(updateError)throw new Error(updateError.message);return {sellerId:null};}const {data:seller,error:sellerError}=await supabaseAdmin.from("sellers").insert({owner_id:app.applicant_id,legal_name:app.proposed_store_name,first_name:app.first_name,last_name:app.last_name,phone:app.phone,email:app.email,status:"active",account_status:"active",commission_rate:.1,approved_at:new Date().toISOString()}).select("id").single();if(sellerError||!seller)throw new Error(sellerError?.message??"Could not create seller.");const slug=app.proposed_store_name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"")+"-"+seller.id.slice(0,6);const {error:storeError}=await supabaseAdmin.from("stores").insert({seller_id:seller.id,name:app.proposed_store_name,slug,status:"active",verification_status:"unverified",description:app.business_description});if(storeError)throw new Error(storeError.message);await supabaseAdmin.from("user_roles").upsert({user_id:app.applicant_id,role:"seller_owner"},{onConflict:"user_id,role"});const {error:updateError}=await supabaseAdmin.from("seller_applications").update({status:"approved",reviewed_at:new Date().toISOString(),reviewed_by:context.userId,seller_id:seller.id}).eq("id",app.id);if(updateError)throw new Error(updateError.message);await supabaseAdmin.from("audit_logs").insert({actor_id:context.userId,action:"seller_application_approved",resource:"seller_application",resource_id:app.id,metadata:{seller_id:seller.id}});return {sellerId:seller.id};});

export const moderateProduct=createServerFn({method:"POST"}).middleware(adminOnly).inputValidator(data=>z.object({productId:z.string().uuid(),decision:z.enum(["approve","reject","hide"])}).parse(data)).handler(async({data,context})=>{await assertAdmin(context);const update = data.decision === "approve" ? { moderation_status: "approved" as const, publication_status: "published", visibility: "public", status: "active" as const, published_at: new Date().toISOString() } : data.decision === "hide" ? { visibility: "hidden", publication_status: "hidden" } : { moderation_status: "rejected" as const, publication_status: "rejected", visibility: "hidden" };const {error}=await context.supabase.from("products").update(update).eq("id",data.productId);if(error)throw new Error(error.message);return {ok:true};});

export const updateHomepageSection=createServerFn({method:"POST"}).middleware(adminOnly).inputValidator(data=>z.object({sectionId:z.string().uuid(),enabled:z.boolean()}).parse(data)).handler(async({data,context})=>{await assertAdmin(context);const {error}=await context.supabase.from("homepage_sections").update({enabled:data.enabled}).eq("id",data.sectionId);if(error)throw new Error(error.message);return {ok:true};});
