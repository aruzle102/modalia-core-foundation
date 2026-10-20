/**
 * Amazon/AliExpress-style homepage layout.
 * Left sidebar with categories, main area with products grid.
 */
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { ProductCard } from "@/components/marketplace/discovery";

type Category = {
  id: string;
  name: string;
  slug: string;
  imageUrl?: string | null;
};

type Product = {
  id: string;
  [key: string]: unknown;
};

export function MarketplaceLayout({
  categories,
  products,
  locale,
}: {
  categories: Category[];
  products: Product[];
  locale: "fr" | "en" | "ar";
}) {
  return (
    <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6 sm:py-14 lg:px-10">
      <div className="flex gap-6 lg:gap-10">
        {/* Sidebar - Categories */}
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="sticky top-24 rounded-2xl border border-border/60 bg-card p-5">
            <h2 className="mb-3 text-sm font-semibold">Categories</h2>
            <nav className="space-y-1">
              <Link
                to="/shop"
                search={{ locale } as any}
                className="flex items-center justify-between rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-muted"
              >
                All products
                <ChevronRight className="h-4 w-4 text-muted-foreground rtl:rotate-180" />
              </Link>
              {categories.map((cat) => (
                <Link
                  key={cat.id}
                  to="/shop"
                  search={{ locale, category: cat.slug } as any}
                  className="flex items-center justify-between rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-muted"
                >
                  <span className="truncate">{cat.name}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground rtl:rotate-180" />
                </Link>
              ))}
            </nav>
          </div>
        </aside>

        {/* Main - Products grid */}
        <div className="min-w-0 flex-1">
          {/* Mobile categories - horizontal scroll */}
          <div className="mb-5 flex gap-2 overflow-x-auto pb-2 lg:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {categories.map((cat) => (
              <Link
                key={cat.id}
                to="/shop"
                search={{ locale, category: cat.slug } as any}
                className="shrink-0 rounded-full border border-border/60 bg-card px-3.5 py-1.5 text-sm transition-colors hover:bg-muted"
              >
                {cat.name}
              </Link>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
            {products.map((product: any) => (
              <ProductCard key={product.id} product={product} locale={locale} />
            ))}
          </div>

          {products.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              No products available.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
