import { track } from "@/lib/analytics";
import { recordWishlistAdd, recordWishlistRemove } from "@/lib/recommendations-client";

export type WishlistItem = { productId:string; slug:string; name:string; price:number; image:string|null; storeName:string|null; categorySlug?:string|null; storeId?:string|null };
const KEY="modalia-wishlist-v1";
export function readWishlist():WishlistItem[]{if(typeof window==="undefined")return[];try{const x=JSON.parse(localStorage.getItem(KEY)||"[]");return Array.isArray(x)?x:[]}catch{return[]}}
function notify(){if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent("wishlist-change"))}
export function toggleWishlist(item:WishlistItem){const current=readWishlist();const exists=current.some(x=>x.productId===item.productId);const next=exists?current.filter(x=>x.productId!==item.productId):[...current,item];localStorage.setItem(KEY,JSON.stringify(next));notify();if(exists){track("wishlist_remove",{entityType:"product",entityId:item.productId});recordWishlistRemove(item.productId)}else{recordWishlistAdd({id:item.productId,categorySlug:item.categorySlug,storeId:item.storeId,storeName:item.storeName})}return !exists}
export function removeFromWishlist(productId:string){const next=readWishlist().filter(x=>x.productId!==productId);localStorage.setItem(KEY,JSON.stringify(next));notify();recordWishlistRemove(productId)}
export function isWishlisted(id:string){return readWishlist().some(x=>x.productId===id)}
