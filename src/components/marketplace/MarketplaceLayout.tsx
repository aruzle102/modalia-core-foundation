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
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex gap-6">
        {/* Sidebar - Categories */}
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-20 rounded-lg border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Categories</h2>
            <nav className="space-y-1">
              <Link
                to="/shop"
                search={{ locale } as any}
                className="flex items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-muted"
              >
                All products
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
              {categories.map((cat) => (
                <Link
                  key={cat.id}
                  to="/shop"
                  search={{ locale, category: cat.slug } as any}
                  className="flex items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <span className="truncate">{cat.name}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              ))}
            </nav>
          </div>
        </aside>

        {/* Main - Products grid */}
        <div className="min-w-0 flex-1">
          {/* Mobile categories - horizontal scroll */}
          <div className="mb-4 flex gap-2 overflow-x-auto pb-2 lg:hidden">
            {categories.map((cat) => (
              <Link
                key={cat.id}
                to="/shop"
                search={{ locale, category: cat.slug } as any}
                className="shrink-0 rounded-full border px-3 py-1.5 text-sm hover:bg-muted"
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
