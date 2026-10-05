import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { BadgeCheck } from "lucide-react";
import { CategoryRail, ProductGrid } from "@/components/marketplace/discovery";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { getStoreDetail, type StoreSectionView } from "@/lib/store.functions";
import { breadcrumbJsonLd, canonicalUrl, onlineStoreJsonLd, pageHead } from "@/lib/seo";
import type { CatalogProduct } from "@/lib/catalog.functions";
import { accentById } from "@/lib/store-settings";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";
import { track } from "@/lib/analytics";

const storeQuery=(slug:string,locale:string)=>queryOptions({queryKey:["store",slug,locale],queryFn:()=>getStoreDetail({data:{slug,locale}})});
export const Route = createFileRoute("/store/$slug")({validateSearch:(search:Record<string,unknown>)=>({locale:getLocale(typeof search["locale"]==="string"?search["locale"]:undefined)}),loaderDeps:({search})=>({locale:search.locale}),loader:({context,params,deps})=>context.queryClient.ensureQueryData(storeQuery(params.slug,deps.locale)),head: ({ params, loaderData }) => {
      const path = `/store/${params.slug}`;
      const store = loaderData;
      const name = store?.name ?? params.slug;
      return pageHead({
        title: `${name} — Modalia`,
        description: store?.description
          ? `${name} on Modalia: ${store.description}`
          : `Explore ${name}, an independent store on Modalia. Cash on delivery across Algeria.`,
        path,
        image: store?.logoUrl ?? store?.bannerUrl ?? null,
        jsonLd: store
          ? [
              onlineStoreJsonLd(store, canonicalUrl(path)),
              breadcrumbJsonLd([
                { name: "Home", url: canonicalUrl("/") },
                { name: name, url: canonicalUrl(path) },
              ]),
            ]
          : [],
      });
    },component: StorePage });
function sectionProducts(section: StoreSectionView, store: NonNullable<Awaited<ReturnType<typeof getStoreDetail>>>): CatalogProduct[] {
  switch (section.kind) {
    case "featured": return store.featuredProducts;
    case "new": return store.newProducts;
    case "offers": return store.offerProducts;
    case "best": return store.bestProducts;
    default: return [];
  }
}

function StorePage(){const {slug}=Route.useParams();const {locale}=Route.useSearch();const {data:store}=useSuspenseQuery(storeQuery(slug,locale));const t=getTranslations(locale);const storeId=store?.id;useEffect(()=>{if(storeId)track("store_view",{entityType:"store",entityId:storeId,metadata:{slug}});},[storeId]);if(!store)return <div dir={localeDirections[locale]} className="min-h-screen bg-background"><SiteHeader locale={locale} t={t}/><main id="main-content" tabIndex={-1} className="mx-auto max-w-7xl px-4 py-16 text-center"><h1 className="text-display">{t.store.unavailableTitle}</h1><p className="mt-3 text-body text-muted-foreground">{t.store.unavailableText}</p></main><SiteFooter locale={locale} t={t}/></div>;const accent=accentById(store.accent);return <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background"><SiteHeader locale={locale} t={t}/>{store.announcement?<div role="note" style={{backgroundColor:accent.swatch,color:accent.ink}}><p className="mx-auto max-w-7xl px-4 py-2 text-center text-small font-medium sm:px-6 lg:px-8">{store.announcement}</p></div>:null}<main><section className="border-b border-border"><div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8"><div className="relative h-52 overflow-hidden bg-secondary sm:h-72">{store.bannerUrl?<img src={store.bannerUrl} alt="" className="size-full object-cover"/>:<div className="absolute inset-0 store-sheen"/>}</div><div className="relative -mt-12 flex flex-wrap items-end gap-5 px-5 sm:px-8"><div className="grid size-24 place-items-center overflow-hidden rounded-full border-4 border-background bg-card text-3xl font-semibold">{store.logoUrl?<img src={store.logoUrl} alt="" className="size-full object-cover"/>:store.name.slice(0,1)}</div><div className="pb-2"><div className="flex items-center gap-2"><h1 className="text-display">{store.name}</h1>{store.verified?<BadgeCheck className="size-5 text-foreground" aria-label={t.store.verifiedStore}/>:null}</div><p className="mt-1 text-small text-muted-foreground">{t.store.independent}</p></div></div><div className="max-w-2xl px-5 pb-2 pt-6 sm:px-8">{store.description?<p className="text-body text-muted-foreground">{store.description}</p>:null}{store.categories.length?<p className="mt-5 text-caption text-muted-foreground">{store.categories.join(" · ")}</p>:null}</div></div></section>{store.sections.map((section)=>{if(section.kind==="categories"){if(!store.featuredCategories.length)return null;return <section key={section.id} className="border-b border-border"><div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8"><p className="text-eyebrow text-muted-foreground">{t.store.eyebrow}</p><h2 className="mt-2 text-h3">{section.title}</h2><div className="mt-8"><CategoryRail categories={store.featuredCategories} locale={locale}/></div></div></section>;}const products=sectionProducts(section,store);if(!products.length)return null;return <section key={section.id} className="border-b border-border"><div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8"><p className="text-eyebrow text-muted-foreground">{t.store.eyebrow}</p><h2 className="mt-2 text-h3">{section.title}</h2><div className="mt-8"><ProductGrid products={products} locale={locale}/></div></div></section>;})}<section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8"><p className="text-eyebrow text-muted-foreground">{t.store.catalogueEyebrow}</p><h2 className="mt-2 text-h3">{t.store.allProducts}</h2><div className="mt-8"><ProductGrid products={store.products} locale={locale} emptyTitle={t.store.emptyTitle} emptyText={t.store.emptyText}/></div></section></main><SiteFooter locale={locale} t={t}/></div>}
