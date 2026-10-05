import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { SellerShell } from "@/components/seller/SellerShell";
import { ProductEditor } from "@/components/seller/ProductEditor";
import { Button } from "@/components/ui/button";
import { getLocale, localeDirections } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/seller/products/new")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
  }),
  component: NewProductPage,
});

function NewProductPage() {
  const { locale } = Route.useSearch();
  return (
    <SellerShell
      title="New product"
      eyebrow="Seller OS"
      actions={
        <Button asChild variant="outline" size="sm">
          <Link to="/seller/products" search={{ locale }}>
            <ArrowLeft className="me-1.5 h-4 w-4" /> Back to products
          </Link>
        </Button>
      }
    >
      <div dir={localeDirections[locale]}>
        <ProductEditor mode="create" />
      </div>
    </SellerShell>
  );
}
