import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { SellerShell } from "@/components/seller/SellerShell";
import { ProductEditor } from "@/components/seller/ProductEditor";
import { Button } from "@/components/ui/button";
import { getLocale, localeDirections } from "@/lib/i18n";
import { strParam } from "@/hooks/use-url-state";
import { BackLink } from "@/components/routing/back-link";

export const Route = createFileRoute("/_authenticated/seller/products/$productId")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
    back: strParam(search["back"]),
  }),
  head: () => ({ meta: [{ name: "robots", content: "noindex,nofollow" }] }),
  component: EditProductPage,
});

function EditProductPage() {
  const { locale, back } = Route.useSearch();
  const { productId } = Route.useParams();
  return (
    <SellerShell
      title="Edit product"
      eyebrow="Seller OS"
      breadcrumbs={[
        { label: "Products", to: "/seller/products", search: { locale } },
        { label: "Edit product" },
      ]}
      actions={
        <Button asChild variant="outline" size="sm">
          <BackLink back={back} fallbackTo="/seller/products" fallbackSearch={{ locale }}>
            <ArrowLeft className="me-1.5 h-4 w-4" /> Back to products
          </BackLink>
        </Button>
      }
    >
      <div dir={localeDirections[locale]}>
        <ProductEditor mode="edit" productId={productId} />
      </div>
    </SellerShell>
  );
}
