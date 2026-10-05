import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { SellerShell } from "@/components/seller/SellerShell";
import { ProductEditor } from "@/components/seller/ProductEditor";
import { Button } from "@/components/ui/button";
import { getLocale, localeDirections } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/seller/products/$productId")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
  }),
  component: EditProductPage,
});

function EditProductPage() {
  const { locale } = Route.useSearch();
  const { productId } = Route.useParams();
  return (
    <SellerShell
      title="Edit product"
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
        <ProductEditor mode="edit" productId={productId} />
      </div>
    </SellerShell>
  );
}
