import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, type ReactNode } from "react";

export interface BackTarget {
  to: string;
  search: Record<string, string>;
}

/**
 * Parse a `back` search param ("/path?x=1&y=2") into a Link/navigate target.
 * Returns null when missing or not an app-relative path (open-redirect guard).
 */
export function parseBackTarget(back: unknown): BackTarget | null {
  if (typeof back !== "string" || !back.startsWith("/")) return null;
  const q = back.indexOf("?");
  const search: Record<string, string> = {};
  if (q !== -1) {
    for (const [k, v] of new URLSearchParams(back.slice(q + 1))) search[k] = v;
  }
  return { to: q === -1 ? back : back.slice(0, q), search };
}

interface BackLinkProps {
  /** Raw `back` search param value from the detail route. */
  back: unknown;
  /** Fallback list route (used when there is no saved context). */
  fallbackTo: string;
  fallbackSearch?: Record<string, string>;
  className?: string;
  children: ReactNode;
}

/**
 * "Back to <list>" link. Restores the exact list state (filters / page / tab)
 * captured in the `back` param; falls back to the plain list route when the
 * detail page was opened directly (deep link / refresh).
 */
export function BackLink({ back, fallbackTo, fallbackSearch, className, children }: BackLinkProps) {
  const target = parseBackTarget(back);
  if (target) {
    return (
      <Link to={target.to} search={target.search as never} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <Link to={fallbackTo} search={fallbackSearch as never} className={className}>
      {children}
    </Link>
  );
}

/**
 * After save / edit on a detail page: return to the saved previous context
 * (list with its filters), never blindly to a dashboard.
 */
export function useBackNavigate(fallbackTo: string): () => void {
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const navigate = useNavigate();
  return useCallback(() => {
    const target = parseBackTarget(search["back"]);
    if (target) void navigate({ to: target.to, search: target.search } as never);
    else void navigate({ to: fallbackTo } as never);
  }, [navigate, search, fallbackTo]);
}
