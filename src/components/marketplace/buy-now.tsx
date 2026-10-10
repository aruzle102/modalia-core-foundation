/**
 * Buy-now / quick-add variant sheet (Track A, Section 7).
 *
 * `startBuyNow(locale, product, opts)` raises a request in the module-level
 * store. `BuyNowHost` (mounted once per page, inside SiteFooter) subscribes
 * and, when a request exists, fetches real variant data via
 * `getProductBuyOptions`:
 *
 * - No required options + a default variant → goes direct immediately
 *   (brief honest loading state, no fake delay).
 * - Required options → opens a variant-selection sheet (Radix Dialog on
 *   desktop, vaul Drawer on mobile). Never invents or assumes a variant.
 * - mode "buy" → Continue to checkout: captures the chosen line as a
 *   single-use intent and navigates to /checkout?intent=<id>.
 * - mode "add" → adds the matched variant to the cart, closes, toasts.
 *
 * All option/value/price/stock data comes from the server function. When the
 * product is gone or the fetch fails, the sheet says so honestly.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Minus, Plus, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { AsyncButton } from "@/components/motion/AsyncButton";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCart, type CartLine } from "@/lib/cart-store";
import { createBuyNowIntent } from "@/lib/buy-now";
import {
  getProductBuyOptions,
  type BuyOption,
  type BuyVariant,
  type ProductBuyOptions,
} from "@/lib/buy-now.functions";
import { getTranslations } from "@/lib/i18n";
import { formatPrice } from "@/lib/i18n/format";
import { track } from "@/lib/analytics";
import type { SupportedLocale } from "@/config/platform";
import { motionTw } from "@/lib/motion-tokens";

export type BuyNowProduct = {
  productId: string;
  slug: string;
  name: string;
  image: string | null;
  storeName: string | null;
  /** Store slug when the caller knows it (product page). Absent = unknown (catalog cards carry no store slug). */
  storeSlug?: string | null;
};

export type BuyNowRequest = {
  product: BuyNowProduct;
  mode: "buy" | "add";
  preselected: Record<string, string>;
  quantity: number;
  /** Unique per request so the host can tell a fresh request from a stale one. */
  ownerId: string;
};

export type BuyNowStartOptions = {
  mode?: "buy" | "add";
  preselected?: Record<string, string>;
  quantity?: number;
};

let currentRequest: BuyNowRequest | null = null;
const listeners = new Set<() => void>();
let ownerSeq = 0;

function emit() {
  for (const listener of listeners) listener();
}

/**
 * Raise a buy-now/add request. The mounted BuyNowHost claims it; the locale
 * here is the caller's — the host renders with its own page locale.
 */
export function startBuyNow(
  _locale: SupportedLocale,
  product: BuyNowProduct,
  opts?: BuyNowStartOptions,
): void {
  currentRequest = {
    product,
    mode: opts?.mode ?? "buy",
    preselected: opts?.preselected ?? {},
    quantity: Math.max(1, Math.floor(opts?.quantity ?? 1)),
    ownerId: `buy-now-${++ownerSeq}`,
  };
  emit();
}

/** Dismiss the current request (sheet closed, intent created, or item added). */
export function clearBuyNowRequest(): void {
  if (currentRequest === null) return;
  currentRequest = null;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): BuyNowRequest | null {
  return currentRequest;
}

function getServerSnapshot(): BuyNowRequest | null {
  return null;
}

type ResolvedBuyOptions = Extract<ProductBuyOptions, { available: true }>;

/** Mounted once per page — subscribes to the module store and claims requests. */
export function BuyNowHost({ locale }: { locale: SupportedLocale }) {
  const request = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (!request) return null;
  // Keyed by ownerId so a fresh request always starts from clean state.
  return <BuyNowFlow key={request.ownerId} locale={locale} request={request} />;
}

function toCartLine(
  request: BuyNowRequest,
  resolved: ResolvedBuyOptions,
  variant: BuyVariant,
  options: BuyOption[],
  selected: Record<string, string>,
  quantity: number,
): CartLine {
  return {
    productId: resolved.product.id,
    variantId: variant.id,
    slug: resolved.product.slug,
    name: resolved.product.name,
    price: variant.price,
    compareAtPrice: variant.compareAtPrice,
    quantity,
    image: request.product.image,
    storeName: request.product.storeName,
    storeSlug: request.product.storeSlug ?? null,
    options: Object.fromEntries(
      options.map((option) => [
        option.code,
        option.values.find((value) => value.id === selected[option.id])?.label ?? "",
      ]),
    ),
  };
}

function BuyNowFlow({ locale, request }: { locale: SupportedLocale; request: BuyNowRequest }) {
  const t = getTranslations(locale);
  const cart = useCart();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "sheet" | "error">("loading");
  const [data, setData] = useState<ResolvedBuyOptions | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const close = useCallback(() => clearBuyNowRequest(), []);

  const applyDirect = useCallback(
    (variant: BuyVariant, resolved: ResolvedBuyOptions) => {
      const quantity = Math.min(request.quantity, Math.max(1, variant.stock));
      const line = toCartLine(request, resolved, variant, resolved.options, {}, quantity);
      if (request.mode === "buy") {
        const id = createBuyNowIntent(line);
        track("buy_now_started", {
          entityType: "product",
          entityId: resolved.product.id,
          metadata: { quantity, variant_id: variant.id },
        });
        close();
        navigate({ to: "/checkout", search: { locale, intent: id } });
      } else {
        cart.addItem(line);
        track("add_to_cart", {
          entityType: "product",
          entityId: resolved.product.id,
          metadata: { quantity, variant_id: variant.id },
        });
        toast.success(t.card.added);
        close();
      }
    },
    [cart, close, locale, navigate, request, t.card.added],
  );

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    getProductBuyOptions({ data: { productId: request.product.productId, locale } })
      .then((result) => {
        if (cancelled) return;
        if (!result.available) {
          setStatus("error");
          return;
        }
        setData(result);
        const needsSheet =
          result.options.some((option) => option.required) || !result.defaultVariantId;
        if (!needsSheet) {
          // Direct path: no choice is required, so act on the default variant
          // immediately — no fake delay, the loading state is just the fetch.
          const variant = result.variants.find((v) => v.id === result.defaultVariantId);
          if (variant) applyDirect(variant, result);
          else setStatus("error");
        } else {
          setStatus("sheet");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [applyDirect, locale, request.ownerId, request.product.productId, retryCount]);

  if (status === "loading") {
    return (
      <div
        className="fixed inset-0 z-[70] grid place-items-center bg-background/60 backdrop-blur-sm"
        role="status"
        aria-live="polite"
      >
        <span className="inline-flex items-center gap-2 text-small text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {t.common.loading}
        </span>
      </div>
    );
  }

  if (status === "error" || !data) {
    return (
      <BuyNowShell locale={locale} onClose={close} labelledBy="buy-now-error">
        <div className="px-1 py-6 text-center">
          <h2 id="buy-now-error" className="text-h3 text-foreground">
            {t.product.unavailableTitle}
          </h2>
          <p className="mx-auto mt-2 max-w-xs text-small text-muted-foreground">
            {t.product.notAvailable}
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button type="button" variant="outline" onClick={() => setRetryCount((n) => n + 1)}>
              {t.common.retry}
            </Button>
            <Button type="button" onClick={close}>
              {t.common.close}
            </Button>
          </div>
        </div>
      </BuyNowShell>
    );
  }

  return (
    <BuyNowSheet
      locale={locale}
      request={request}
      data={data}
      onClose={close}
      onConfirm={(variant, selected, quantity) => {
        const line = toCartLine(request, data, variant, data.options, selected, quantity);
        if (request.mode === "buy") {
          const id = createBuyNowIntent(line);
          track("buy_now_started", {
            entityType: "product",
            entityId: data.product.id,
            metadata: { quantity, variant_id: variant.id },
          });
          close();
          navigate({ to: "/checkout", search: { locale, intent: id } });
        } else {
          cart.addItem(line);
          track("add_to_cart", {
            entityType: "product",
            entityId: data.product.id,
            metadata: { quantity, variant_id: variant.id },
          });
          toast.success(t.card.added);
          close();
        }
      }}
    />
  );
}

/**
 * Dialog on desktop, vaul Drawer on mobile — same content, platform-idiomatic
 * chrome. Uses the canonical overlayMotion presets via the ui primitives.
 */
function BuyNowShell({
  locale,
  onClose,
  labelledBy,
  children,
}: {
  locale: SupportedLocale;
  onClose: () => void;
  labelledBy?: string;
  children: ReactNode;
}) {
  const t = getTranslations(locale);
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer open onOpenChange={(open) => !open && onClose()}>
        <DrawerContent aria-labelledby={labelledBy}>
          <DrawerHeader className="relative text-start">
            <DrawerTitle>{t.buyNow.title}</DrawerTitle>
            <DrawerDescription>{t.buyNow.selectOptions}</DrawerDescription>
            <DrawerClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute end-2 top-2"
                aria-label={t.common.close}
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </DrawerClose>
          </DrawerHeader>
          <div className="max-h-[70vh] overflow-y-auto px-4 pb-6">{children}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-labelledby={labelledBy} className="max-h-[85vh] overflow-y-auto">
        <DialogHeader className="text-start">
          <DialogTitle>{t.buyNow.title}</DialogTitle>
          <DialogDescription>{t.buyNow.selectOptions}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function BuyNowSheet({
  locale,
  request,
  data,
  onClose,
  onConfirm,
}: {
  locale: SupportedLocale;
  request: BuyNowRequest;
  data: ResolvedBuyOptions;
  onClose: () => void;
  onConfirm: (variant: BuyVariant, selected: Record<string, string>, quantity: number) => void;
}) {
  const t = getTranslations(locale);
  const [selected, setSelected] = useState<Record<string, string>>(() => {
    // Preselect only values that really exist for the product.
    const initial: Record<string, string> = {};
    for (const option of data.options) {
      const valueId = request.preselected[option.id];
      if (valueId && option.values.some((value) => value.id === valueId)) {
        initial[option.id] = valueId;
      }
    }
    return initial;
  });
  const [quantity, setQuantity] = useState(request.quantity);

  const selectedValues = Object.values(selected);
  const complete = data.options
    .filter((option) => option.required)
    .every((option) => selected[option.id]);

  // Same matching rule as the product page: every selected value must belong
  // to the variant, and once the required set is complete the variant must
  // match exactly.
  const matchingVariant = useMemo(
    () =>
      data.variants.find(
        (variant) =>
          selectedValues.every((value) => variant.optionValueIds.includes(value)) &&
          (complete ? variant.optionValueIds.length === selectedValues.length : true),
      ),
    [complete, data.variants, selectedValues],
  );
  const purchasable = matchingVariant?.available ? matchingVariant : null;

  // Never let the quantity exceed real stock once a variant is matched.
  useEffect(() => {
    if (purchasable) setQuantity((q) => Math.min(Math.max(1, q), Math.max(1, purchasable.stock)));
  }, [purchasable]);
  const maxQuantity = Math.max(1, purchasable?.stock ?? 1);

  const handleConfirm = useCallback(async () => {
    if (!purchasable) return;
    onConfirm(purchasable, selected, Math.min(quantity, maxQuantity));
  }, [purchasable, onConfirm, selected, quantity, maxQuantity]);

  return (
    <BuyNowShell locale={locale} onClose={onClose} labelledBy="buy-now-sheet-title">
      <div id="buy-now-sheet-title" className="sr-only">
        {t.buyNow.title}
      </div>
      {/* Product identity — real data only. */}
      <div className="flex items-center gap-3">
        {request.product.image ? (
          <img
            src={request.product.image}
            alt=""
            aria-hidden="true"
            className="h-16 w-12 shrink-0 rounded-sm bg-muted object-cover"
          />
        ) : null}
        <div className="min-w-0">
          {request.product.storeName ? (
            <p className="truncate text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              {request.product.storeName}
            </p>
          ) : null}
          <p className="truncate text-[15px] font-medium text-foreground">{data.product.name}</p>
        </div>
      </div>

      {/* Option selectors — swatches for colors, buttons otherwise (product-page pattern). */}
      <div className="mt-6 space-y-6">
        {data.options.map((option) => {
          const isColor = option.values.some((value) => value.hex);
          return (
            <fieldset key={option.id}>
              <legend className="text-nav text-foreground">
                {option.name}
                {option.required ? (
                  <span className="text-muted-foreground"> · {t.product.required}</span>
                ) : null}
              </legend>
              <div className="mt-3 flex flex-wrap gap-2">
                {option.values.map((value) =>
                  isColor && value.hex ? (
                    <button
                      key={value.id}
                      type="button"
                      disabled={!value.available}
                      onClick={() =>
                        setSelected((s) => ({ ...s, [option.id]: value.id }))
                      }
                      aria-pressed={selected[option.id] === value.id}
                      aria-label={value.label}
                      title={value.label}
                      style={{ backgroundColor: value.hex }}
                      className={`size-9 rounded-full border border-border ${motionTw.transition.interactive} disabled:cursor-not-allowed disabled:opacity-30 motion-reduce:transition-none ${
                        selected[option.id] === value.id
                          ? "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                          : "hover:scale-110"
                      }`}
                    />
                  ) : (
                    <Button
                      key={value.id}
                      type="button"
                      variant={selected[option.id] === value.id ? "default" : "outline"}
                      size="sm"
                      disabled={!value.available}
                      onClick={() =>
                        setSelected((s) => ({ ...s, [option.id]: value.id }))
                      }
                      className="min-w-10"
                    >
                      {value.label}
                    </Button>
                  ),
                )}
              </div>
            </fieldset>
          );
        })}
      </div>

      {/* Quantity stepper — capped at real stock. */}
      <div className="mt-6 flex items-center justify-between gap-4">
        <span className="text-small font-medium text-foreground">{t.buyNow.quantity}</span>
        <div className="inline-flex h-10 items-center rounded-md border border-border">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9"
            disabled={quantity <= 1}
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            aria-label={t.product.decrease}
          >
            <Minus className="size-4" aria-hidden="true" />
          </Button>
          <span className="w-10 text-center text-small font-medium" aria-live="polite">
            {quantity}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9"
            disabled={quantity >= maxQuantity}
            onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
            aria-label={t.product.increase}
          >
            <Plus className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* Live price of the matched variant — honest: nothing shown until a real variant matches. */}
      <p className="mt-6 flex items-baseline gap-2" aria-live="polite">
        {purchasable ? (
          <>
            <span className="text-price text-lg font-semibold text-foreground">
              {formatPrice(purchasable.price * quantity, locale)}
            </span>
            {purchasable.compareAtPrice != null && purchasable.compareAtPrice > purchasable.price ? (
              <span className="text-sm text-muted-foreground line-through">
                {formatPrice(purchasable.compareAtPrice * quantity, locale)}
              </span>
            ) : null}
          </>
        ) : (
          <span className="text-small text-muted-foreground">
            {complete ? t.product.outOfStock : t.buyNow.selectOptions}
          </span>
        )}
      </p>

      <AsyncButton
        onAction={handleConfirm}
        disabled={!purchasable}
        feedback={request.mode === "add" ? "cart" : "none"}
        successSrLabel={request.mode === "add" ? t.card.added : undefined}
        className="mt-4 h-12 w-full font-semibold"
      >
        {request.mode === "buy" ? t.buyNow.continueToCheckout : t.card.addToBag}
      </AsyncButton>
      <p className="mt-3 text-center text-caption text-muted-foreground">
        {t.buyNow.expressCheckout}
      </p>
    </BuyNowShell>
  );
}
