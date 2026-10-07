import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearch } from "@tanstack/react-router";

/**
 * URL search-param state for list pages (admin / seller).
 *
 * Tab / search / filter / sort / pagination state lives in the URL so the
 * browser Back button behaves naturally and list URLs are shareable.
 *
 * IMPORTANT: every key managed through these hooks must be whitelisted in the
 * route's `validateSearch`, otherwise TanStack Router strips it on navigation.
 * Use the `strParam` / `numParam` coercers there.
 */

/**
 * Coerce a raw search value to a string.
 * An empty string is treated as missing (returns the fallback) so enum
 * filters like `?status=` degrade to their "all" default instead of failing
 * zod validation downstream.
 */
export function strParam(value: unknown, fallback = ""): string {
  return typeof value === "string" && value !== "" ? value : fallback;
}

/** Coerce a raw search value to a finite integer >= min (default min 1). */
export function numParam(value: unknown, fallback = 1, min = 1): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.floor(n));
}

type Patch = Record<string, string | number | undefined>;

function applyPatch(
  prev: Record<string, unknown>,
  patch: Patch,
  defaults: Record<string, string | number>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...prev };
  for (const [k, v] of Object.entries(patch)) {
    // Drop empty / default values so shared URLs stay clean.
    if (v === undefined || v === "" || v === defaults[k]) delete next[k];
    else next[k] = v;
  }
  return next;
}

export interface UrlState {
  /** Current (validated) search params. */
  search: Record<string, unknown>;
  /**
   * Patch one or more params. Filter/search changes use `replace` history so
   * typing doesn't spam the Back stack; pass `{ push: true }` for tab and
   * pagination changes where Back should step through states.
   */
  set: (patch: Patch, opts?: { push?: boolean }) => void;
}

/**
 * Low-level access to the current route's search params with a batch setter.
 * Prefer `useUrlParam` / `useUrlNumberParam` / `useDebouncedUrlParam`.
 */
export function useUrlState(defaults: Record<string, string | number> = {}): UrlState {
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const navigate = useNavigate();
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;

  const set = useCallback(
    (patch: Patch, opts?: { push?: boolean }) => {
      void navigate({
        search: (prev: Record<string, unknown>) => applyPatch(prev, patch, defaultsRef.current),
        replace: !(opts?.push ?? false),
      } as never);
    },
    [navigate],
  );

  return { search, set };
}

/** String search param bound to the URL (e.g. filter selects, tabs). */
export function useUrlParam(
  key: string,
  defaultValue = "",
  opts?: { push?: boolean },
): [string, (next: string) => void] {
  const { search, set } = useUrlState({ [key]: defaultValue });
  const value = strParam(search[key], defaultValue);
  const setter = useCallback(
    (next: string) => set({ [key]: next }, opts),
    [set, key, opts],
  );
  return [value, setter];
}

/** Numeric search param bound to the URL (e.g. page). */
export function useUrlNumberParam(
  key: string,
  defaultValue = 1,
  opts?: { push?: boolean },
): [number, (next: number) => void] {
  const { search, set } = useUrlState({ [key]: defaultValue });
  const value = numParam(search[key], defaultValue);
  const setter = useCallback(
    (next: number) => set({ [key]: next }, opts),
    [set, key, opts],
  );
  return [value, setter];
}

/**
 * Search-box state: the input stays local (draft) while typing and commits to
 * the URL debounced, so filtering doesn't spam history or refetch per
 * keystroke. The draft re-syncs when the URL changes elsewhere (Back/forward,
 * clear-filters).
 *
 * Returns `[draft, onDraftChange]`; read the committed value from `useUrlParam`
 * if needed. `onCommit` fires after the debounced write (handy to reset page).
 */
export function useDebouncedUrlParam(
  key: string,
  defaultValue = "",
  opts?: { delay?: number; onCommit?: (value: string) => void },
): [string, (draft: string) => void] {
  const { search, set } = useUrlState({ [key]: defaultValue });
  const committed = strParam(search[key], defaultValue);
  const [draft, setDraft] = useState(committed);
  const delay = opts?.delay ?? 400;
  const onCommitRef = useRef(opts?.onCommit);
  onCommitRef.current = opts?.onCommit;
  const timer = useRef<number | null>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    setDraft(committed);
  }, [committed]);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const onChange = useCallback(
    (next: string) => {
      setDraft(next);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        timer.current = null;
        set({ [key]: next });
        onCommitRef.current?.(next);
      }, delay);
    },
    [set, key, delay],
  );

  return [draft, onChange];
}

/** Current "pathname + query string" — attach as `back` when linking to a detail page. */
export function useBackParam(): string {
  const { pathname, searchStr } = useLocation();
  return `${pathname}${searchStr}`;
}
