import { lazy, Suspense, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Box, Heart, Minus, Plus, ShieldCheck, ShoppingBag, Star, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductGrid } from "@/components/marketplace/discovery";
import { OfficialStoreBadge, VerifiedSellerBadge } from "@/components/marketplace/StoreBadges";
import { ReviewForm } from "@/components/marketplace/review-form";
import { BackInStockNotify } from "@/components/marketplace/back-in-stock-notify";
import { formatNumber, formatPrice } from "@/lib/i18n/format";
import { getTranslations } from "@/lib/i18n";
import { useCart } from "@/lib/cart-store";
import { useDeviceTier } from "@/hooks/use-device-tier";
import { microAnimationClass, replayAnimation } from "@/lib/motion";
import { motionTw } from "@/lib/motion-tokens";
import { isWishlisted, toggleWishlist } from "@/lib/wishlist-store";
import { toast } from "sonner";
import { getRelatedProducts } from "@/lib/analytics.functions";
import { recordRecentlyViewed, track } from "@/lib/analytics";
import { startBuyNow } from "@/components/marketplace/buy-now";
import { SiteButtons } from "@/components/layout/site-buttons";
import type { SupportedLocale } from "@/config/platform";
import type { ProductDetail } from "@/lib/product.functions";

const ProductViewer3D = lazy(() =>
  import("@/components/commerce/ProductViewer3D").then((m) => ({ default: m.ProductViewer3D })),
);

function discountPercent(price: number, compareAtPrice: number | null): number | null {
  if (!compareAtPrice || compareAtPrice <= price) return null;
  return Math.round(((compareAtPrice - price) / compareAtPrice) * 100);
}

function canMagnify(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(pointer: fine)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function ProductDetailView({ product, locale }: { product: ProductDetail; locale: SupportedLocale }) {
  const t = getTranslations(locale).product;
  const sf = getTranslations(locale).home;
  const verifiedLabel = getTranslations(locale).store.verifiedStore;
  const officialLabel = getTranslations(locale).store.officialStore;
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const [activeMedia, setActiveMedia] = useState(0);
  const [view3d, setView3d] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [zoomOrigin, setZoomOrigin] = useState("50% 50%");
  const [saved, setSaved] = useState(false);
  type DetailTab = "description" | "details" | "delivery" | "reviews";
  const [activeTab, setActiveTab] = useState<DetailTab>("description");
  const { tier } = useDeviceTier();
  const parallaxEnabled =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: fine)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cart = useCart();
  const ctaRef = useRef<HTMLDivElement>(null);
  const [ctaVisible, setCtaVisible] = useState(true);

  useEffect(() => {
    const el = ctaRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setCtaVisible(entry?.isIntersecting ?? true));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setSaved(isWishlisted(product.id));
    track("product_view", { entityType: "product", entityId: product.id });
    recordRecentlyViewed({
      id: product.id,
      slug: product.slug,
      name: product.name,
      image: product.media.find((m) => m.isPrimary)?.url ?? product.media[0]?.url ?? null,
      price: product.price,
      categorySlug: product.category?.slug,
    });
  }, [product.id]);

  const selectedValues = Object.values(selected);
  const complete = product.options
    .filter((option) => option.required)
    .every((option) => selected[option.id]);

  const matchingVariant = useMemo(
    () =>
      product.variants.find(
        (variant) =>
          selectedValues.every((value) => variant.optionValueIds.includes(value)) &&
          (complete ? variant.optionValueIds.length === selectedValues.length : true),
      ),
    [complete, product.variants, selectedValues],
  );

  // When the product has no options, the purchasable variant is the first available one.
  const effectiveVariant =
    matchingVariant ?? (product.options.length === 0 ? product.variants.find((variant) => variant.available) ?? null : null);

  const price = effectiveVariant?.price ?? product.price;
  const compareAtPrice = effectiveVariant?.compareAtPrice ?? product.compareAtPrice;
  const sale = discountPercent(price, compareAtPrice);
  const available = Boolean(effectiveVariant?.available);
  const stock = effectiveVariant?.stock ?? 0;
  const lowStockAt = effectiveVariant?.lowStockThreshold ?? 0;
  const lowStock = available && stock > 0 && stock <= Math.max(lowStockAt, 1);
  const maxQuantity = Math.max(1, Math.min(stock, effectiveVariant?.maxPurchaseQuantity ?? stock));

  // Gallery: real images only, filtered by the selected color when the seller linked media to colors.
  const images = product.media.filter(
    (item) =>
      item.mediaType === "image" &&
      item.url &&
      (!selectedValues.length ||
        !item.colorId ||
        product.options.some((option) =>
          option.values.some((value) => value.id === selected[option.id] && value.colorId === item.colorId),
        )),
  );
  const model3d = product.media.find((item) => item.mediaType === "model_3d");
  // Only offer 3D when a real model exists — never a fake 3D button — and
  // never push a multi-MB GLB download on users who asked to save data.
  const canShow3d = Boolean(model3d?.url) && tier !== "data-saver";
  const currentImage = images[Math.min(activeMedia, Math.max(images.length - 1, 0))] ?? null;

  const updateOption = (optionId: string, valueId: string) => {
    setSelected((current) => ({ ...current, [optionId]: valueId }));
    setQuantity(1);
    setActiveMedia(0);
    setZoomed(false);
  };

  const handleZoomMove = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    setZoomOrigin(`${x.toFixed(1)}% ${y.toFixed(1)}%`);
    // 2.5D pointer parallax for the fallback gallery (fine pointers only,
    // never with reduced motion): gives depth without WebGL.
    if (parallaxEnabled) {
      const px = (((event.clientX - rect.left) / rect.width) - 0.5) * -12;
      const py = (((event.clientY - rect.top) / rect.height) - 0.5) * -12;
      event.currentTarget.style.setProperty("--par-x", `${px.toFixed(1)}px`);
      event.currentTarget.style.setProperty("--par-y", `${py.toFixed(1)}px`);
    }
  };

  const handleMediaLeave = (event: MouseEvent<HTMLDivElement>) => {
    setZoomed(false);
    event.currentTarget.style.removeProperty("--par-x");
    event.currentTarget.style.removeProperty("--par-y");
  };

  const toggleSaved = (event: MouseEvent<HTMLButtonElement>) => {
    const next = toggleWishlist({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      price,
      image: currentImage?.url ?? null,
      storeName: product.store?.name ?? null,
    });
    setSaved(next);
    if (next) {
      track("wishlist_add", { entityType: "product", entityId: product.id });
      // Commerce micro-feedback: pop the heart when the item is saved.
      replayAnimation(event.currentTarget, microAnimationClass.wishlistPop);
    }
    toast.success(next ? t.saved : t.removed);
  };

  const addToCart = (silent = false) => {
    if (!effectiveVariant) return;
    cart.addItem({
      productId: product.id,
      variantId: effectiveVariant.id,
      slug: product.slug,
      name: product.name,
      price,
      compareAtPrice,
      quantity,
      image: currentImage?.url ?? null,
      storeName: product.store?.name ?? null,
      storeSlug: product.store?.slug ?? null,
      options: Object.fromEntries(
        product.options.map((option) => [
          option.code,
          option.values.find((value) => value.id === selected[option.id])?.label ?? "",
        ]),
      ),
      weightGrams: product.weightGrams ?? undefined,
    });
    if (!silent) {
      track("add_to_cart", {
        entityType: "product",
        entityId: product.id,
        metadata: { quantity, variant_id: effectiveVariant.id },
      });
      toast.success(t.addedToBag);
    }
  };

  const handleBuyNow = () => {
    // Real Buy Now: isolated single-use intent → /checkout?intent=<id>.
    // Never touches the cart. The BuyNowHost opens the variant sheet when
    // options are incomplete, or creates the direct intent immediately.
    startBuyNow(
      locale,
      {
        productId: product.id,
        slug: product.slug,
        name: product.name,
        image: currentImage?.url ?? null,
        storeName: product.store?.name ?? null,
        storeSlug: product.store?.slug ?? null,
      },
      { mode: "buy", preselected: selected, quantity },
    );
  };

  const canPurchase = complete && available;

  /** The rating summary links to the reviews tab: activate it, then scroll. */
  const goToReviews = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    setActiveTab("reviews");
    requestAnimationFrame(() => {
      document.getElementById("reviews")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };
  // The variant to watch for a back-in-stock alert: the selected one when
  // options are complete, otherwise the first variant of a simple product.
  const alertVariant =
    effectiveVariant ?? (product.options.length === 0 && product.variants.length > 0 ? product.variants[0] : null);
  const showBackInStock = Boolean(alertVariant) && (product.options.length === 0 || complete) && !available;
  const descriptionParagraphs = (product.description ?? "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-7xl px-4 pb-28 pt-7 sm:px-6 lg:px-8 lg:pb-7">
      <nav aria-label={t.breadcrumb} className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
        <Link to="/" search={{ locale }} className="transition-colors hover:text-foreground">
          {t.home}
        </Link>
        <span aria-hidden>/</span>
        {product.category ? (
          <>
            <Link
              to="/category/$slug"
              params={{ slug: product.category.slug }}
              search={{ locale }}
              className="transition-colors hover:text-foreground"
            >
              {product.category.name}
            </Link>
            <span aria-hidden>/</span>
          </>
        ) : null}
        <span className="text-foreground">{product.name}</span>
      </nav>

      <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.8fr)] lg:items-start">
        {/* ——— Gallery with hover magnifier ——— */}
        <section aria-label={t.productMedia} className="min-w-0">
          <div
            className="relative aspect-[4/5] cursor-zoom-in overflow-hidden rounded-[14px] border border-[#E5E5E5] bg-[#F6F6F4]"
            onMouseMove={handleZoomMove}
            onMouseEnter={() => {
              if (canMagnify()) setZoomed(true);
            }}
            onMouseLeave={handleMediaLeave}
            onClick={() => {
              if (typeof window !== "undefined" && !window.matchMedia("(pointer: fine)").matches) {
                setZoomed((value) => !value);
              }
            }}
          >
            {view3d && model3d?.url ? (
              <Suspense
                fallback={
                  <div className="grid size-full place-items-center bg-muted" aria-label={t.view3d}>
                    <Box className="size-8 animate-pulse text-muted-foreground" aria-hidden />
                  </div>
                }
              >
                <ProductViewer3D modelUrl={model3d.url} locale={locale} className="size-full" />
              </Suspense>
            ) : currentImage?.url ? (
              <img
                src={currentImage.url}
                alt={currentImage.alt || product.name}
                sizes="(min-width: 1024px) 55vw, 100vw"
                style={{ transformOrigin: zoomOrigin }}
                className={`gallery-parallax size-full object-cover ${motionTw.transition.transform} ${motionTw.duration.feedback} ${motionTw.ease.out} motion-reduce:transition-none ${
                  zoomed ? "scale-[1.9]" : "scale-100"
                }`}
              />
            ) : (
              <div className="flex size-full items-end p-7 text-body text-muted-foreground">
                Modalia
                <br />
                {product.name}
              </div>
            )}
            <span className="pointer-events-none absolute bottom-3 end-3 hidden rounded-full bg-white/85 px-3 py-1 text-caption text-[#666666] backdrop-blur-sm [@media(pointer:fine)]:block">
              {t.zoomHint}
            </span>
          </div>

          {images.length > 1 || model3d ? (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {images.map((item, index) => (
                <Button
                  key={item.id}
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={t.viewImage(index + 1)}
                  aria-pressed={index === activeMedia}
                  onClick={() => {
                    setActiveMedia(index);
                    setView3d(false);
                    setZoomed(false);
                  }}
                  className="size-16 shrink-0 overflow-hidden rounded-[10px] p-0 aria-pressed:border-foreground aria-pressed:ring-1 aria-pressed:ring-foreground"
                >
                  <span className="block size-full">
                    {item.url ? (
                      <img src={item.url} alt="" loading="lazy" className="size-full object-cover" />
                    ) : (
                      <span className="block size-full bg-muted" />
                    )}
                  </span>
                </Button>
              ))}
              {canShow3d ? (
                <Button
                  key="model-3d"
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={t.view3d}
                  aria-pressed={view3d}
                  onClick={() => {
                    setView3d(true);
                    setZoomed(false);
                  }}
                  className="grid size-16 shrink-0 place-items-center gap-0.5 rounded-[10px] p-0 aria-pressed:border-foreground aria-pressed:ring-1 aria-pressed:ring-foreground"
                >
                  <Box className="size-5" aria-hidden />
                  <span className="text-caption font-medium leading-none">3D</span>
                </Button>
              ) : null}
            </div>
          ) : null}
        </section>

        {/* ——— Purchase panel ——— */}
        <section className="lg:sticky lg:top-24">
          <div className="flex items-start justify-between gap-5">
            <div>
              {product.brand ? (
                <p className="text-eyebrow text-muted-foreground">{product.brand.name}</p>
              ) : null}
              <h1 className="mt-2 font-display text-4xl font-semibold leading-tight tracking-tight text-foreground">
                {product.name}
              </h1>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={saved ? t.removeWishlist : t.saveWishlist}
              aria-pressed={saved}
              onClick={toggleSaved}
              className="shrink-0"
            >
              <Heart className={saved ? "fill-destructive text-destructive" : ""} />
            </Button>
          </div>

          {product.store ? (
            <Link
              to="/store/$slug"
              params={{ slug: product.store.slug }}
              search={{ locale }}
              className="mt-3 inline-flex items-center gap-2 text-small text-muted-foreground transition-colors hover:text-foreground"
            >
              {product.store.logoUrl ? (
                <img src={product.store.logoUrl} alt="" loading="lazy" className="size-5 rounded-full object-cover" />
              ) : null}
              {t.soldBy}{" "}
              <span className="inline-flex items-center gap-1 font-medium text-foreground">
                {product.store.name}
                {product.store.slug === "modalia" ? (
                <OfficialStoreBadge label={officialLabel} />
              ) : (
                <VerifiedSellerBadge verified={product.store.verified} label={verifiedLabel} />
              )}
              </span>
            </Link>
          ) : null}

          <div className="mt-5 flex items-center gap-2">
            {product.reviewSummary.average != null ? (
              <a href="#reviews" onClick={goToReviews} className="inline-flex items-center gap-1.5 text-small text-foreground">
                <span className="inline-flex" aria-hidden>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`size-4 ${star <= Math.round(product.reviewSummary.average ?? 0) ? "fill-current" : "text-muted-foreground/40"}`}
                    />
                  ))}
                </span>
                <span className="font-medium">{product.reviewSummary.average.toFixed(1)}</span>
                <span className="text-muted-foreground underline-offset-4 hover:underline">
                  {t.reviews(product.reviewSummary.count)}
                </span>
              </a>
            ) : (
              <span className="text-small text-muted-foreground">{t.noReviews}</span>
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-baseline gap-3">
            <p className="text-display text-foreground">{formatPrice(price, locale)}</p>
            {compareAtPrice && compareAtPrice > price ? (
              <>
                <p className="text-body text-muted-foreground line-through">
                  {formatPrice(compareAtPrice, locale)}
                </p>
                <span className="rounded-md bg-[#E53935] px-2.5 py-1 text-caption font-semibold text-white">
                  −{sale}%
                </span>
              </>
            ) : null}
          </div>

          {product.shortDescription ? (
            <p className="mt-5 text-body leading-relaxed text-muted-foreground">{product.shortDescription}</p>
          ) : null}

          {product.options.length ? (
            <div className="mt-8 space-y-6">
              {product.options.map((option) => {
                const isColor = option.values.some((value) => value.hex);
                return (
                  <fieldset key={option.id}>
                    <legend className="text-nav text-foreground">
                      {option.name}
                      {option.required ? <span className="text-muted-foreground"> · {t.required}</span> : null}
                    </legend>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {option.values.map((value) =>
                        isColor && value.hex ? (
                          <button
                            key={value.id}
                            type="button"
                            disabled={!value.available}
                            onClick={() => updateOption(option.id, value.id)}
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
                            onClick={() => updateOption(option.id, value.id)}
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
          ) : null}

          <div className="mt-8 border-y border-border py-5" aria-live="polite">
            {!complete ? (
              <p className="text-small text-muted-foreground">{t.chooseOptions}</p>
            ) : available ? (
              <>
                <p className="inline-flex items-center gap-2 text-small font-medium text-foreground">
                  <span className="size-2 rounded-full bg-[#16803C]" aria-hidden />
                  {t.inStock}
                </p>
                {lowStock ? (
                  <p className="mt-1 text-small text-muted-foreground">{t.onlyLeft(stock)}</p>
                ) : null}
              </>
            ) : (
              <p className="inline-flex items-center gap-2 text-small font-medium text-muted-foreground">
                <span className="size-2 rounded-full bg-muted-foreground/50" aria-hidden />
                {t.outOfStock}
              </p>
            )}
          </div>

          {showBackInStock && alertVariant ? (
            <BackInStockNotify variantId={alertVariant.id} locale={locale} />
          ) : null}

          <div className="mt-6 flex items-center gap-3">
            <div className="flex h-11 items-center rounded-[10px] border border-[#E5E5E5]">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t.decrease}
                disabled={quantity <= 1}
                onClick={() => setQuantity((value) => Math.max(1, value - 1))}
              >
                <Minus className="size-4" />
              </Button>
              <output className="w-8 text-center text-small font-medium" aria-label={t.quantity} aria-live="polite">
                {quantity}
              </output>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t.increase}
                disabled={!available || quantity >= maxQuantity}
                onClick={() => setQuantity((value) => Math.min(maxQuantity, value + 1))}
              >
                <Plus className="size-4" />
              </Button>
            </div>
            <span className="text-caption text-muted-foreground">
              {available ? t.available(stock) : ""}
            </span>
          </div>

          <div ref={ctaRef} className="mt-5 grid grid-cols-2 gap-3">
            <Button
              type="button"
              disabled={!canPurchase}
              onClick={handleBuyNow}
              className="h-12 bg-[#0A0A0A] font-semibold text-white hover:bg-black"
            >
              {sf.sfBuyNow}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!canPurchase}
              onClick={() => addToCart()}
              className="h-12 border-[#0A0A0A] bg-white text-[#0A0A0A] hover:bg-[#F6F6F4] hover:text-[#0A0A0A]"
            >
              <ShoppingBag className="size-4" />
              {sf.sfAddToCart}
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
            <SiteButtons placement="product_cta" locale={locale} variant="link" itemClassName="text-small text-muted-foreground underline underline-offset-4 hover:text-foreground" />
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 text-caption text-muted-foreground">
            <p className="inline-flex items-center gap-2">
              <Truck className="size-4 shrink-0" aria-hidden />
              {t.shippedBy}
            </p>
            <p className="inline-flex items-center gap-2">
              <ShieldCheck className="size-4 shrink-0" aria-hidden />
              {t.secure}
            </p>
          </div>

        </section>
      </div>

      {/* ——— Product information tabs ——— */}
      <section className="mt-16 scroll-mt-24 border-t border-[#E5E5E5] pt-10 lg:mt-20">
        <div
          role="tablist"
          aria-label={product.name}
          className="flex gap-7 overflow-x-auto border-b border-[#E5E5E5]"
        >
          {(
            [
              { id: "description", label: sf.sfTabDescription },
              { id: "details", label: sf.sfTabDetails },
              { id: "delivery", label: sf.sfTabDelivery },
              { id: "reviews", label: sf.sfTabReviews },
            ] as const
          ).map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={isActive}
                aria-controls={`tab-panel-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`relative shrink-0 pb-3 text-small transition-colors ${
                  isActive ? "text-[#0A0A0A]" : "text-[#666666] hover:text-[#0A0A0A]"
                }`}
              >
                <span className={isActive ? "font-semibold" : "font-medium"}>{tab.label}</span>
                <span
                  aria-hidden
                  className={`absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[#0A0A0A] ${motionTw.transition.opacity} ${motionTw.duration.feedback} ${
                    isActive ? "opacity-100" : "opacity-0"
                  }`}
                />
              </button>
            );
          })}
        </div>

        <div className="mt-6 rounded-[14px] border border-[#E5E5E5] bg-white p-6 sm:p-8">
          {activeTab === "description" ? (
            <div role="tabpanel" id="tab-panel-description" aria-labelledby="tab-description">
              {descriptionParagraphs.length ? (
                <div className="max-w-3xl space-y-5">
                  {descriptionParagraphs.map((paragraph, index) => (
                    <p
                      key={index}
                      className={`text-body leading-loose text-[#666666] ${
                        index === 0
                          ? "text-[#0A0A0A]/90 first-letter:float-start first-letter:me-3 first-letter:font-display first-letter:text-5xl first-letter:font-semibold first-letter:leading-[0.9]"
                          : ""
                      }`}
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-body text-[#666666]">{sf.sfNoDescription}</p>
              )}
            </div>
          ) : null}

          {activeTab === "details" ? (
            <div role="tabpanel" id="tab-panel-details" aria-labelledby="tab-details">
              <dl className="max-w-xl space-y-3 text-small">
                {product.brand ? (
                  <div className="flex justify-between gap-4 border-b border-[#F6F6F4] pb-3">
                    <dt className="text-[#666666]">{t.brand}</dt>
                    <dd className="font-medium text-[#0A0A0A]">{product.brand.name}</dd>
                  </div>
                ) : null}
                {product.category ? (
                  <div className="flex justify-between gap-4 border-b border-[#F6F6F4] pb-3">
                    <dt className="text-[#666666]">{t.category}</dt>
                    <dd className="font-medium text-[#0A0A0A]">{product.category.name}</dd>
                  </div>
                ) : null}
                {product.weightGrams ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-[#666666]">{t.weight}</dt>
                    <dd className="font-medium text-[#0A0A0A]">{formatNumber(product.weightGrams, locale)} {t.weightUnit}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          ) : null}

          {activeTab === "delivery" ? (
            <div role="tabpanel" id="tab-panel-delivery" aria-labelledby="tab-delivery" className="max-w-3xl">
              <h3 className="text-nav font-medium text-[#0A0A0A]">{t.shippingTitle}</h3>
              <p className="mt-2 text-small leading-relaxed text-[#666666]">{t.shippingBody}</p>
              <h3 className="mt-6 text-nav font-medium text-[#0A0A0A]">{t.returns}</h3>
              <p className="mt-2 text-small leading-relaxed text-[#666666]">{t.returnsBody}</p>
            </div>
          ) : null}

          {activeTab === "reviews" ? (
            <div role="tabpanel" id="reviews" aria-labelledby="tab-reviews" className="scroll-mt-24">
              <p className="text-eyebrow text-[#666666]">{t.customerReviews}</p>
              <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
                <h2 className="font-display text-3xl font-semibold tracking-tight text-[#0A0A0A]">{t.reviewsTitle}</h2>
                {product.reviewSummary.average != null ? (
                  <p className="inline-flex items-center gap-2 text-price text-[#0A0A0A]">
                    <Star className="size-5 fill-current" aria-hidden />
                    {product.reviewSummary.average.toFixed(1)}
                    <span className="text-small font-normal text-[#666666]">
                      / 5 · {t.reviews(product.reviewSummary.count)}
                    </span>
                  </p>
                ) : null}
              </div>

              {product.reviewSummary.count ? (
                <>
                  <div className="mt-8 max-w-md space-y-2">
                    {[5, 4, 3, 2, 1].map((star) => {
                      const count = product.reviewSummary.distribution[star] ?? 0;
                      const percent =
                        product.reviewSummary.count > 0 ? (count / product.reviewSummary.count) * 100 : 0;
                      return (
                        <div key={star} className="flex items-center gap-3 text-caption text-[#666666]">
                          <span className="inline-flex w-8 items-center gap-1">
                            {star}
                            <Star className="size-3 fill-current" aria-hidden />
                          </span>
                          <div
                            className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#F6F6F4]"
                            role="img"
                            aria-label={`${count} ${t.reviews(count)}`}
                          >
                            <div className="h-full rounded-full bg-[#0A0A0A]" style={{ width: `${percent}%` }} />
                          </div>
                          <span className="w-8 text-end">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-8 grid gap-x-8 gap-y-2 md:grid-cols-2">
                    {product.reviews.map((review) => (
                      <article key={review.id} className="border-t border-[#E5E5E5] py-6">
                        <div className="flex items-center justify-between gap-4">
                          <p className="text-nav text-[#0A0A0A]">{review.firstName ?? t.anonymousReviewer}</p>
                          <span className="inline-flex" aria-label={`${review.rating} / 5`}>
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                aria-hidden
                                className={`size-3.5 ${star <= review.rating ? "fill-current text-[#0A0A0A]" : "text-[#E5E5E5]"}`}
                              />
                            ))}
                          </span>
                        </div>
                        {review.verifiedPurchase ? (
                          <p className="mt-1.5 text-caption text-[#666666]">{t.verified}</p>
                        ) : null}
                        {review.body ? (
                          <p className="mt-3 text-small leading-relaxed text-[#666666]">{review.body}</p>
                        ) : null}
                        {review.imageUrl ? (
                          <img
                            src={review.imageUrl}
                            alt=""
                            loading="lazy"
                            className="mt-3 size-20 rounded-[10px] border border-[#E5E5E5] object-cover"
                          />
                        ) : null}
                      </article>
                    ))}
                  </div>
                </>
              ) : (
                <p className="mt-6 text-body text-[#666666]">{t.noPublishedReviews}</p>
              )}

              <ReviewForm productId={product.id} locale={locale} />
            </div>
          ) : null}
        </div>
      </section>

      {/* ——— Related ——— */}
      {product.related.length ? (
        <section className="mt-20 border-t border-[#E5E5E5] pt-12 lg:mt-24">
          <p className="text-eyebrow text-muted-foreground">{t.relatedEyebrow}</p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-foreground">
            {t.relatedTitle}
          </h2>
          <div className="mt-8">
            <ProductGrid products={product.related} locale={locale} />
          </div>
        </section>
      ) : null}

      {/* ——— Similar (same category, closest price — no store priority) ——— */}
      {product.similar.length ? (
        <section className="mt-20 border-t border-[#E5E5E5] pt-12 lg:mt-24">
          <p className="text-eyebrow text-muted-foreground">{t.similarEyebrow}</p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-foreground">
            {t.similarTitle}
          </h2>
          <div className="mt-8">
            <ProductGrid products={product.similar} locale={locale} />
          </div>
        </section>
      ) : null}

      {/* ——— Viewed together (real co-view events; hidden until data exists) ——— */}
      <ViewedTogether productId={product.id} locale={locale} copy={t} />

      {/* ——— Sticky mobile purchase bar: appears once the main CTAs scroll out of view.
          Sec 43 (#100): while slid off-screen (`ctaVisible`) the bar is `inert`
          as well as `aria-hidden`, so its Buy Now button can never receive
          keyboard focus off-screen. `inert` flips synchronously with the
          tokenized slide transition (`motionTw.duration.base`). ——— */}
      {canPurchase ? (
        <div
          aria-hidden={ctaVisible}
          inert={ctaVisible}
          className={`fixed inset-x-0 bottom-0 z-40 border-t border-[#E5E5E5] bg-white/95 backdrop-blur ${motionTw.transition.transform} ${motionTw.duration.base} motion-reduce:transition-none md:hidden ${
            ctaVisible ? "translate-y-full" : "translate-y-0"
          }`}
        >
          <div
            className="flex items-center gap-3 px-4 pt-3"
            style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
          >
            {currentImage?.url ? (
              <img src={currentImage.url} alt="" loading="lazy" className="size-11 shrink-0 rounded-lg object-cover" />
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="truncate text-small font-medium text-foreground">{product.name}</p>
              <p className="text-small font-semibold text-foreground">{formatPrice(price, locale)}</p>
            </div>
            <Button type="button" onClick={handleBuyNow} className="h-11 shrink-0 bg-[#0A0A0A] font-semibold text-white hover:bg-black">
              {sf.sfBuyNow}
            </Button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

/**
 * "Frequently viewed together" from genuine co-view events. Renders nothing
 * until real data exists -- never a fabricated recommendation.
 */
function ViewedTogether({
  productId,
  locale,
  copy,
}: {
  productId: string;
  locale: SupportedLocale;
  copy: { viewedTogetherEyebrow: string; viewedTogetherTitle: string };
}) {
  const { data } = useQuery({
    queryKey: ["related-products", productId, locale],
    queryFn: () => getRelatedProducts({ data: { productId, limit: 8, locale } }),
    staleTime: 5 * 60_000,
    retry: false,
  });
  if (!data?.hasData || data.products.length === 0) return null;
  return (
    <section className="mt-20 border-t border-[#E5E5E5] pt-12 lg:mt-24">
      <p className="text-eyebrow text-muted-foreground">{copy.viewedTogetherEyebrow}</p>
      <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-foreground">
        {copy.viewedTogetherTitle}
      </h2>
      <div className="mt-8">
        <ProductGrid products={data.products} locale={locale} />
      </div>
    </section>
  );
}
