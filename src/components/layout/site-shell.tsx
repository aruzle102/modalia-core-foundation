import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Banknote,
  ChevronDown,
  Clock,
  Facebook,
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
import { type SupportedLocale } from "@/config/platform";
import { localeLabels, persistLocale, type Translation } from "@/lib/i18n";
import {
  getSiteSettings,
  subscribeNewsletter,
  type SiteSettingKey,
} from "@/lib/engagement.functions";
import { useCart } from "@/lib/cart-store";
import { AiAssistantButton, AiAssistantDrawer } from "@/components/marketplace/ai-assistant";

const supportedLocales: SupportedLocale[] = ["en", "fr", "ar"];

const shopSearch = (locale: SupportedLocale, extras?: { focus?: string; view?: string }) => ({
  locale,
  q: "",
  category: "",
  sort: "newest",
  page: 1,
  focus: extras?.focus ?? "",
  view: extras?.view ?? "",
});

/** Switch language: persist the choice, then reload the same page in the new locale. */
function switchLocale(locale: SupportedLocale) {
  persistLocale(locale);
  const url = new URL(window.location.href);
  url.searchParams.set("locale", locale);
  window.location.assign(url.toString());
}

export function SiteHeader({ locale, t }: { locale: SupportedLocale; t: Translation }) {
  const [open, setOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const cart = useCart();

  const navLink = "text-nav text-muted-foreground hover:text-foreground";

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" search={{ locale }} className="text-wordmark text-foreground">
          Modalia
        </Link>

        <nav className="hidden items-center gap-7 lg:flex" aria-label="Main navigation">
          <Link to="/" search={{ locale }} className={navLink}>
            {t.nav.home}
          </Link>
          <Link to="/shop" search={shopSearch(locale)} className={navLink}>
            {t.nav.shop}
          </Link>
          <Link to="/shop" search={shopSearch(locale, { view: "categories" })} className={navLink}>
            {t.nav.categories}
          </Link>
          <Link to="/shop" search={shopSearch(locale, { view: "stores" })} className={navLink}>
            {t.nav.stores}
          </Link>
          <Link to="/become-a-seller" search={{ locale }} className={navLink}>
            {t.nav.sellers}
          </Link>
        </nav>

        <div className="flex items-center gap-1">
          <AiAssistantButton locale={locale} t={t} onOpen={() => setAssistantOpen(true)} />
          <div className="relative hidden sm:block">
            <select
              aria-label="Choose language"
              value={locale}
              onChange={(e) => switchLocale(e.target.value as SupportedLocale)}
              className="h-8 appearance-none bg-transparent pe-5 text-caption text-muted-foreground outline-none"
            >
              {supportedLocales.map((value) => (
                <option key={value} value={value}>
                  {localeLabels[value]}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute end-0 top-2 size-3 text-muted-foreground" />
          </div>

          <Link to="/shop" search={shopSearch(locale, { focus: "search" })}>
            <Button variant="ghost" size="icon" aria-label={t.nav.search}>
              <Search />
            </Button>
          </Link>
          <Link to="/wishlist" search={{ locale }}>
            <Button
              variant="ghost"
              size="icon"
              className="hidden sm:inline-flex"
              aria-label={t.nav.wishlist}
            >
              <Heart />
            </Button>
          </Link>
          <Link to="/cart" search={{ locale }} className="relative">
            <Button variant="ghost" size="icon" aria-label={t.nav.cart}>
              <ShoppingBag />
            </Button>
            {cart.count ? (
              <span className="absolute -end-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-foreground px-1 text-[9px] font-bold text-background">
                {cart.count > 99 ? "99+" : cart.count}
              </span>
            ) : null}
          </Link>
          <NotificationBell
            scope="customer"
            locale={locale}
            t={t.notifications}
            viewAllTo="/notifications"
            preferencesTo="/notifications/preferences"
          />
          <Link to="/auth" search={{ locale }}>
            <Button
              variant="ghost"
              size="icon"
              className="hidden sm:inline-flex"
              aria-label={t.nav.account}
            >
              <UserRound />
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label={open ? t.common.close : t.nav.menu}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X /> : <Menu />}
          </Button>
        </div>
      </div>

      {open ? (
        <nav className="border-t border-border px-4 py-4 lg:hidden" aria-label="Mobile navigation">
          <div className="mx-auto flex max-w-7xl flex-col gap-3">
            <Link to="/" search={{ locale }} onClick={() => setOpen(false)} className="text-nav">
              {t.nav.home}
            </Link>
            <Link
              to="/shop"
              search={shopSearch(locale)}
              onClick={() => setOpen(false)}
              className="text-nav"
            >
              {t.nav.shop}
            </Link>
            <Link
              to="/shop"
              search={shopSearch(locale, { view: "categories" })}
              onClick={() => setOpen(false)}
              className="text-nav"
            >
              {t.nav.categories}
            </Link>
            <Link
              to="/shop"
              search={shopSearch(locale, { view: "stores" })}
              onClick={() => setOpen(false)}
              className="text-nav"
            >
              {t.nav.stores}
            </Link>
            <Link
              to="/track-order"
              search={{ locale }}
              onClick={() => setOpen(false)}
              className="text-nav"
            >
              {t.nav.trackOrder}
            </Link>
            <Link
              to="/wishlist"
              search={{ locale }}
              onClick={() => setOpen(false)}
              className="text-nav"
            >
              {t.nav.wishlist}
            </Link>
            <Link
              to="/cart"
              search={{ locale }}
              onClick={() => setOpen(false)}
              className="text-nav"
            >
              {t.nav.cart}
              {cart.count ? ` (${cart.count})` : ""}
            </Link>
            <Link
              to="/become-a-seller"
              search={{ locale }}
              onClick={() => setOpen(false)}
              className="text-nav"
            >
              {t.nav.sellers}
            </Link>
            <Link
              to="/auth"
              search={{ locale }}
              onClick={() => setOpen(false)}
              className="text-nav"
            >
              {t.nav.account}
            </Link>
            <div className="flex gap-4 pt-2">
              {supportedLocales.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => switchLocale(value)}
                  className={
                    value === locale ? "text-nav text-foreground" : "text-nav text-muted-foreground"
                  }
                >
                  {localeLabels[value]}
                </button>
              ))}
            </div>
          </div>
        </nav>
      ) : null}
      <AiAssistantDrawer locale={locale} t={t} open={assistantOpen} onOpenChange={setAssistantOpen} />
    </header>
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
    <form onSubmit={onSubmit} className="mt-5">
      <p className="text-small font-medium text-foreground">{t.footer.newsletterTitle}</p>
      <div className="mt-2 flex gap-2">
        <Input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t.footer.newsletterPlaceholder}
          aria-label={t.footer.newsletterTitle}
          disabled={pending}
          className="h-10 min-w-0 flex-1"
        />
        <Button type="submit" size="sm" className="h-10 shrink-0" disabled={pending}>
          {pending ? t.common.loading : t.footer.newsletterButton}
        </Button>
      </div>
      {status === "success" ? (
        <p role="status" className="mt-2 text-small text-emerald-600">
          {t.footer.newsletterSuccess}
        </p>
      ) : null}
      {status === "error" ? (
        <p role="alert" className="mt-2 text-small text-destructive">
          {t.footer.newsletterError}
        </p>
      ) : null}
    </form>
  );
}

export function SiteFooter({ locale, t }: { locale: SupportedLocale; t: Translation }) {
  const linkClass = "hover:text-foreground";
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
  const address = setting("contact_address");
  const hours = setting("contact_hours");
  const hasContactInfo = Boolean(email || phone || address || hours);

  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.4fr] lg:px-8">
        <div>
          <Link to="/" search={{ locale }} className="text-wordmark text-foreground">
            Modalia
          </Link>
          <p className="mt-4 max-w-xs text-body text-muted-foreground">{t.footer.statement}</p>
          {socials.length ? (
            <div className="mt-5 flex gap-2">
              {socials.map(({ label, url, Icon }) => (
                <a
                  key={label}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={label}
                  className="grid size-9 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                >
                  <Icon className="size-4" />
                </a>
              ))}
            </div>
          ) : null}
        </div>

        <nav aria-label={t.footer.columns.shop}>
          <p className="text-small font-semibold text-foreground">{t.footer.columns.shop}</p>
          <ul className="mt-4 space-y-3 text-small text-muted-foreground">
            <li>
              <Link to="/shop" search={shopSearch(locale)} className={linkClass}>
                {t.nav.shop}
              </Link>
            </li>
            <li>
              <Link
                to="/shop"
                search={shopSearch(locale, { view: "categories" })}
                className={linkClass}
              >
                {t.nav.categories}
              </Link>
            </li>
            <li>
              <Link
                to="/shop"
                search={shopSearch(locale, { view: "stores" })}
                className={linkClass}
              >
                {t.nav.stores}
              </Link>
            </li>
            <li>
              <Link to="/become-a-seller" search={{ locale }} className={linkClass}>
                {t.footer.links.becomeSeller}
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-label={t.footer.columns.support}>
          <p className="text-small font-semibold text-foreground">{t.footer.columns.support}</p>
          <ul className="mt-4 space-y-3 text-small text-muted-foreground">
            <li>
              <Link to="/help" search={{ locale }} className={linkClass}>
                {t.footer.links.help}
              </Link>
            </li>
            <li>
              <Link to="/shipping" search={{ locale }} className={linkClass}>
                {t.footer.links.shipping}
              </Link>
            </li>
            <li>
              <Link to="/returns" search={{ locale }} className={linkClass}>
                {t.footer.links.returns}
              </Link>
            </li>
            <li>
              <Link to="/track-order" search={{ locale }} className={linkClass}>
                {t.footer.links.trackOrder}
              </Link>
            </li>
            <li>
              <Link to="/contact" search={{ locale }} className={linkClass}>
                {t.footer.links.contact}
              </Link>
            </li>
          </ul>
        </nav>

        <div>
          <p className="text-small font-semibold text-foreground">{t.footer.columns.contact}</p>
          {hasContactInfo ? (
            <ul className="mt-4 space-y-3 text-small text-muted-foreground">
              {email ? (
                <li className="flex items-center gap-2">
                  <Mail className="size-4 shrink-0" />
                  <span className="sr-only">{t.footer.contactEmail}</span>
                  <a href={`mailto:${email}`} className={linkClass}>
                    {email}
                  </a>
                </li>
              ) : null}
              {phone ? (
                <li className="flex items-center gap-2">
                  <Phone className="size-4 shrink-0" />
                  <span className="sr-only">{t.footer.contactPhone}</span>
                  <a href={`tel:${phone.replace(/[\s-]/g, "")}`} dir="ltr" className={linkClass}>
                    {phone}
                  </a>
                </li>
              ) : null}
              {address ? (
                <li className="flex items-center gap-2">
                  <MapPin className="size-4 shrink-0" />
                  <span className="sr-only">{t.footer.contactAddress}</span>
                  <span>{address}</span>
                </li>
              ) : null}
              {hours ? (
                <li className="flex items-center gap-2">
                  <Clock className="size-4 shrink-0" />
                  <span>{hours}</span>
                </li>
              ) : null}
            </ul>
          ) : (
            <p className="mt-4 text-small text-muted-foreground">{t.footer.contactSoon}</p>
          )}
          <NewsletterForm locale={locale} t={t} />
        </div>
      </div>

      <div className="border-t border-border px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 text-caption text-muted-foreground">
          <span>
            © {new Date().getFullYear()} Modalia · {t.footer.rights}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Banknote className="size-4" />
            {t.footer.cashOnDelivery}
          </span>
        </div>
      </div>
    </footer>
  );
}
