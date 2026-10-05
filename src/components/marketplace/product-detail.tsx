import { lazy, Suspense, useEffect, useMemo, useState, type MouseEvent } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Box, Heart, Minus, Plus, ShieldCheck, ShoppingBag, Star, Store, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ProductGrid } from "@/components/marketplace/discovery";
import { formatPrice } from "@/lib/localization";
import { useCart } from "@/lib/cart-store";
import { isWishlisted, toggleWishlist } from "@/lib/wishlist-store";
import { toast } from "sonner";
import { trackDiscovery } from "@/lib/analytics";
import type { SupportedLocale } from "@/config/platform";
import type { ProductDetail } from "@/lib/product.functions";

const ProductViewer3D = lazy(() =>
  import("@/components/commerce/ProductViewer3D").then((m) => ({ default: m.ProductViewer3D })),
);

function discountPercent(price: number, compareAtPrice: number | null): number | null {
  if (!compareAtPrice || compareAtPrice <= price) return null;
  return Math.round(((compareAtPrice - price) / compareAtPrice) * 100);
}

const copy = {
  ar: {
    home: "الرئيسية",
    required: "مطلوب",
    selectOptions: "اختر الخيارات",
    addToBag: "أضف إلى السلة",
    buyNow: "اشترِ الآن",
    addedToBag: "أُضيف إلى السلة",
    saved: "حُفظ في المفضلة",
    removed: "أُزيل من المفضلة",
    saveWishlist: "احفظ في المفضلة",
    removeWishlist: "أزل من المفضلة",
    soldBy: "يُباع من",
    visitStore: "زيارة المتجر",
    noReviews: "لا توجد تقييمات بعد",
    reviews: (count: number) => `${count} ${count === 1 ? "تقييم" : "تقييمات"}`,
    chooseOptions: "اختر الخيارات المطلوبة لعرض التوفر",
    inStock: "متوفر",
    outOfStock: "نفد المخزون",
    onlyLeft: (count: number) => `بقي ${count} فقط`,
    available: (count: number) => `${count} متوفر`,
    decrease: "إنقاص الكمية",
    increase: "زيادة الكمية",
    quantity: "الكمية",
    viewImage: (index: number) => `عرض الصورة ${index}`,
    view3d: "عرض ثلاثي الأبعاد",
    zoomHint: "مرّر فوق الصورة للتكبير",
    storyEyebrow: "التفاصيل",
    storyTitle: "عن هذه القطعة",
    details: "المواصفات",
    shipping: "الشحن والإرجاع",
    shippingBody: "تُؤكَّد خيارات التوصيل وآجالها أثناء إتمام الطلب.",
    returnsBody: "يمكن إرجاع المنتجات غير المستخدمة وفق سياسة المتجر.",
    weight: "الوزن",
    brand: "العلامة",
    category: "الفئة",
    customerReviews: "آراء العملاء",
    reviewsTitle: "التقييمات",
    verified: "عملية شراء موثّقة",
    noPublishedReviews: "لم تُنشر بعد تقييمات معتمدة لهذا المنتج.",
    relatedEyebrow: "اكتشف المزيد",
    relatedTitle: "منتجات ذات صلة",
    secure: "دفع آمن",
    shippedBy: "شحن من الجزائر",
  },
  fr: {
    home: "Accueil",
    required: "Requis",
    selectOptions: "Choisir les options",
    addToBag: "Ajouter au panier",
    buyNow: "Acheter",
    addedToBag: "Ajouté au panier",
    saved: "Ajouté aux favoris",
    removed: "Retiré des favoris",
    saveWishlist: "Ajouter aux favoris",
    removeWishlist: "Retirer des favoris",
    soldBy: "Vendu par",
    visitStore: "Voir la boutique",
    noReviews: "Aucun avis pour le moment",
    reviews: (count: number) => `${count} avis`,
    chooseOptions: "Choisissez les options requises pour voir la disponibilité",
    inStock: "En stock",
    outOfStock: "Rupture de stock",
    onlyLeft: (count: number) => `Plus que ${count}`,
    available: (count: number) => `${count} disponibles`,
    decrease: "Diminuer la quantité",
    increase: "Augmenter la quantité",
    quantity: "Quantité",
    viewImage: (index: number) => `Voir l'image ${index}`,
    view3d: "Vue 3D",
    zoomHint: "Survolez l'image pour zoomer",
    storyEyebrow: "Détails",
    storyTitle: "À propos de cette pièce",
    details: "Caractéristiques",
    shipping: "Livraison et retours",
    shippingBody: "Les options de livraison sont confirmées lors du paiement.",
    returnsBody: "Les produits non utilisés peuvent être retournés selon la politique de la boutique.",
    weight: "Poids",
    brand: "Marque",
    category: "Catégorie",
    customerReviews: "Avis clients",
    reviewsTitle: "Avis",
    verified: "Achat vérifié",
    noPublishedReviews: "Aucun avis approuvé n'a encore été publié pour ce produit.",
    relatedEyebrow: "À découvrir",
    relatedTitle: "Produits similaires",
    secure: "Paiement sécurisé",
    shippedBy: "Expédié depuis l'Algérie",
  },
  en: {
    home: "Home",
    required: "Required",
    selectOptions: "Select options",
    addToBag: "Add to bag",
    buyNow: "Buy now",
    addedToBag: "Added to bag",
    saved: "Saved to wishlist",
    removed: "Removed from wishlist",
    saveWishlist: "Save to wishlist",
    removeWishlist: "Remove from wishlist",
    soldBy: "Sold by",
    visitStore: "Visit store",
    noReviews: "No reviews yet",
    reviews: (count: number) => `${count} ${count === 1 ? "review" : "reviews"}`,
    chooseOptions: "Choose the required options to see availability",
    inStock: "In stock",
    outOfStock: "Out of stock",
    onlyLeft: (count: number) => `Only ${count} left`,
    available: (count: number) => `${count} available`,
    decrease: "Decrease quantity",
    increase: "Increase quantity",
    quantity: "Quantity",
    viewImage: (index: number) => `View image ${index}`,
    view3d: "3D view",
    zoomHint: "Hover the image to zoom",
    storyEyebrow: "Details",
    storyTitle: "About this piece",
    details: "Specifications",
    shipping: "Shipping & returns",
    shippingBody: "Delivery options are confirmed during checkout.",
    returnsBody: "Unused products may be returned under the store's policy.",
    weight: "Weight",
    brand: "Brand",
    category: "Category",
    customerReviews: "Customer reviews",
    reviewsTitle: "Reviews",
    verified: "Verified purchase",
    noPublishedReviews: "No approved reviews have been published for this product yet.",
    relatedEyebrow: "More to discover",
    relatedTitle: "Related products",
    secure: "Secure payment",
    shippedBy: "Ships from Algeria",
  },
} as const;

function canMagnify(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(pointer: fine)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function ProductDetailView({ product, locale }: { product: ProductDetail; locale: SupportedLocale }) {
  const t = copy[locale];
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const [activeMedia, setActiveMedia] = useState(0);
  const [view3d, setView3d] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [zoomOrigin, setZoomOrigin] = useState("50% 50%");
  const [saved, setSaved] = useState(false);
  const cart = useCart();

  useEffect(() => {
    setSaved(isWishlisted(product.id));
    void trackDiscovery("product_view", { productId: product.id });
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
  };

  const toggleSaved = () => {
    const next = toggleWishlist({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      price,
      image: currentImage?.url ?? null,
      storeName: product.store?.name ?? null,
    });
    setSaved(next);
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
      options: Object.fromEntries(
        product.options.map((option) => [
          option.code,
          option.values.find((value) => value.id === selected[option.id])?.label ?? "",
        ]),
      ),
      weightGrams: product.weightGrams ?? undefined,
    });
    if (!silent) {
      void trackDiscovery("cart", { productId: product.id });
      toast.success(t.addedToBag);
    }
  };

  const handleBuyNow = () => {
    addToCart(true);
    void trackDiscovery("cart", { productId: product.id });
    window.location.assign(`/checkout?locale=${locale}`);
  };

  const actionLabel = product.options.length && !complete ? t.selectOptions : t.addToBag;
  const canPurchase = complete && available;
  const descriptionParagraphs = (product.description ?? "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  return (
    <main className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
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
        <section aria-label="Product media" className="min-w-0">
          <div
            className="relative aspect-[4/5] cursor-zoom-in overflow-hidden rounded-xl bg-muted"
            onMouseMove={handleZoomMove}
            onMouseEnter={() => {
              if (canMagnify()) setZoomed(true);
            }}
            onMouseLeave={() => setZoomed(false)}
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
                <ProductViewer3D modelUrl={model3d.url} className="size-full" />
              </Suspense>
            ) : currentImage?.url ? (
              <img
                src={currentImage.url}
                alt={currentImage.alt || product.name}
                sizes="(min-width: 1024px) 55vw, 100vw"
                style={{ transformOrigin: zoomOrigin }}
                className={`size-full object-cover transition-transform duration-300 ease-out motion-reduce:transition-none ${
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
            <span className="pointer-events-none absolute bottom-3 end-3 hidden rounded-full bg-background/85 px-3 py-1 text-caption text-muted-foreground backdrop-blur-sm [@media(pointer:fine)]:block">
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
                  className="size-16 shrink-0 overflow-hidden p-0 aria-pressed:border-foreground aria-pressed:ring-1 aria-pressed:ring-foreground"
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
              {model3d?.url ? (
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
                  className="grid size-16 shrink-0 place-items-center gap-0.5 p-0 aria-pressed:border-foreground aria-pressed:ring-1 aria-pressed:ring-foreground"
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
                <img src={product.store.logoUrl} alt="" className="size-5 rounded-full object-cover" />
              ) : null}
              {t.soldBy} <span className="font-medium text-foreground">{product.store.name}</span>
            </Link>
          ) : null}

          <div className="mt-5 flex items-center gap-2">
            {product.reviewSummary.average != null ? (
              <a href="#reviews" className="inline-flex items-center gap-1.5 text-small text-foreground">
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
                <span className="rounded-full bg-destructive px-2.5 py-1 text-caption font-semibold text-destructive-foreground">
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
                            className={`size-9 rounded-full border border-border transition-all disabled:cursor-not-allowed disabled:opacity-30 motion-reduce:transition-none ${
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
                  <span className="size-2 rounded-full bg-emerald-500" aria-hidden />
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

          <div className="mt-6 flex items-center gap-3">
            <div className="flex h-11 items-center rounded-lg border border-border">
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

          <div className="mt-5 grid grid-cols-2 gap-3">
            <Button type="button" disabled={!canPurchase} onClick={() => addToCart()} className="h-12">
              <ShoppingBag className="size-4" />
              {actionLabel}
            </Button>
            <Button type="button" variant="outline" disabled={!canPurchase} onClick={handleBuyNow} className="h-12">
              {t.buyNow}
            </Button>
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

          <Accordion type="single" collapsible className="mt-6">
            <AccordionItem value="details">
              <AccordionTrigger>{t.details}</AccordionTrigger>
              <AccordionContent>
                <dl className="space-y-2 text-small text-muted-foreground">
                  {product.brand ? (
                    <div className="flex justify-between gap-4">
                      <dt>{t.brand}</dt>
                      <dd className="text-foreground">{product.brand.name}</dd>
                    </div>
                  ) : null}
                  {product.category ? (
                    <div className="flex justify-between gap-4">
                      <dt>{t.category}</dt>
                      <dd className="text-foreground">{product.category.name}</dd>
                    </div>
                  ) : null}
                  {product.weightGrams ? (
                    <div className="flex justify-between gap-4">
                      <dt>{t.weight}</dt>
                      <dd className="text-foreground">{product.weightGrams} g</dd>
                    </div>
                  ) : null}
                </dl>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="shipping">
              <AccordionTrigger>{t.shipping}</AccordionTrigger>
              <AccordionContent className="space-y-2 text-small text-muted-foreground">
                <p>{t.shippingBody}</p>
                <p>{t.returnsBody}</p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>
      </div>

      {/* ——— Editorial storytelling ——— */}
      {descriptionParagraphs.length ? (
        <section className="mt-20 border-t border-border pt-12 lg:mt-24">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
            <div className="lg:sticky lg:top-24 lg:self-start">
              <p className="text-eyebrow text-muted-foreground">{t.storyEyebrow}</p>
              <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-foreground">
                {t.storyTitle}
              </h2>
              {product.store ? (
                <Link
                  to="/store/$slug"
                  params={{ slug: product.store.slug }}
                  search={{ locale }}
                  className="mt-6 inline-flex items-center gap-3 rounded-xl border border-border p-4 transition-colors hover:border-foreground/25"
                >
                  {product.store.logoUrl ? (
                    <img src={product.store.logoUrl} alt="" className="size-10 rounded-full object-cover" />
                  ) : (
                    <span className="grid size-10 place-items-center rounded-full bg-secondary text-small font-semibold">
                      <Store className="size-4" aria-hidden />
                    </span>
                  )}
                  <span>
                    <span className="block text-small font-medium text-foreground">{product.store.name}</span>
                    <span className="mt-0.5 inline-flex items-center gap-1 text-caption text-muted-foreground">
                      {t.visitStore}
                      <ArrowRight className="size-3 rtl:rotate-180" aria-hidden />
                    </span>
                  </span>
                </Link>
              ) : null}
            </div>
            <div className="max-w-3xl space-y-6">
              {descriptionParagraphs.map((paragraph, index) => (
                <p
                  key={index}
                  className={`text-body leading-loose text-muted-foreground ${
                    index === 0
                      ? "text-foreground/90 first-letter:float-start first-letter:me-3 first-letter:font-display first-letter:text-5xl first-letter:font-semibold first-letter:leading-[0.9]"
                      : ""
                  }`}
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* ——— Reviews ——— */}
      <section id="reviews" className="mt-20 scroll-mt-24 border-t border-border pt-12 lg:mt-24">
        <p className="text-eyebrow text-muted-foreground">{t.customerReviews}</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-foreground">{t.reviewsTitle}</h2>
          {product.reviewSummary.average != null ? (
            <p className="inline-flex items-center gap-2 text-price text-foreground">
              <Star className="size-5 fill-current" aria-hidden />
              {product.reviewSummary.average.toFixed(1)}
              <span className="text-small font-normal text-muted-foreground">
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
                  <div key={star} className="flex items-center gap-3 text-caption text-muted-foreground">
                    <span className="inline-flex w-8 items-center gap-1">
                      {star}
                      <Star className="size-3 fill-current" aria-hidden />
                    </span>
                    <div
                      className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
                      role="img"
                      aria-label={`${count} ${t.reviews(count)}`}
                    >
                      <div className="h-full rounded-full bg-foreground" style={{ width: `${percent}%` }} />
                    </div>
                    <span className="w-8 text-end">{count}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-8 grid gap-x-8 gap-y-2 md:grid-cols-2">
              {product.reviews.map((review) => (
                <article key={review.id} className="border-t border-border py-6">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-nav text-foreground">{review.firstName ?? "Modalia"}</p>
                    <span className="inline-flex" aria-label={`${review.rating} / 5`}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          aria-hidden
                          className={`size-3.5 ${star <= review.rating ? "fill-current text-foreground" : "text-muted-foreground/30"}`}
                        />
                      ))}
                    </span>
                  </div>
                  {review.verifiedPurchase ? (
                    <p className="mt-1.5 text-caption text-muted-foreground">{t.verified}</p>
                  ) : null}
                  {review.body ? (
                    <p className="mt-3 text-small leading-relaxed text-muted-foreground">{review.body}</p>
                  ) : null}
                </article>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-6 text-body text-muted-foreground">{t.noPublishedReviews}</p>
        )}
      </section>

      {/* ——— Related ——— */}
      {product.related.length ? (
        <section className="mt-20 border-t border-border pt-12 lg:mt-24">
          <p className="text-eyebrow text-muted-foreground">{t.relatedEyebrow}</p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-foreground">
            {t.relatedTitle}
          </h2>
          <div className="mt-8">
            <ProductGrid products={product.related} locale={locale} />
          </div>
        </section>
      ) : null}
    </main>
  );
}
