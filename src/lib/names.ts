/**
 * Single source of truth for localized-name display picks.
 *
 * Picks the first non-empty string from a {en,fr,ar} jsonb object, in
 * en → fr → ar preference order. Returns `fallback` when nothing usable is
 * found. Callers that need a different preference order (e.g. fr-first) keep
 * their own local variant.
 */
export function pickLocalizedName(name: unknown, fallback = ""): string {
  if (!name || typeof name !== "object" || Array.isArray(name)) return fallback;
  const n = name as Record<string, unknown>;
  for (const key of ["en", "fr", "ar"]) {
    const v = n[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return fallback;
}
