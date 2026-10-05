import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const id=z.string().uuid();
export const getSellerDashboard=createServerFn({method:"GET"}).middleware([requireSupabaseAuth]).handler(async({context})=>{
 const {data:seller,error}=await context.supabase.from("sellers").select("id,legal_name,account_status,commission_rate,stores(id,slug,name,description,logo_path,banner_path,verification_status)").eq("owner_id",context.userId).maybeSingle();
 if(error) throw new Error("Seller workspace unavailable."); if(!seller) return null;
 const [products,orders,settlements]=await Promise.all([
  context.supabase.from("products").select("id,slug,name,base_price,status,publication_status,moderation_status,visibility,created_at").eq("seller_id",seller.id).order("created_at",{ascending:false}).limit(50),
  context.supabase.from("seller_orders").select("id,order_id,status,subtotal,shipping_total,commission_total,created_at,orders(order_number,first_name,last_name)").eq("seller_id",seller.id).order("created_at",{ascending:false}).limit(30),
  context.supabase.from("seller_settlements").select("id,amount,status,created_at,payment_reference").eq("seller_id",seller.id).order("created_at",{ascending:false}).limit(10),
 ]);
 return {seller,products:products.data??[],orders:orders.data??[],settlements:settlements.data??[]};
});

export const updateSellerStore=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator(data=>z.object({storeId:id,name:z.string().min(2).max(160),description:z.string().max(2000).optional(),contactPhone:z.string().max(30).optional()}).parse(data)).handler(async({data,context})=>{
 const {data:seller}=await context.supabase.from("sellers").select("id").eq("owner_id",context.userId).maybeSingle(); if(!seller) throw new Error("Seller not found.");
 const {error}=await context.supabase.from("stores").update({name:data.name,description:data.description??null,contact_phone:data.contactPhone??null}).eq("id",data.storeId).eq("seller_id",seller.id); if(error) throw new Error(error.message); return {ok:true};
});

export const inviteSellerStaff=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator(data=>z.object({sellerId:id,email:z.string().email(),permissions:z.array(z.string()).max(30)}).parse(data)).handler(async({data,context})=>{
 const {data:seller}=await context.supabase.from("sellers").select("id").eq("id",data.sellerId).eq("owner_id",context.userId).maybeSingle(); if(!seller) throw new Error("Seller access denied.");
 const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
 const {data:invite,error}=await supabaseAdmin.auth.admin.inviteUserByEmail(data.email); if(error||!invite.user) throw new Error(error?.message??"Unable to invite staff member.");
 const {error:insertError}=await supabaseAdmin.from("seller_staff").insert({seller_id:seller.id,user_id:invite.user.id,role:"seller_staff",permissions:data.permissions}); if(insertError) throw new Error(insertError.message); return {ok:true};
});
