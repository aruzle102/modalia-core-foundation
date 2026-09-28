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

export const createSellerProduct=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator(data=>z.object({storeId:id,name:z.string().min(2).max(180),description:z.string().max(4000).optional(),price:z.number().min(0).max(100000000),compareAtPrice:z.number().min(0).optional(),weightGrams:z.number().int().positive().optional(),sku:z.string().min(2).max(80),stock:z.number().int().min(0).max(1000000)}).parse(data)).handler(async({data,context})=>{
 const {data:seller}=await context.supabase.from("sellers").select("id").eq("owner_id",context.userId).eq("account_status","active").maybeSingle(); if(!seller) throw new Error("Seller account is not active.");
 const {data:store}=await context.supabase.from("stores").select("id").eq("id",data.storeId).eq("seller_id",seller.id).maybeSingle(); if(!store) throw new Error("Store access denied.");
 const slug=data.name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"")+"-"+crypto.randomUUID().slice(0,6);
 const {data:product,error}=await context.supabase.from("products").insert({seller_id:seller.id,store_id:store.id,slug,name:{en:data.name,fr:data.name,ar:data.name},description:{en:data.description??"",fr:data.description??"",ar:data.description??""},base_price:data.price,compare_at_price:data.compareAtPrice??null,sku:data.sku,weight_grams:data.weightGrams??null,status:"draft",publication_status:"pending_review",moderation_status:"pending",visibility:"private"}).select("id,slug").single();
 if(error||!product) throw new Error(error?.message??"Unable to create product.");
 const {data:variant,error:variantError}=await context.supabase.from("product_variants").insert({product_id:product.id,sku:data.sku,price:data.price,compare_at_price:data.compareAtPrice??null,available:data.stock>0,weight_grams:data.weightGrams??null,status:"active",attributes:{}}).select("id").single();
 if(variantError||!variant) throw new Error(variantError?.message??"Unable to create variant.");
 const {error:stockError}=await context.supabase.from("inventory").insert({variant_id:variant.id,quantity:data.stock,reserved_quantity:0,low_stock_threshold:3});
 if(stockError) throw new Error(stockError.message);
 return product;
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

export const createSellerSupportRequest=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator(data=>z.object({sellerId:id,subject:z.string().min(3).max(200),message:z.string().min(10).max(4000)}).parse(data)).handler(async({data,context})=>{const {data:seller}=await context.supabase.from("sellers").select("id").eq("id",data.sellerId).eq("owner_id",context.userId).maybeSingle();if(!seller)throw new Error("Seller access denied.");const {error}=await context.supabase.from("seller_support_requests").insert({seller_id:seller.id,subject:data.subject,message:data.message});if(error)throw new Error(error.message);return {ok:true};});
