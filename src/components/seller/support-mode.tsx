import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveSupportSession, revokeSupportSession } from "@/lib/admin-support.functions";
import { getTranslations, type SupportedLocale } from "@/lib/i18n";
import type { SellerContext } from "@/lib/seller-auth";

/**
 * V8 Section 47 — admin support mode client glue.
 *
 * Handshake: the admin opens `/seller?support=<token>` (from the seller
 * profile's "Open Seller Dashboard"). This hook redeems the token once via
 * `resolveSupportSession`, which stores it as a short-lived HttpOnly cookie
 * (Set-Cookie on its own response — page JS never touches it) so subsequent
 * seller server functions carry the grant, strips it from the URL, and
 * refetches the seller context — which then resolves through the support
 * branch of `resolveSeller` (read-only, default deny).
 *
 * The token is bearer material but useless without the creating admin's
 * live super_admin session (creator binding, re-verified server-side).
 */
export function useSupportHandshake() {
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("support")) return;
    const token = params.get("support") ?? "";
    let cancelled = false;

    // Never send a malformed token to the server; drop it from the URL.
    if (!/^[0-9a-f]{64}$/i.test(token)) {
      setError("invalid");
      void nav({
        // @ts-expect-error — strip the support param regardless of the
        // current route's search schema.
        search: (prev: Record<string, unknown>) => ({ ...prev, support: undefined }),
        replace: true,
      });
      return;
    }

    setPending(true);
    (async () => {
      try {
        await resolveSupportSession({ data: { token } });
        if (cancelled) return;
        // The grant cookie is set HttpOnly by resolveSupportSession itself
        // (Set-Cookie on its response) — page JS never touches it. Every
        // later seller server fn re-validates the grant server-side (expiry
        // + creator binding + live super_admin).
        await nav({
          // @ts-expect-error — strip the support param regardless of the
          // current route's search schema.
          search: (prev: Record<string, unknown>) => ({ ...prev, support: undefined }),
          replace: true,
        });
        await queryClient.invalidateQueries({ queryKey: ["seller-context"] });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "invalid");
          await nav({
            // @ts-expect-error — strip the support param regardless of the
            // current route's search schema.
            search: (prev: Record<string, unknown>) => ({ ...prev, support: undefined }),
            replace: true,
          });
        }
      } finally {
        if (!cancelled) setPending(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Run once per mount; a new token means a new page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { pending, error };
}

/**
 * Unmissable support-mode banner. Rendered across the ENTIRE seller shell
 * whenever the context is a support context. Trilingual eyebrow so the mode
 * is obvious in every locale; body + exit action in the current locale.
 * RTL-safe (no directional utilities).
 */
export function SupportModeBanner({
  seller,
  locale,
}: {
  seller: SellerContext;
  locale: SupportedLocale;
}) {
  const nav = useNavigate();
  const t = getTranslations(locale).sellerAuth;
  const [exiting, setExiting] = useState(false);

  async function exitSupportMode() {
    setExiting(true);
    try {
      await revokeSupportSession();
    } catch {
      // The grant also expires on its own; never trap the admin here.
    }
    // revokeSupportSession clears the HttpOnly grant cookie server-side — a
    // document.cookie write could not clear it (HttpOnly).
    await nav({ href: `/admin/sellers/${seller.sellerId}`, replace: true });
  }

  return (
    <div role="alert" className="bg-info text-white">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 lg:px-8">
        <ShieldAlert className="h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          {/* Trilingual marker — identical in every locale, unmistakable. */}
          <p className="text-xs font-bold tracking-wide" dir="ltr">
            ADMIN VIEW · SUPPORT MODE — VUE ADMIN · MODE ASSISTANCE —{" "}
            <span dir="rtl" lang="ar">
              عرض الإدارة · وضع الدعم
            </span>
          </p>
          <p className="mt-0.5 text-small text-white/90">
            {t.supportBannerTitle} · {seller.legalName} — {t.supportBannerBody}
          </p>
        </div>
        <span className="rounded-md border border-white/40 px-2 py-0.5 text-caption font-semibold uppercase tracking-wide">
          {t.supportReadOnly}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={exitSupportMode}
          disabled={exiting}
          className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
        >
          {t.exitSupport}
        </Button>
      </div>
    </div>
  );
}
