import { useEffect, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getTranslations } from "@/lib/i18n";
import { formatPrice } from "@/lib/i18n/format";
import type { SupportedLocale } from "@/config/platform";
import type {
  BrowseResult,
  CatalogBrand,
  CatalogStore,
  FacetColor,
  FacetSize,
} from "@/lib/catalog.functions";
import { motionTw } from "@/lib/motion-tokens";

export type ShopFilterValues = {
  minPrice?: number | undefined;
  maxPrice?: number | undefined;
  brands: string[];
  stores: string[];
  colors: string[];
  sizes: string[];
  inStock: boolean;
  onSale: boolean;
};

type Facets = Pick<
  BrowseResult,
  "brands" | "stores" | "colors" | "sizes" | "priceBounds"
>;

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="border-t border-border/70 py-5 first:border-t-0 first:pt-1">
      <legend className="float-start w-full px-0 text-[13px] font-bold uppercase tracking-[0.12em] text-foreground">
        {title}
      </legend>
      <div className="mt-3.5">{children}</div>
    </fieldset>
  );
}

function CheckRow({
  checked,
  onChange,
  label,
  count,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  count?: number;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-2 text-small text-foreground transition-colors hover:bg-muted active:bg-muted/70">
      <span
        aria-hidden
        className={`grid size-5 shrink-0 place-items-center rounded-md border-2 transition-all ${
          checked ? "border-foreground bg-foreground text-background" : "border-border bg-card"
        }`}
      >
        {checked ? <Check className="size-3.5" strokeWidth={3} /> : null}
      </span>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={onChange}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined ? (
        <span className="shrink-0 text-caption text-muted-foreground">{count}</span>
      ) : null}
    </label>
  );
}

export function ShopFilters({
  facets,
  values,
  locale,
  onChange,
}: {
  facets: Facets;
  values: ShopFilterValues;
  locale: SupportedLocale;
  onChange: (next: ShopFilterValues) => void;
}) {
  const t = getTranslations(locale).shop;
  const [minInput, setMinInput] = useState(values.minPrice?.toString() ?? "");
  const [maxInput, setMaxInput] = useState(values.maxPrice?.toString() ?? "");

  useEffect(() => {
    setMinInput(values.minPrice?.toString() ?? "");
    setMaxInput(values.maxPrice?.toString() ?? "");
  }, [values.minPrice, values.maxPrice]);

  const parsePrice = (raw: string): number | undefined => {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  };

  const applyPrice = () => {
    const minPrice = parsePrice(minInput);
    const maxPrice = parsePrice(maxInput);
    if (
      minPrice === values.minPrice &&
      maxPrice === values.maxPrice
    )
      return;
    onChange({ ...values, minPrice, maxPrice });
  };

  const hasPriceFacet = facets.priceBounds.max > 0;

  // Active filter count (for the clear-all header)
  const activeCount =
    (values.minPrice !== undefined || values.maxPrice !== undefined ? 1 : 0) +
    values.brands.length +
    values.stores.length +
    values.colors.length +
    values.sizes.length +
    (values.inStock ? 1 : 0) +
    (values.onSale ? 1 : 0);

  const clearAll = () =>
    onChange({
      minPrice: undefined,
      maxPrice: undefined,
      brands: [],
      stores: [],
      colors: [],
      sizes: [],
      inStock: false,
      onSale: false,
    });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-foreground">
          {t.filters}
          {activeCount > 0 ? (
            <span className="ms-2 inline-grid size-5 place-items-center rounded-full bg-foreground text-[11px] font-extrabold tabular-nums text-background">
              {activeCount}
            </span>
          ) : null}
        </p>
        {activeCount > 0 ? (
          <button
            type="button"
            onClick={clearAll}
            className="rounded-full px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {t.clearAll}
          </button>
        ) : null}
      </div>
      {hasPriceFacet ? (
        <Section title={t.price}>
          <div className="flex items-center gap-2">
            <Input
              inputMode="numeric"
              aria-label={t.minPrice}
              placeholder={t.minPrice}
              value={minInput}
              onChange={(event) => setMinInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") applyPrice();
              }}
              className="h-10 rounded-xl border-border bg-background"
            />
            <span aria-hidden className="shrink-0 text-muted-foreground">–</span>
            <Input
              inputMode="numeric"
              aria-label={t.maxPrice}
              placeholder={t.maxPrice}
              value={maxInput}
              onChange={(event) => setMaxInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") applyPrice();
              }}
              className="h-10 rounded-xl border-border bg-background"
            />
            <Button type="button" size="sm" className="h-10 shrink-0 rounded-xl px-4 font-semibold" onClick={applyPrice}>
              {t.apply}
            </Button>
          </div>
          <p className="mt-2 text-caption text-muted-foreground">
            {formatPrice(facets.priceBounds.min, locale)} –{" "}
            {formatPrice(facets.priceBounds.max, locale)}
          </p>
        </Section>
      ) : null}

      <Section title={t.availability}>
        <div className="space-y-0.5">
          <CheckRow
            checked={values.inStock}
            onChange={() => onChange({ ...values, inStock: !values.inStock })}
            label={t.inStockOnly}
          />
          <CheckRow
            checked={values.onSale}
            onChange={() => onChange({ ...values, onSale: !values.onSale })}
            label={t.onSale}
          />
        </div>
      </Section>

      {facets.sizes.length ? (
        <Section title={t.size}>
          <div className="flex flex-wrap gap-2">
            {facets.sizes.map((size: FacetSize) => {
              const active = values.sizes.includes(size.value);
              return (
                <button
                  key={size.id}
                  type="button"
                  aria-pressed={active}
                  title={`${size.label} · ${size.productCount}`}
                  onClick={() => onChange({ ...values, sizes: toggle(values.sizes, size.value) })}
                  className={`min-w-11 rounded-xl border px-3 py-2 text-small font-semibold transition-all ${
                    active
                      ? "border-foreground bg-foreground text-background shadow-sm"
                      : "border-border bg-card text-foreground hover:border-foreground/40 hover:shadow-sm active:scale-95"
                  }`}
                >
                  {size.label}
                </button>
              );
            })}
          </div>
        </Section>
      ) : null}

      {facets.colors.length ? (
        <Section title={t.color}>
          <div className="flex flex-wrap gap-2">
            {facets.colors.map((color: FacetColor) => {
              const active = values.colors.includes(color.slug);
              return (
                <button
                  key={color.id}
                  type="button"
                  aria-pressed={active}
                  aria-label={color.name}
                  title={`${color.name} · ${color.productCount}`}
                  onClick={() => onChange({ ...values, colors: toggle(values.colors, color.slug) })}
                  style={color.hex ? { backgroundColor: color.hex } : undefined}
                  className={`grid size-10 place-items-center rounded-full border border-black/10 shadow-sm ${motionTw.transition.interactive} ${
                    active ? "ring-2 ring-foreground ring-offset-2 ring-offset-background scale-105" : "hover:scale-110"
                  } ${color.hex ? "" : "bg-muted"}`}
                >
                  {active ? <Check className="size-4 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]" strokeWidth={3} /> : null}
                </button>
              );
            })}
          </div>
        </Section>
      ) : null}

      {facets.brands.length ? (
        <Section title={t.brand}>
          <div className="max-h-56 space-y-0.5 overflow-y-auto pe-1">
            {facets.brands.map((brand: CatalogBrand) => (
              <CheckRow
                key={brand.id}
                checked={values.brands.includes(brand.slug)}
                onChange={() => onChange({ ...values, brands: toggle(values.brands, brand.slug) })}
                label={brand.name}
                count={brand.productCount}
              />
            ))}
          </div>
        </Section>
      ) : null}

      {facets.stores.length ? (
        <Section title={t.store}>
          <div className="max-h-56 space-y-0.5 overflow-y-auto pe-1">
            {facets.stores.map((store: CatalogStore) => (
              <CheckRow
                key={store.id}
                checked={values.stores.includes(store.slug)}
                onChange={() => onChange({ ...values, stores: toggle(values.stores, store.slug) })}
                label={store.name}
                count={store.productCount}
              />
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}
