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
    <fieldset className="border-t border-border py-5 first:border-t-0 first:pt-0">
      <legend className="float-start w-full px-0 text-nav font-medium text-foreground">
        {title}
      </legend>
      <div className="mt-3">{children}</div>
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
    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1 py-1.5 text-small text-foreground transition-colors hover:bg-muted/60">
      <span
        aria-hidden
        className={`grid size-4.5 shrink-0 place-items-center rounded border transition-colors ${
          checked ? "border-foreground bg-foreground text-background" : "border-border bg-background"
        }`}
      >
        {checked ? <Check className="size-3" /> : null}
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

  return (
    <div>
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
              className="h-9"
            />
            <span aria-hidden className="text-muted-foreground">–</span>
            <Input
              inputMode="numeric"
              aria-label={t.maxPrice}
              placeholder={t.maxPrice}
              value={maxInput}
              onChange={(event) => setMaxInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") applyPrice();
              }}
              className="h-9"
            />
            <Button type="button" size="sm" variant="outline" onClick={applyPrice}>
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
                  className={`min-w-10 rounded-lg border px-2.5 py-1.5 text-small transition-colors ${
                    active
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background text-foreground hover:border-foreground/40"
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
                  className={`grid size-9 place-items-center rounded-full border border-border transition-all ${
                    active ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : "hover:scale-110"
                  } ${color.hex ? "" : "bg-muted"}`}
                >
                  {active ? <Check className="size-4 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]" /> : null}
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
