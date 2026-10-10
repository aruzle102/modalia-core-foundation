import { VerifiedSellerBadge } from "@/components/marketplace/StoreBadges";
import { CategoryRail, ProductCard, ProductGrid } from "@/components/marketplace/discovery";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { accentById } from "@/lib/store-settings";
import type { StoreDetail, StoreSectionView } from "@/lib/store.functions";
import type { CatalogProduct } from "@/lib/catalog.functions";
import type { SupportedLocale } from "@/config/platform";
import { localeDirections, type Translation } from "@/lib/i18n";

function sectionProducts(section: StoreSectionView, store: StoreDetail): CatalogProduct[] {
  switch (section.kind) {
    case "featured":
      return store.featuredProducts;
    case "new":
      return store.newProducts;
    case "offers":
      return store.offerProducts;
    case "best":
      return store.bestProducts;
    default:
      return [];
  }
}

const SOCIAL_ORDER = ["instagram", "facebook", "tiktok", "website"] as const;

/**
 * Presentational public storefront, shared by the `/store/$slug` route and the
 * seller Studio's live preview. Pure render from a `StoreDetail` — no data
 * fetching, no analytics, no routing side effects. The route wrapper owns
 * loading/error/SEO/tracking; the preview feeds it draft state.
 */
export function StoreFront({
  store,
  locale,
  t,
}: {
  store: StoreDetail;
  locale: SupportedLocale;
  t: Translation;
}) {
  const accent = accentById(store.accent);
  const v8 = t.sellerStoreV8.storefront;
  const socials = SOCIAL_ORDER.map((key) => ({
    key,
    label: v8.socialLabels[key],
    href: store.socialLinks[key],
  })).filter((entry) => entry.href.length > 0);
  const hasContact = Boolean(store.contactEmail || store.contactPhone || socials.length);

  const stats = [
    { value: String(store.products.length), label: t.store.official.statsProducts },
    ...(store.categories.length
      ? [{ value: String(store.categories.length), label: t.store.official.statsCategories }]
      : []),
    ...(store.collections.length
      ? [{ value: String(store.collections.length), label: t.store.collectionsEyebrow }]
      : []),
  ];

  return (
    <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background">
      <SiteHeader locale={locale} t={t} />
      {store.announcement ? (
        <div role="note" style={{ backgroundColor: accent.swatch, color: accent.ink }}>
          <p className="mx-auto max-w-7xl px-4 py-2 text-center text-small font-medium sm:px-6 lg:px-8">
            {store.announcement}
          </p>
        </div>
      ) : null}
      <main id="main-content" tabIndex={-1}>
        {/* ——— Brand hero ——— */}
        <section className="relative overflow-hidden bg-secondary">
          {store.bannerUrl ? (
            <img src={store.bannerUrl} alt="" className="absolute inset-0 size-full object-cover" />
          ) : (
            <div className="absolute inset-0 store-sheen" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-black/10" aria-hidden />
          <div className="relative mx-auto flex max-w-7xl flex-col justify-end px-4 pb-10 pt-40 sm:px-6 sm:pt-52 lg:px-8">
            <div className="flex flex-wrap items-center gap-5">
              <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-full border-4 border-white/70 bg-card text-3xl font-semibold text-foreground shadow-xl sm:size-28">
                {store.logoUrl ? (
                  <img src={store.logoUrl} alt="" className="size-full object-cover" />
                ) : (
                  store.name.slice(0, 1)
                )}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                    {store.name}
                  </h1>
                  <VerifiedSellerBadge verified={store.verified} label={t.store.verifiedStore} />
                </div>
                <p className="mt-2 text-small text-white/70">
                  {store.categoryName ? `${store.categoryName} · ` : ""}
                  {store.official ? t.store.officialTagline : t.store.independent}
                </p>
              </div>
            </div>
            {stats.length ? (
              <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4">
                {stats.map((stat) => (
                  <div key={stat.label} className="flex flex-col">
                    <dt className="order-2 mt-1 text-caption text-white/60">{stat.label}</dt>
                    <dd className="order-1 font-display text-2xl font-semibold text-white">{stat.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        </section>

        {/* ——— Story ——— */}
        {store.description ? (
          <section className="border-b border-border">
            <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[minmax(0,0.55fr)_minmax(0,1fr)] lg:px-8 lg:py-20">
              <div>
                <p className="text-eyebrow text-muted-foreground">{t.store.eyebrow}</p>
                <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-foreground">
                  {store.official ? t.store.official.storyTitle : t.store.aboutTitle}
                </h2>
              </div>
              <div>
                <p className="max-w-2xl text-body leading-loose text-muted-foreground">{store.description}</p>
                {store.categories.length ? (
                  <p className="mt-6 text-caption text-muted-foreground">{store.categories.join(" · ")}</p>
                ) : null}
                {hasContact ? (
                  <div className="mt-8 border-t border-border pt-6">
                    <p className="text-eyebrow text-muted-foreground">{v8.contactEyebrow}</p>
                    <dl className="mt-4 space-y-2.5">
                      {store.contactEmail ? (
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <dt className="text-caption text-muted-foreground">{v8.contactEmail}</dt>
                          <dd>
                            <a
                              href={`mailto:${store.contactEmail}`}
                              dir="ltr"
                              className="link-underline text-small font-medium text-foreground"
                            >
                              {store.contactEmail}
                            </a>
                          </dd>
                        </div>
                      ) : null}
                      {store.contactPhone ? (
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <dt className="text-caption text-muted-foreground">{v8.contactPhone}</dt>
                          <dd>
                            <a
                              href={`tel:${store.contactPhone.replace(/[^+\d]/g, "")}`}
                              dir="ltr"
                              className="link-underline text-small font-medium text-foreground"
                            >
                              {store.contactPhone}
                            </a>
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                    {socials.length ? (
                      <div className="mt-4">
                        <p className="text-caption text-muted-foreground">{v8.followLabel}</p>
                        <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
                          {socials.map((entry) => (
                            <li key={entry.key}>
                              <a
                                href={entry.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="link-underline text-small font-medium text-foreground"
                              >
                                {entry.label}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {/* ——— Curated collections ——— */}
        {store.collections.map((collection) => (
          <section key={collection.id} className="border-b border-border bg-secondary/40">
            <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="max-w-2xl">
                  <p className="text-eyebrow text-muted-foreground">{t.store.collectionsEyebrow}</p>
                  <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                    {collection.title}
                  </h2>
                  {collection.subtitle ? (
                    <p className="mt-3 text-body text-muted-foreground">{collection.subtitle}</p>
                  ) : null}
                </div>
              </div>
              <div className="-mx-4 mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
                {collection.products.map((product) => (
                  <div key={product.id} className="w-44 shrink-0 snap-start sm:w-56">
                    <ProductCard product={product} locale={locale} />
                  </div>
                ))}
              </div>
            </div>
          </section>
        ))}

        {/* ——— Store sections ——— */}
        {store.sections.map((section) => {
          if (section.kind === "categories") {
            if (!store.featuredCategories.length) return null;
            return (
              <section key={section.id} className="border-b border-border">
                <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
                  <p className="text-eyebrow text-muted-foreground">{t.store.eyebrow}</p>
                  <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-foreground">
                    {section.title}
                  </h2>
                  <div className="mt-8">
                    <CategoryRail categories={store.featuredCategories} locale={locale} />
                  </div>
                </div>
              </section>
            );
          }
          const products = sectionProducts(section, store);
          if (!products.length) return null;
          return (
            <section key={section.id} className="border-b border-border">
              <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
                <p className="text-eyebrow text-muted-foreground">{t.store.eyebrow}</p>
                <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-foreground">
                  {section.title}
                </h2>
                <div className="mt-8">
                  <ProductGrid products={products} locale={locale} />
                </div>
              </div>
            </section>
          );
        })}

        {/* ——— Catalogue ——— */}
        <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
          <p className="text-eyebrow text-muted-foreground">{t.store.catalogueEyebrow}</p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-foreground">
            {t.store.allProducts}
          </h2>
          <div className="mt-8">
            <ProductGrid
              products={store.products}
              locale={locale}
              emptyTitle={t.store.emptyTitle}
              emptyText={t.store.emptyText}
            />
          </div>
        </section>
      </main>
      <SiteFooter locale={locale} t={t} />
    </div>
  );
}
