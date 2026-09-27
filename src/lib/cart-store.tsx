import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

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
  sellerId?: string | null;
  options?: Record<string, string>;
  weightGrams?: number;
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
  const [items, setItems] = useState<CartLine[]>([]);
  useEffect(() => { setItems(readCart()); }, []);
  useEffect(() => { if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }, [items]);
  const addItem = useCallback((item: CartLine) => setItems((current) => {
    const existing = current.find((line) => line.variantId === item.variantId);
    if (existing) return current.map((line) => line.variantId === item.variantId ? { ...line, quantity: line.quantity + item.quantity } : line);
    return [...current, item];
  }), []);
  const removeItem = useCallback((variantId: string) => setItems((current) => current.filter((line) => line.variantId !== variantId)), []);
  const setQuantity = useCallback((variantId: string, quantity: number) => setItems((current) => quantity <= 0 ? current.filter((line) => line.variantId !== variantId) : current.map((line) => line.variantId === variantId ? { ...line, quantity } : line)), []);
  const clear = useCallback(() => setItems([]), []);
  const value = useMemo(() => ({ items, addItem, removeItem, setQuantity, clear, count: items.reduce((sum, item) => sum + item.quantity, 0), subtotal: items.reduce((sum, item) => sum + item.price * item.quantity, 0) }), [items, addItem, removeItem, setQuantity, clear]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart must be used inside CartProvider");
  return value;
}
