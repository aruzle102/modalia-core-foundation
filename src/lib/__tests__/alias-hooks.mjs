/**
 * Node test alias hook: maps the repo's `@/` import alias to `src/`
 * and appends `.ts` for extensionless ESM imports, so unit tests can
 * import source modules directly under `node --test` (type stripping).
 *
 * Usage: node --test --import ./src/lib/__tests__/alias-hook.mjs <test files>
 */
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const rel = specifier.slice(2);
    const withExt =
      rel.endsWith(".ts") || rel.endsWith(".tsx") || rel.endsWith(".mjs") ? rel : rel + ".ts";
    const candidates = [
      path.join(REPO_ROOT, "src", withExt),
      path.join(REPO_ROOT, "src", rel, "index.ts"),
    ];
    for (const candidate of candidates) {
      try {
        await nextResolve(pathToFileURL(candidate).href, context);
        return { url: pathToFileURL(candidate).href, shortCircuit: true };
      } catch {
        /* try next candidate */
      }
    }
  }
  return nextResolve(specifier, context);
}
