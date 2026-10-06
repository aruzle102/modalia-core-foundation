import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Banknote,
  ChevronDown,
  ChevronRight,
  Clock,
  Facebook,
  Globe,
  Heart,
  Instagram,
  Mail,
  MapPin,
  Menu,
  Music2,
  Phone,
  Search,
  ShoppingBag,
  UserRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { platformConfig, type SupportedLocale } from "@/config/platform";
import { localeLabels, persistLocale, type Translation } from "@/lib/i18n";
import { getSiteSettings, subscribeNewsletter, type SiteSettingKey } from "@/lib/engagement.functions";
import { SiteButtons, useVisibleSiteButtons } from "./site-buttons";
import { getHeaderCategories } from "@/lib/catalog.functions";
import { useCart } from "@/lib/cart-store";
import { AiAssistantButton, AiAssistantDrawer } from "@/components/marketplace/ai-assistant";
import { getPublicIntelligenceConfig } from "@/lib/intelligence-settings.functions";
import { BuyNowHost } from "@/components/marketplace/buy-now";
import { motionTw } from "@/lib/motion-tokens";

const supportedLocales: SupportedLocale[] = ["en", "fr", "ar"];

const shopSearch = (
  locale: SupportedLocale,
  extras?: { focus?: string; view?: "" | "categories" | "stores"; q?: string },
): {
  locale: SupportedLocale;
  q: string;
  category: string;
  sort: "newest" | "price_asc" | "price_desc";
  page: number;
  focus: string;
  view: "" | "categories" | "stores";
  brands: string[];
  stores: string[];
  colors: string[];
  sizes: string[];
  inStock: boolean;
  onSale: boolean;
} => ({
  locale,
  q: extras?.q ?? "",
  category: "",
  sort: "newest",
  page: 1,
  focus: extras?.focus ?? "",
  view: extras?.view ?? "",
  brands: [],
  stores: [],
  colors: [],
  sizes: [],
  inStock: false,
  onSale: false,
});

/** Switch language: persist the choice, then reload the same page in the new locale. */
function switchLocale(locale: SupportedLocale) {
  persistLocale(locale);
  const url = new URL(window.location.href);
  url.searchParams.set("locale", locale);
  window.location.assign(url.toString());
}

/**
 * Announcement bar fed by Admin > Button Control (placement "banner_cta").
 * Renders nothing when no active banner buttons exist.
 */
function BannerBar({ locale }: { locale: SupportedLocale }) {
  const buttons = useVisibleSiteButtons("banner_cta", locale);
  if (buttons.length === 0) return null;
  return (
    <div className="border-b border-border bg-muted/60">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-6 gap-y-1 px-4 py-2 sm:px-6 lg:px-8">
        <SiteButtons
          placement="banner_cta"
          locale={locale}
          variant="link"
          itemClassName="text-small font-medium text-foreground/80 transition-colors hover:text-foreground"
        />
      </div>
    </div>
  );
}

/**
 * Minimal premium site header — SSENSE / Mr Porter register.
 * Left: wordmark. Center: Shop, Categories (dropdown), expanding search.
 * Right: wishlist, cart, account, locale. Sell on Modalia lives in the footer only.
 */
export function SiteHeader({ locale, t }: { locale: SupportedLocale; t: Translation }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const cart = useCart();
  const navigate = useNavigate();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const categoriesRef = useRef<HTMLDivElement>(null);

  const categoriesQuery = useQuery({
    queryKey: ["header-categories", locale],
    queryFn: () => getHeaderCategories({ data: { locale } }),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
  const categories = categoriesQuery.data?.categories ?? [];

  // Smart-shopping toggle (admin Intelligence settings): when disabled, the
  // assistant entry points are hidden entirely — no fake toggle.
  const intelQuery = useQuery({
    queryKey: ["public-intelligence-config", locale],
    queryFn: () => getPublicIntelligenceConfig({ data: { locale } }),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
  const smartShoppingEnabled = intelQuery.data?.smart_shopping_enabled !== false;

  // Subtle elevation once the page scrolls.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Focus the search input when it expands.
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  // Close the categories dropdown on outside click / Escape.
  useEffect(() => {
    if (!categoriesOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (categoriesRef.current && !categoriesRef.current.contains(event.target as Node)) {
        setCategoriesOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCategoriesOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [categoriesOpen]);

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [drawerOpen]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const q = searchValue.trim();
    navigate({ to: "/shop", search: shopSearch(locale, { q }) });
    setSearchOpen(false);
    setDrawerOpen(false);
  };

  // SSENSE-style nav link: tight tracking, animated underline on hover.
  const navLink =
    "group relative text-nav tracking-tight text-foreground/80 transition-colors hover:text-foreground";

  const underline = (
    <span
      aria-hidden="true"
      className={`absolute -bottom-1 start-0 h-px w-0 bg-foreground transition-[width] ${motionTw.duration.base} group-hover:w-full`}
    />
  );

  return (
    <>
      <header
        className={
          "sticky top-0 z-40 border-b bg-background/90 backdrop-blur-md transition-shadow " +
          (scrolled ? "border-border shadow-[0_1px_12px_rgba(0,0,0,0.06)]" : "border-transparent")
        }
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
          {/* Left — wordmark */}
          <Link
            to="/"
            search={{ locale }}
            className="shrink-0 text-wordmark tracking-tight text-foreground"
            aria-label={t.nav.homeLabel}
          >
            Modalia
          </Link>

          {/* Center — primary nav */}
          <nav className="hidden items-center gap-8 lg:flex" aria-label={t.nav.mainNavigation}>
            <Link to="/shop" search={shopSearch(locale)} className={navLink}>
              {t.nav.shop}
              {underline}
            </Link>

            {/* Categories dropdown */}
            <div ref={categoriesRef} className="relative">
              <button
                type="button"
                className={navLink + " inline-flex items-center gap-1"}
                aria-expanded={categoriesOpen}
                aria-haspopup="true"
                onClick={() => setCategoriesOpen((value) => !value)}
              >
                {t.nav.categories}
                <ChevronDown
                  className={
                    `size-3.5 text-muted-foreground ${motionTw.transition.transform} ${motionTw.duration.base} ` +
                    (categoriesOpen ? "rotate-180" : "")
                  }
                  aria-hidden="true"
                />
                {underline}
              </button>
              {categoriesOpen ? (
                <div className="absolute start-0 top-full z-50 mt-3 w-64 border border-border bg-background py-2 shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
                  <Link
                    to="/shop"
                    search={shopSearch(locale, { view: "categories" })}
                    onClick={() => setCategoriesOpen(false)}
                    className="block px-5 py-2.5 text-nav tracking-tight text-foreground transition-colors hover:bg-muted"
                  >
                    {t.nav.categories} — {t.common.viewAll}
                  </Link>
                  <div className="my-1 border-t border-border" aria-hidden="true" />
                  {categories.map((category) => (
                    <Link
                      key={category.slug}
                      to="/shop"
                      search={{ ...shopSearch(locale), category: category.slug }}
                      onClick={() => setCategoriesOpen(false)}
                      className="block px-5 py-2.5 text-nav tracking-tight text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
                    >
                      {category.name}
                    </Link>
                  ))}
                  <div className="my-1 border-t border-border" aria-hidden="true" />
                  <Link
                    to="/shop"
                    search={shopSearch(locale, { view: "stores" })}
                    onClick={() => setCategoriesOpen(false)}
                    className="block px-5 py-2.5 text-nav tracking-tight text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {t.nav.stores}
                  </Link>
                </div>
              ) : null}
            </div>

            {/* Admin-configured quick links (Admin > Button Control, placement "header"). */}
            <SiteButtons placement="header" locale={locale} variant="link" itemClassName={navLink} />

            {/* Expanding search */}
            {searchOpen ? (
              <form onSubmit={submitSearch} className="flex items-center" role="search">
                <Input
                  ref={searchInputRef}
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  placeholder={t.nav.search}
                  aria-label={t.nav.search}
                  className="h-9 w-56 border-0 border-b border-foreground/20 bg-transparent px-0 text-nav tracking-tight shadow-none outline-none placeholder:text-muted-foreground focus-visible:border-foreground focus-visible:ring-0"
                />
                <button
                  type="button"
                  onClick={() => {
                    setSearchOpen(false);
                    setSearchValue("");
                  }}
                  className="ms-2 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={t.common.close}
                >
                  <X className="size-4" />
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className={navLink + " inline-flex items-center gap-1.5"}
                aria-label={t.nav.search}
              >
                <Search className="size-4" aria-hidden="true" />
                {t.nav.search}
                {underline}
              </button>
            )}
          </nav>

          {/* Right — utilities */}
          <div className="ms-auto flex items-center gap-0.5">
            {smartShoppingEnabled ? (
              <AiAssistantButton locale={locale} t={t} onOpen={() => setAssistantOpen(true)} />
            ) : null}

            <div className="relative hidden sm:block">
              <select
                aria-label={t.nav.chooseLanguage}
                value={locale}
                onChange={(e) => switchLocale(e.target.value as SupportedLocale)}
                className="h-9 cursor-pointer appearance-none bg-transparent pe-5 ps-2 text-caption tracking-wide text-muted-foreground outline-none transition-colors hover:text-foreground"
              >
                {supportedLocales.map((value) => (
                  <option key={value} value={value}>
                    {localeLabels[value]}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute end-1 top-1/2 size-3 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
            </div>

            <Button
              asChild
              variant="ghost"
              size="icon"
              className="hidden text-foreground/80 hover:text-foreground sm:inline-flex"
              aria-label={t.nav.wishlist}
            >
              <Link to="/wishlist" search={{ locale }}>
                <Heart className="size-[18px]" />
              </Link>
            </Button>

            <Button
              asChild
              variant="ghost"
              size="icon"
              className="text-foreground/80 hover:text-foreground"
              aria-label={t.nav.cart}
            >
              <Link to="/cart" search={{ locale }} className="relative">
                <ShoppingBag className="size-[18px]" />
                {cart.count ? (
                  <span className="absolute end-0.5 top-0.5 grid min-w-4 place-items-center bg-foreground px-1 text-[9px] font-bold leading-4 text-background">
                    {cart.count > 99 ? "99+" : cart.count}
                  </span>
                ) : null}
              </Link>
            </Button>

            <NotificationBell
              scope="customer"
              locale={locale}
              t={t.notifications}
              viewAllTo="/notifications"
              preferencesTo="/notifications/preferences"
            />

            <Button
              asChild
              variant="ghost"
              size="icon"
              className="hidden text-foreground/80 hover:text-foreground sm:inline-flex"
              aria-label={t.nav.account}
            >
              <Link to="/auth" search={{ locale }}>
                <UserRound className="size-[18px]" />
              </Link>
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="text-foreground/80 hover:text-foreground lg:hidden"
              aria-label={drawerOpen ? t.common.close : t.nav.menu}
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen(true)}
            >
              <Menu className="size-5" />
            </Button>
          </div>
        </div>
      </header>

      <BannerBar locale={locale} />

      {/* Mobile slide-over drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={t.nav.menu}>
          <div
            className="absolute inset-0 bg-foreground/20 backdrop-blur-[2px]"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute end-0 top-0 flex h-full w-[86%] max-w-sm flex-col bg-background shadow-[-8px_0_30px_rgba(0,0,0,0.12)] rtl:shadow-[8px_0_30px_rgba(0,0,0,0.12)]">
            <div className="flex h-16 items-center justify-between border-b border-border px-5">
              <span className="text-wordmark tracking-tight text-foreground">Modalia</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDrawerOpen(false)}
                aria-label={t.common.close}
              >
                <X className="size-5" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-6">
              <form onSubmit={submitSearch} role="search" className="mb-6">
                <div className="flex items-center gap-2 border-b border-foreground/20 pb-2 focus-within:border-foreground">
                  <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <input
                    value={searchValue}
                    onChange={(event) => setSearchValue(event.target.value)}
                    placeholder={t.nav.search}
                    aria-label={t.nav.search}
                    className="w-full bg-transparent text-body tracking-tight outline-none placeholder:text-muted-foreground"
                  />
                </div>
              </form>

              <nav aria-label={t.nav.mobileNavigation}>
                <ul className="space-y-1">
                  <li>
                    <Link
                      to="/shop"
                      search={shopSearch(locale)}
                      onClick={() => setDrawerOpen(false)}
                      className="flex items-center justify-between py-3.5 text-h3 tracking-tight text-foreground"
                    >
                      {t.nav.shop}
                      <ChevronRight
                        className="size-4 text-muted-foreground rtl:rotate-180"
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                  <li>
                    <Link
                      to="/shop"
                      search={shopSearch(locale, { view: "categories" })}
                      onClick={() => setDrawerOpen(false)}
                      className="flex items-center justify-between py-3.5 text-h3 tracking-tight text-foreground"
                    >
                      {t.nav.categories}
                      <ChevronRight
                        className="size-4 text-muted-foreground rtl:rotate-180"
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                  {categories.slice(0, 6).map((category) => (
                    <li key={category.slug}>
                      <Link
                        to="/shop"
                        search={{ ...shopSearch(locale), category: category.slug }}
                        onClick={() => setDrawerOpen(false)}
                        className="block py-2 ps-1 text-nav tracking-tight text-foreground/70 transition-colors hover:text-foreground"
                      >
                        {category.name}
                      </Link>
                    </li>
                  ))}
                  <li>
                    <Link
                      to="/shop"
                      search={shopSearch(locale, { view: "stores" })}
                      onClick={() => setDrawerOpen(false)}
                      className="flex items-center justify-between py-3.5 text-h3 tracking-tight text-foreground"
                    >
                      {t.nav.stores}
                      <ChevronRight
                        className="size-4 text-muted-foreground rtl:rotate-180"
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                  {/* Admin-configured quick links (placement "header"). */}
                  <SiteButtons
                    placement="header"
                    locale={locale}
                    variant="link"
                    listItemClassName=""
                    itemClassName="block py-2 ps-1 text-nav tracking-tight text-foreground/70 transition-colors hover:text-foreground"
                    onNavigate={() => setDrawerOpen(false)}
                  />
                </ul>

                <div className="my-5 border-t border-border" aria-hidden="true" />

                <ul className="space-y-1">
                  <li>
                    <Link
                      to="/wishlist"
                      search={{ locale }}
                      onClick={() => setDrawerOpen(false)}
                      className="flex items-center gap-3 py-2.5 text-nav tracking-tight text-foreground/80"
                    >
                      <Heart className="size-4" aria-hidden="true" />
                      {t.nav.wishlist}
                    </Link>
                  </li>
                  <li>
                    <Link
                      to="/cart"
                      search={{ locale }}
                      onClick={() => setDrawerOpen(false)}
                      className="flex items-center gap-3 py-2.5 text-nav tracking-tight text-foreground/80"
                    >
                      <ShoppingBag className="size-4" aria-hidden="true" />
                      {t.nav.cart}
                      {cart.count ? (
                        <span className="bg-foreground px-1.5 text-[10px] font-bold text-background">
                          {cart.count}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                  <li>
                    <Link
                      to="/auth"
                      search={{ locale }}
                      onClick={() => setDrawerOpen(false)}
                      className="flex items-center gap-3 py-2.5 text-nav tracking-tight text-foreground/80"
                    >
                      <UserRound className="size-4" aria-hidden="true" />
                      {t.nav.account}
                    </Link>
                  </li>
                  <li>
                    <Link
                      to="/track-order"
                      search={{ locale }}
                      onClick={() => setDrawerOpen(false)}
                      className="flex items-center gap-3 py-2.5 text-nav tracking-tight text-foreground/80"
                    >
                      {t.nav.trackOrder}
                    </Link>
                  </li>
                </ul>

                <div className="my-5 border-t border-border" aria-hidden="true" />

                <p className="mb-2 text-caption uppercase tracking-widest text-muted-foreground">
                  {t.footer.languageLabel}
                </p>
                <div className="flex gap-2">
                  {supportedLocales.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => switchLocale(value)}
                      aria-current={value === locale ? "true" : undefined}
                      className={
                        value === locale
                          ? "border border-foreground bg-foreground px-4 py-1.5 text-small font-medium tracking-tight text-background"
                          : "border border-border px-4 py-1.5 text-small tracking-tight text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                      }
                    >
                      {localeLabels[value]}
                    </button>
                  ))}
                </div>
              </nav>
            </div>
          </aside>
        </div>
      ) : null}

      {smartShoppingEnabled ? (
        <AiAssistantDrawer locale={locale} t={t} open={assistantOpen} onOpenChange={setAssistantOpen} />
      ) : null}
    </>
  );
}

function NewsletterForm({ locale, t }: { locale: SupportedLocale; t: Translation }) {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    const value = email.trim();
    if (!value) return;
    setPending(true);
    setStatus("idle");
    try {
      await subscribeNewsletter({ data: { email: value, locale } });
      setStatus("success");
      setEmail("");
    } catch {
      setStatus("error");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-md">
      <p className="text-eyebrow text-white/60">{t.footer.newsletterTitle}</p>
      <div className="mt-3 flex gap-2 border-b border-white/20 pb-2 focus-within:border-white/60 transition-colors">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t.footer.newsletterPlaceholder}
          aria-label={t.footer.newsletterTitle}
          disabled={pending}
          className="h-10 min-w-0 flex-1 bg-transparent text-body text-white placeholder:text-white/35 outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 text-small font-semibold uppercase tracking-widest text-white transition-opacity hover:opacity-70 disabled:opacity-40"
        >
          {pending ? t.common.loading : t.footer.newsletterButton}
        </button>
      </div>
      {status === "success" ? (
        <p role="status" className="mt-2 text-small text-emerald-400">
          {t.footer.newsletterSuccess}
        </p>
      ) : null}
      {status === "error" ? (
        <p role="alert" className="mt-2 text-small text-red-400">
          {t.footer.newsletterError}
        </p>
      ) : null}
    </form>
  );
}

type FooterLink = { to: string; search: Record<string, unknown>; label: string };

function FooterColumn({ heading, links }: { heading: string; links: FooterLink[] }) {
  return (
    <nav aria-label={heading}>
      <p className="text-eyebrow text-white/45">{heading}</p>
      <ul className="mt-5 space-y-3">
        {links.map((link) => (
          <li key={link.label}>
            <Link
              to={link.to}
              search={link.search}
              className="text-small text-white/65 transition-colors hover:text-white"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Footer quick links fed by Admin > Button Control (placement "footer").
 * Renders nothing when no active footer buttons exist.
 */
function FooterButtons({ locale }: { locale: SupportedLocale }) {
  const buttons = useVisibleSiteButtons("footer", locale);
  if (buttons.length === 0) return null;
  return (
    <div className="mt-10 flex flex-wrap gap-x-8 gap-y-2">
      <SiteButtons
        placement="footer"
        locale={locale}
        variant="link"
        itemClassName="text-small text-white/65 transition-colors hover:text-white"
      />
    </div>
  );
}

export function SiteFooter({ locale, t }: { locale: SupportedLocale; t: Translation }) {
  const { data } = useQuery({
    queryKey: ["site-settings"],
    queryFn: () => getSiteSettings(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  const settings = data?.settings;

  const setting = (key: SiteSettingKey) => settings?.[key]?.trim() || "";

  // Social icons only render for networks that have a URL configured in site settings.
  const socials = [
    { label: "Instagram", url: setting("instagram_url"), Icon: Instagram },
    { label: "Facebook", url: setting("facebook_url"), Icon: Facebook },
    { label: "TikTok", url: setting("tiktok_url"), Icon: Music2 },
  ].filter((social) => social.url);

  const email = setting("contact_email");
  const phone = setting("contact_phone");

  const shop = (extras?: Record<string, unknown>) => shopSearch(locale, extras as never);

  return (
    <>
    <footer className="bg-[#141311] text-white">
      {/* ── Top: wordmark + newsletter ─────────────────────────── */}
      <div className="mx-auto max-w-7xl px-4 pt-16 sm:px-6 lg:px-8 lg:pt-20">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
          <Link
            to="/"
            search={{ locale }}
            className="font-display text-[clamp(3rem,8vw,5.5rem)] font-semibold leading-none tracking-tight text-white"
            aria-label="Modalia"
          >
            Modalia
          </Link>
          <NewsletterForm locale={locale} t={t} />
        </div>

        {/* ── Middle: link columns ─────────────────────────────── */}
        <div className="mt-14 grid grid-cols-2 gap-x-6 gap-y-10 border-t border-white/10 pt-12 sm:grid-cols-3 lg:grid-cols-6">
          <FooterColumn
            heading={t.footer.columns.shop}
            links={[
              { to: "/shop", search: shop(), label: t.footer.links.allProducts },
              { to: "/shop", search: shop({ view: "categories" }), label: t.footer.links.categories },
              { to: "/shop", search: { ...shop(), sort: "newest" }, label: t.footer.links.newArrivals },
              { to: "/shop", search: { ...shop(), onSale: true }, label: t.footer.links.onSale },
            ]}
          />
          <FooterColumn
            heading={t.footer.columns.discover}
            links={[
              { to: "/shop", search: shop({ view: "stores" }), label: t.footer.links.allStores },
              { to: "/store/modalia", search: { locale }, label: t.footer.links.officialStore },
              { to: "/wishlist", search: { locale }, label: t.footer.links.wishlist },
            ]}
          />
          <FooterColumn
            heading={t.footer.columns.stores}
            links={[
              { to: "/shop", search: shop({ view: "stores" }), label: t.footer.links.allStores },
              { to: "/store/modalia", search: { locale }, label: t.footer.links.officialStore },
              { to: "/become-a-seller", search: { locale }, label: t.footer.links.becomeSeller },
            ]}
          />
          <FooterColumn
            heading={t.footer.columns.company}
            links={[
              { to: "/about", search: { locale }, label: t.footer.links.about },
              { to: "/contact", search: { locale }, label: t.footer.links.contact },
            ]}
          />
          <FooterColumn
            heading={t.footer.columns.help}
            links={[
              { to: "/help", search: { locale }, label: t.footer.links.help },
              { to: "/shipping", search: { locale }, label: t.footer.links.shipping },
              { to: "/returns", search: { locale }, label: t.footer.links.returns },
              { to: "/track-order", search: { locale }, label: t.footer.links.trackOrder },
            ]}
          />
          <FooterColumn
            heading={t.footer.columns.legal}
            links={[
              { to: "/privacy", search: { locale }, label: t.footer.links.privacy },
              { to: "/terms", search: { locale }, label: t.footer.links.terms },
              { to: "/seller/login", search: { locale }, label: t.footer.links.sellerLogin },
            ]}
          />
        </div>

        {/* ── Contact (admin-editable, subtle) ─────────────────── */}
        {email || phone ? (
          <div className="mt-10 flex flex-wrap gap-x-8 gap-y-2 text-small text-white/45">
            {email ? (
              <a href={`mailto:${email}`} className="transition-colors hover:text-white">
                {email}
              </a>
            ) : null}
            {phone ? (
              <a href={`tel:${phone.replace(/[\s-]/g, "")}`} dir="ltr" className="transition-colors hover:text-white">
                {phone}
              </a>
            ) : null}
          </div>
        ) : null}
        {/* ── Admin-configured quick links (placement "footer") ── */}
        <FooterButtons locale={locale} />
      </div>

      {/* ── Bottom bar ─────────────────────────────────────────── */}
      <div className="mt-14 border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-4 px-4 py-6 sm:px-6 lg:px-8">
          <span className="text-caption text-white/40">
            © {new Date().getFullYear()} Modalia · {t.footer.rights}
          </span>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <span className="inline-flex items-center gap-1.5 text-caption text-white/40">
              <Banknote className="size-3.5" aria-hidden="true" />
              {t.footer.cashOnDelivery}
            </span>
            <span className="text-caption font-semibold tracking-widest text-white/40">
              {platformConfig.market.currency}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Globe className="size-3.5 text-white/40" aria-hidden="true" />
              <span className="sr-only">{t.footer.languageLabel}</span>
              <select
                aria-label={t.footer.languageLabel}
                value={locale}
                onChange={(e) => switchLocale(e.target.value as SupportedLocale)}
                className="bg-transparent text-caption text-white/60 outline-none [&>option]:text-black"
              >
                {supportedLocales.map((value) => (
                  <option key={value} value={value}>
                    {localeLabels[value]}
                  </option>
                ))}
              </select>
            </span>
            {socials.length ? (
              <div className="flex items-center gap-1">
                {socials.map(({ label, url, Icon }) => (
                  <a
                    key={label}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={label}
                    className="grid size-8 place-items-center text-white/45 transition-colors hover:text-white"
                  >
                    <Icon className="size-4" />
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </footer>
    {/* Buy-now / quick-add variant-sheet host: claims startBuyNow requests
        raised anywhere on the page (product cards, product detail). */}
    <BuyNowHost locale={locale} />
  </>
  );
}
