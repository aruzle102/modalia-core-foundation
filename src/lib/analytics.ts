import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY="modalia-session-id";
export function getSessionId(){if(typeof window==="undefined")return null;let id=localStorage.getItem(SESSION_KEY);if(!id){id=crypto.randomUUID();localStorage.setItem(SESSION_KEY,id)}return id}
export async function trackDiscovery(eventKind:"product_view"|"category_view"|"search"|"wishlist"|"cart", payload:{productId?:string;categoryId?:string;query?:string;metadata?:Record<string,unknown>}={}){try{const session=getSessionId();await supabase.from("discovery_events").insert({session_id:session,event_kind:eventKind,product_id:payload.productId??null,category_id:payload.categoryId??null,query:payload.query??null,metadata:payload.metadata??{}})}catch{/* analytics must never break commerce */}}
