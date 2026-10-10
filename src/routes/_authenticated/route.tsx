import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getLocale } from "@/lib/i18n";

/**
 * Shared authenticated layout (account pages, notifications, seller area).
 * Unauthenticated visitors are redirected to a sign-in page with the intended
 * route preserved in `?redirect=` so they return to it after signing in —
 * never bounced to the homepage. Seller paths go to the seller login page.
 */
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      const rawSearch = location.search as Record<string, unknown>;
      const locale = getLocale(typeof rawSearch["locale"] === "string" ? rawSearch["locale"] : undefined);
      // Preserve the full intended destination (path + search) for the
      // return trip. The login page sanitizes it before navigating.
      const params = new URLSearchParams(
        Object.entries(rawSearch).flatMap(([key, value]) =>
          typeof value === "string" ? [[key, value]] : [],
        ),
      );
      const query = params.toString();
      const intended = `${location.pathname}${query ? `?${query}` : ""}`;
      if (location.pathname.startsWith("/seller")) {
        throw redirect({ to: "/seller/login", search: { locale, redirect: intended } });
      }
      throw redirect({ to: "/auth", search: { locale, redirect: intended } });
    }
    return { user: data.user };
  },
  component: () => <Outlet />,
});
