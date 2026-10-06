import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  FolderTree,
  LayoutTemplate,
  Package,
  Plus,
  Store,
  Ticket,
  UserPlus,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getTranslations } from "@/lib/i18n";
import { useAdminLocale } from "./useAdminLocale";

/**
 * "+ Create" quick-create menu in the admin topbar. Every option navigates to
 * the real list page with a `?create=…` deep link that opens the genuine
 * create dialog — never a placeholder.
 */
export function QuickCreate() {
  const locale = useAdminLocale();
  const t = getTranslations(locale).quickCreate;
  const navigate = useNavigate();

  const go = useCallback(
    (to: string, search: Record<string, string>) => {
      void navigate({ to, search } as never);
    },
    [navigate],
  );

  const entries = [
    {
      key: "product",
      label: t.product,
      hint: null as string | null,
      icon: <Package className="h-4 w-4 text-muted-foreground" />,
      run: () => go("/admin/products", { create: "product" }),
    },
    {
      key: "seller",
      label: t.seller,
      hint: null,
      icon: <UserPlus className="h-4 w-4 text-muted-foreground" />,
      run: () => go("/admin/sellers", { create: "seller" }),
    },
    {
      key: "store",
      label: t.store,
      hint: t.storeHint,
      icon: <Store className="h-4 w-4 text-muted-foreground" />,
      run: () => go("/admin/sellers", { create: "seller" }),
    },
    {
      key: "category",
      label: t.category,
      hint: null,
      icon: <FolderTree className="h-4 w-4 text-muted-foreground" />,
      run: () => go("/admin/categories", { create: "category" }),
    },
    {
      key: "coupon",
      label: t.coupon,
      hint: null,
      icon: <Ticket className="h-4 w-4 text-muted-foreground" />,
      run: () => go("/admin/coupons", { create: "coupon" }),
    },
    {
      key: "section",
      label: t.homepageSection,
      hint: null,
      icon: <LayoutTemplate className="h-4 w-4 text-muted-foreground" />,
      run: () => go("/admin/homepage/builder", { create: "section" }),
    },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">{t.create}</span>
          <span className="sr-only">{t.create}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {entries.map((entry) => (
          <DropdownMenuItem key={entry.key} onSelect={() => entry.run()} className="gap-2.5">
            {entry.icon}
            <span className="flex-1">
              <span className="block text-sm">{entry.label}</span>
              {entry.hint ? (
                <span className="block text-xs text-muted-foreground">{entry.hint}</span>
              ) : null}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
