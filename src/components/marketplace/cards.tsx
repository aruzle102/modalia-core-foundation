import { Link } from "@tanstack/react-router";
import { Heart, Star } from "lucide-react";
import { formatPrice } from "@/lib/localization";
import type { SupportedLocale } from "@/config/platform";

export function Price({ amount, locale }: { amount: number; locale?: SupportedLocale }) { return <span className="text-price text-foreground">{formatPrice(amount, locale)}</span>; }
export function Rating({ value, label }: { value: number; label?: string }) { return <span className="inline-flex items-center gap-1 text-caption text-muted-foreground"><Star className="size-3.5 fill-current text-foreground" aria-hidden />{value.toFixed(1)}{label ? <span className="sr-only">{label}</span> : null}</span>; }
export function ProductCard({ name, price, slug, locale }: { name: string; price: number; slug: string; locale?: SupportedLocale }) { return <article className="group"><Link to="/product/$slug" params={{ slug }} className="block"><div className="aspect-[4/5] bg-muted transition-transform duration-300 ease-out group-hover:scale-[0.99] motion-reduce:transition-none" /><div className="mt-3 flex items-start justify-between gap-3"><div><h3 className="text-body font-medium text-foreground">{name}</h3><p className="mt-1"><Price amount={price} locale={locale} /></p></div><Heart className="mt-0.5 size-4 text-muted-foreground" aria-hidden /></div></Link></article>; }
export function StoreCard({ name, slug }: { name: string; slug: string }) { return <Link to="/store/$slug" params={{ slug }} className="block border border-border p-5 transition-colors hover:bg-muted"><span className="text-eyebrow text-muted-foreground">Verified store</span><h3 className="mt-3 text-h3 text-foreground">{name}</h3></Link>; }
export function CategoryCard({ name, slug }: { name: string; slug: string }) { return <Link to="/category/$slug" params={{ slug }} className="block border border-border p-5 text-h3 text-foreground transition-colors hover:bg-muted">{name}</Link>; }
