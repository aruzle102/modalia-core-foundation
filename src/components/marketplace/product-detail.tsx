import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Heart, Minus, Plus, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ProductGrid } from "@/components/marketplace/discovery";
import { formatPrice } from "@/lib/localization";
import type { SupportedLocale } from "@/config/platform";
import type { ProductDetail } from "@/lib/product.functions";

function discount(price: number, compareAtPrice: number | null) { return compareAtPrice && compareAtPrice > price ? Math.round(((compareAtPrice - price) / compareAtPrice) * 100) : null; }

export function ProductDetailView({ product, locale }: { product: ProductDetail; locale: SupportedLocale }) {
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const [activeMedia, setActiveMedia] = useState(0);
  const [saved, setSaved] = useState(false);
  const selectedValues = Object.values(selected);
  const complete = product.options.filter((option) => option.required).every((option) => selected[option.id]);
  const matchingVariant = useMemo(() => product.variants.find((variant) => selectedValues.every((value) => variant.optionValueIds.includes(value)) && (complete ? variant.optionValueIds.length === selectedValues.length : true)), [complete, product.variants, selectedValues]);
  const price = matchingVariant?.price ?? product.price;
  const compareAtPrice = matchingVariant?.compareAtPrice ?? product.compareAtPrice;
  const available = product.options.length ? Boolean(matchingVariant?.available) : product.variants.length ? Boolean(product.variants.find((variant) => variant.available)) : false;
  const stock = matchingVariant?.stock ?? product.variants.find((variant) => variant.available)?.stock ?? 0;
  const maxQuantity = Math.max(1, Math.min(stock, matchingVariant?.maxPurchaseQuantity ?? stock));
  const sale = discount(price, compareAtPrice);
  const media = product.media.filter((item) => !selectedValues.length || !item.colorId || selectedValues.includes(item.colorId));
  const currentMedia = media[activeMedia] ?? media[0];
  const updateOption = (optionId: string, valueId: string) => { setSelected((current) => ({ ...current, [optionId]: valueId })); setQuantity(1); setActiveMedia(0); };
  const actionLabel = product.options.length && !complete ? "Select options" : "Add to cart";

  return <main className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8">
    <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 text-caption text-muted-foreground"><Link to="/" search={{ locale }}>Home</Link><span aria-hidden>/</span>{product.category ? <><Link to="/category/$slug" params={{ slug: product.category.slug }} search={{ locale }}>{product.category.name}</Link><span aria-hidden>/</span></> : null}<span className="text-foreground">{product.name}</span></nav>
    <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.8fr)] lg:items-start">
      <section aria-label="Product media" className="min-w-0">
        <div className="aspect-[4/5] overflow-hidden bg-muted">{currentMedia?.url ? <img src={currentMedia.url} alt={currentMedia.alt || product.name} className="size-full object-cover" sizes="(min-width: 1024px) 55vw, 100vw" /> : <div className="flex size-full items-end p-7 text-body text-muted-foreground">Modalia<br />{product.name}</div>}</div>
        {media.length > 1 ? <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{media.map((item, index) => <button key={item.id} type="button" aria-label={`View image ${index + 1}`} aria-pressed={index === activeMedia} onClick={() => setActiveMedia(index)} className="size-16 shrink-0 overflow-hidden border border-border data-[active=true]:border-foreground"><span data-active={index === activeMedia}>{item.url ? <img src={item.url} alt="" loading="lazy" className="size-full object-cover" /> : <span className="block size-full bg-muted" />}</span></button>)}</div> : null}
      </section>
      <section className="lg:sticky lg:top-24">
        <div className="flex items-start justify-between gap-5"><div>{product.brand ? <p className="text-eyebrow text-muted-foreground">{product.brand.name}</p> : null}<h1 className="mt-2 text-display text-foreground">{product.name}</h1></div><Button type="button" variant="outline" size="icon" aria-label={saved ? "Remove from wishlist" : "Save to wishlist"} onClick={() => setSaved((value) => !value)}><Heart className={saved ? "fill-current" : ""} /></Button></div>
        {product.store ? <Link to="/store/$slug" params={{ slug: product.store.slug }} className="mt-3 inline-flex items-center gap-2 text-small text-muted-foreground hover:text-foreground">{product.store.logoUrl ? <img src={product.store.logoUrl} alt="" className="size-5 rounded-full object-cover" /> : null}Sold by {product.store.name}</Link> : null}
        <div className="mt-6 flex items-end gap-3">{product.reviewSummary.average ? <span className="inline-flex items-center gap-1 text-small text-foreground"><Star className="size-4 fill-current" />{product.reviewSummary.average.toFixed(1)} <span className="text-muted-foreground">({product.reviewSummary.count})</span></span> : <span className="text-small text-muted-foreground">No reviews yet</span>}</div>
        <div className="mt-6 flex items-baseline gap-3"><p className="text-display text-foreground">{formatPrice(price, locale)}</p>{compareAtPrice && compareAtPrice > price ? <><p className="text-body text-muted-foreground line-through">{formatPrice(compareAtPrice, locale)}</p><span className="text-caption font-medium text-foreground">−{sale}%</span></> : null}</div>
        {product.shortDescription ? <p className="mt-5 text-body text-muted-foreground">{product.shortDescription}</p> : null}
        <div className="mt-8 space-y-6">{product.options.map((option) => <fieldset key={option.id}><legend className="text-nav text-foreground">{option.name}{option.required ? <span className="text-muted-foreground"> · Required</span> : null}</legend><div className="mt-3 flex flex-wrap gap-2">{option.values.map((value) => <Button key={value.id} type="button" variant={selected[option.id] === value.id ? "default" : "outline"} size="sm" disabled={!value.available} onClick={() => updateOption(option.id, value.id)} className="min-w-10">{value.hex ? <span aria-hidden className="size-3 rounded-full border border-border" style={{ backgroundColor: value.hex }} /> : null}{value.label}</Button>)}</div></fieldset>)}</div>
        <div className="mt-8 border-y border-border py-5"><p className={available ? "text-small text-foreground" : "text-small text-muted-foreground"}>{!complete ? "Choose required options to see availability" : available ? "In stock" : "Unavailable"}</p>{complete && available && stock <= (matchingVariant?.lowStockThreshold ?? 0) ? <p className="mt-1 text-small text-muted-foreground">Only {stock} left</p> : null}</div>
        <div className="mt-6 flex items-center gap-3"><div className="flex h-10 items-center border border-border"><Button type="button" variant="ghost" size="icon" aria-label="Decrease quantity" disabled={quantity <= 1} onClick={() => setQuantity((value) => Math.max(1, value - 1))}><Minus /></Button><output className="w-8 text-center text-small" aria-label="Quantity">{quantity}</output><Button type="button" variant="ghost" size="icon" aria-label="Increase quantity" disabled={!available || quantity >= maxQuantity} onClick={() => setQuantity((value) => Math.min(maxQuantity, value + 1))}><Plus /></Button></div><span className="text-caption text-muted-foreground">{available ? `${stock} available` : ""}</span></div>
        <div className="mt-5 grid grid-cols-2 gap-3"><Button type="button" disabled={!complete || !available}>{actionLabel}</Button><Button type="button" variant="outline" disabled={!complete || !available}>Buy now</Button></div>
        <Accordion type="single" collapsible className="mt-8"><AccordionItem value="description"><AccordionTrigger>Description</AccordionTrigger><AccordionContent className="text-small text-muted-foreground">{product.description ?? "Product details will be provided by the store."}</AccordionContent></AccordionItem><AccordionItem value="details"><AccordionTrigger>Details</AccordionTrigger><AccordionContent className="text-small text-muted-foreground">{product.weightGrams ? `Weight: ${product.weightGrams} g` : "Product details will be provided by the store."}</AccordionContent></AccordionItem><AccordionItem value="shipping"><AccordionTrigger>Shipping</AccordionTrigger><AccordionContent className="text-small text-muted-foreground">Delivery options are confirmed during checkout.</AccordionContent></AccordionItem></Accordion>
      </section>
    </div>
    <section className="mt-18 border-t border-border pt-12"><div className="flex items-end justify-between gap-5"><div><p className="text-eyebrow text-muted-foreground">Customer reviews</p><h2 className="mt-2 text-h3 text-foreground">Reviews</h2></div>{product.reviewSummary.average ? <p className="text-price text-foreground">{product.reviewSummary.average.toFixed(1)} / 5</p> : null}</div>{product.reviews.length ? <div className="mt-7 grid gap-5 md:grid-cols-2">{product.reviews.map((review) => <article key={review.id} className="border-t border-border pt-5"><div className="flex items-center justify-between"><p className="text-nav text-foreground">{review.firstName ?? "Modalia customer"}</p><span className="inline-flex items-center gap-1 text-caption"><Star className="size-3 fill-current" />{review.rating}</span></div>{review.verifiedPurchase ? <p className="mt-2 text-caption text-muted-foreground">Verified purchase</p> : null}{review.body ? <p className="mt-3 text-small text-muted-foreground">{review.body}</p> : null}</article>)}</div> : <p className="mt-6 text-body text-muted-foreground">No approved reviews have been published for this product yet.</p>}</section>
    {product.related.length ? <section className="mt-18 border-t border-border pt-12"><p className="text-eyebrow text-muted-foreground">More to discover</p><h2 className="mt-2 text-h3 text-foreground">Related products</h2><div className="mt-7"><ProductGrid products={product.related} locale={locale} /></div></section> : null}
  </main>;
}