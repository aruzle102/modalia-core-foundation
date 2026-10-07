import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SellerShell } from "@/components/seller/SellerShell";
import { AdminCard, EmptyState, TableSkeleton } from "@/components/admin/ui";
import { listSellerProducts } from "@/lib/seller-products.functions";
import { getLocale } from "@/lib/i18n";
import { errMsg } from "../admin/_shared";

export const Route = createFileRoute("/_authenticated/seller/categories")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
  }),
  head: () => ({
    meta: [
      { name: "robots", content: "noindex,nofollow" },
      { title: "Categories — Seller — Modalia" },
      { name: "description", content: "Categories your products are listed in." },
    ],
  }),
  component: SellerCategoriesPage,
});

const T = {
  en: {
    title: "Categories",
    intro: "The categories your own products are listed in, with the number of products in each.",
    colCategory: "Category",
    colProducts: "Products",
    uncategorized: "Uncategorized",
    totalRow: "Total",
    loading: "Loading your categories…",
    emptyTitle: "No categories yet",
    emptyText: "Categories appear here once you add products and assign them to categories.",
    errorTitle: "Categories could not be loaded",
  },
  fr: {
    title: "Catégories",
    intro: "Les catégories dans lesquelles vos propres produits sont répertoriés, avec le nombre de produits dans chacune.",
    colCategory: "Catégorie",
    colProducts: "Produits",
    uncategorized: "Non catégorisé",
    totalRow: "Total",
    loading: "Chargement de vos catégories…",
    emptyTitle: "Aucune catégorie pour le moment",
    emptyText: "Les catégories apparaîtront ici une fois que vous aurez ajouté des produits et les aurez assignés à des catégories.",
    errorTitle: "Les catégories n'ont pas pu être chargées",
  },
  ar: {
    title: "الفئات",
    intro: "الفئات التي تُدرج فيها منتجاتك، مع عدد المنتجات في كل فئة.",
    colCategory: "الفئة",
    colProducts: "المنتجات",
    uncategorized: "بدون فئة",
    totalRow: "المجموع",
    loading: "جارٍ تحميل الفئات…",
    emptyTitle: "لا توجد فئات بعد",
    emptyText: "ستظهر الفئات هنا بمجرد إضافة منتجات وتعيينها إلى فئات.",
    errorTitle: "تعذّر تحميل الفئات",
  },
} as const;

type Locale = keyof typeof T;

function catName(name: unknown, locale: Locale): string | null {
  if (name && typeof name === "object" && !Array.isArray(name)) {
    const n = name as Record<string, unknown>;
    for (const k of [locale, "en", "fr", "ar"]) {
      if (typeof n[k] === "string" && n[k]) return n[k] as string;
    }
  }
  return null;
}

interface CategoryRow {
  key: string;
  name: string;
  count: number;
}

/** Aggregate the seller's real per-category product counts by paging through their own catalog. */
async function fetchCategoryCounts(locale: Locale): Promise<{ rows: CategoryRow[]; total: number }> {
  const counts = new Map<string, { name: string; count: number }>();
  let page = 1;
  let totalProducts = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await listSellerProducts({ data: { page } });
    const products = res.products ?? [];
    if (page === 1) totalProducts = res.total ?? 0;
    if (products.length === 0) break;
    for (const p of products) {
      const row = p as { categories?: { name?: unknown } | null };
      const key = row.categories ? JSON.stringify(row.categories.name ?? null) : "__none__";
      const existing = counts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(key, {
          name: catName(row.categories?.name, locale) ?? "",
          count: 1,
        });
      }
    }
    const fetched = page * (res.pageSize ?? products.length);
    if (products.length < (res.pageSize ?? products.length) || fetched >= totalProducts) break;
    page += 1;
  }
  const rows: CategoryRow[] = [...counts.entries()].map(([key, v]) => ({
    key,
    name: v.name || key,
    count: v.count,
  }));
  rows.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return { rows, total: rows.reduce((s, r) => s + r.count, 0) };
}

function SellerCategoriesPage() {
  const { locale } = Route.useSearch();
  const t = T[(locale as Locale) in T ? (locale as Locale) : "en"];

  const categoriesQuery = useQuery({
    queryKey: ["seller-categories-overview", locale],
    queryFn: () => fetchCategoryCounts(locale as Locale),
    retry: false,
  });

  const rows = categoriesQuery.data?.rows ?? [];

  return (
    <SellerShell eyebrow="Seller workspace" title={t.title}>
      <p className="text-body text-muted-foreground">{t.intro}</p>

      <div className="mt-6">
        {categoriesQuery.isLoading ? (
          <TableSkeleton rows={4} />
        ) : categoriesQuery.isError ? (
          <AdminCard>
            <EmptyState title={t.errorTitle} text={errMsg(categoriesQuery.error)} />
          </AdminCard>
        ) : rows.length === 0 ? (
          <AdminCard>
            <EmptyState title={t.emptyTitle} text={t.emptyText} />
          </AdminCard>
        ) : (
          <AdminCard>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">{t.colCategory}</th>
                    <th className="px-4 py-3 text-right font-medium">{t.colProducts}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.key} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">
                        {row.key === "__none__" ? t.uncategorized : row.name}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{row.count}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="px-4 py-3">{t.totalRow}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{categoriesQuery.data?.total ?? 0}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </AdminCard>
        )}
      </div>
    </SellerShell>
  );
}
