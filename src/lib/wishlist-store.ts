export type WishlistItem = { productId:string; slug:string; name:string; price:number; image:string|null; storeName:string|null };
const KEY="modalia-wishlist-v1";
export function readWishlist():WishlistItem[]{if(typeof window==="undefined")return[];try{const x=JSON.parse(localStorage.getItem(KEY)||"[]");return Array.isArray(x)?x:[]}catch{return[]}}
export function toggleWishlist(item:WishlistItem){const current=readWishlist();const exists=current.some(x=>x.productId===item.productId);const next=exists?current.filter(x=>x.productId!==item.productId):[...current,item];localStorage.setItem(KEY,JSON.stringify(next));return !exists}
export function isWishlisted(id:string){return readWishlist().some(x=>x.productId===id)}
