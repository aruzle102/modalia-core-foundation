import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { track } from "@/lib/analytics";

export type CartLine = {
  productId: string;
  variantId: string;
  slug: string;
  name: string;
  price: number;
  compareAtPrice?: number | null;
  quantity: number;
  image?: string | null;
  storeId?: string | null;
  storeName?: string | null;
  /** Store slug for linking to `/store/{slug}`. Null/absent = unknown (old lines, quick-add from cards). */
  storeSlug?: string | null;
  sellerId?: string | null;
  options?: Record<string, string>;
  weightGrams?: number | undefined;
};

type CartContextValue = {
  items: CartLine[];
  addItem: (item: CartLine) => void;
  removeItem: (variantId: string) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  clear: () => void;
  count: number;
  subtotal: number;
};

const STORAGE_KEY = "modalia-cart-v1";
const CartContext = createContext<CartContextValue | null>(null);

function readCart(): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  // Lazy init from localStorage so a refresh never flashes an empty cart.
  const [items, setItems] = useState<CartLine[]>(readCart);
  useEffect(() => { if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }, [items]);
  const addItem = useCallback((item: CartLine) => setItems((current) => {
    const existing = current.find((line) => line.variantId === item.variantId);
    if (existing) return current.map((line) => line.variantId === item.variantId ? { ...line, quantity: line.quantity + item.quantity } : line);
    return [...current, item];
  }), []);
  const removeItem = useCallback((variantId: string) => setItems((current) => {
    const line = current.find((l) => l.variantId === variantId);
    // track() dedupes per minute-bucket, so a StrictMode double-invoke of the
    // updater cannot double-count the removal.
    if (line) track("cart_remove", { entityType: "product", entityId: line.productId, metadata: { variant_id: variantId, quantity: line.quantity } });
    return current.filter((l) => l.variantId !== variantId);
  }), []);
  const setQuantity = useCallback((variantId: string, quantity: number) => {
    // Setting quantity to 0 is a removal — route through removeItem so the
    // cart_remove event fires on every removal path.
    if (quantity <= 0) { removeItem(variantId); return; }
    setItems((current) => current.map((line) => line.variantId === variantId ? { ...line, quantity } : line));
  }, [removeItem]);
  const clear = useCallback(() => setItems([]), []);
  const value = useMemo(() => ({ items, addItem, removeItem, setQuantity, clear, count: items.reduce((sum, item) => sum + item.quantity, 0), subtotal: items.reduce((sum, item) => sum + item.price * item.quantity, 0) }), [items, addItem, removeItem, setQuantity, clear]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart must be used inside CartProvider");
  return value;
}
