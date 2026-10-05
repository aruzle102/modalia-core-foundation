import { useEffect } from "react";
import { useLocation } from "@tanstack/react-router";

export interface RecentVisit {
  /** Page title at visit time — a real label taken from the page itself. */
  label: string;
  /** Parent section, e.g. "Orders" on an order detail page (empty when none). */
  sub: string;
  /** Full app-relative URL (pathname + query string), a real link. */
  href: string;
  at: number;
}

const STORAGE_KEY = "modalia:admin:recent";
const MAX_ENTRIES = 6;

function readStored(): RecentVisit[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is RecentVisit =>
        typeof v === "object" &&
        v !== null &&
        typeof (v as RecentVisit).label === "string" &&
        typeof (v as RecentVisit).href === "string" &&
        (v as RecentVisit).href.startsWith("/admin"),
    );
  } catch {
    return [];
  }
}

function pathOf(href: string): string {
  const q = href.indexOf("?");
  return q === -1 ? href : href.slice(0, q);
}

/** Recently visited admin pages, most recent first. Real links only. */
export function readRecentVisits(): RecentVisit[] {
  return readStored();
}

/**
 * Record a visit. One entry per path — changing only filters or pagination
 * updates the existing entry in place (keeping its latest state) instead of
 * flooding the list.
 */
function recordVisit(label: string, sub: string, href: string): void {
  if (typeof window === "undefined") return;
  try {
    const path = pathOf(href);
    const entry: RecentVisit = { label, sub, href, at: Date.now() };
    const rest = readStored().filter((v) => pathOf(v.href) !== path);
    const next = [entry, ...rest].slice(0, MAX_ENTRIES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable (private mode, SSR) — tracking is best-effort.
  }
}

/**
 * Track admin page views. Mount once in AdminShell: every admin page records
 * its real title so the command bar can offer "recently visited" shortcuts.
 */
export function useTrackAdminVisit(label: string, sub?: string): void {
  const { pathname, searchStr } = useLocation();
  useEffect(() => {
    if (!pathname.startsWith("/admin")) return;
    recordVisit(label, sub ?? "", `${pathname}${searchStr}`);
  }, [pathname, searchStr, label, sub]);
}
