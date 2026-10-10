#!/usr/bin/env node
/**
 * i18n parity check (V8 Section 56, #42).
 *
 * Loads the three locale modules (ar/fr/en) and fails with a non-zero exit
 * code — plus a full listing — when a key path exists in one locale but not
 * the others. Dependency-free; relies on Node's built-in TypeScript type
 * stripping (the locale files are erasable-syntax-only object literals).
 *
 * Usage: node scripts/i18n-parity.mjs   (run from the repo root)
 */
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const LOCALES = ["ar", "fr", "en"];

/** Recursively collect dot-separated key paths; strings and functions are leaves. */
function collectKeys(value, prefix, out) {
  if (typeof value === "string" || typeof value === "function") {
    out.add(prefix);
    return;
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const key of Object.keys(value)) {
      collectKeys(value[key], prefix ? `${prefix}.${key}` : key, out);
    }
    return;
  }
  // Any other leaf shape (number/boolean/null) still counts as a key path.
  out.add(prefix);
}

const dicts = {};
for (const locale of LOCALES) {
  const modPath = path.join(here, "..", "src", "lib", "i18n", `${locale}.ts`);
  let mod;
  try {
    mod = await import(`file://${modPath}`);
  } catch (err) {
    console.error(`i18n-parity: failed to import ${locale}.ts: ${err.message}`);
    process.exit(2);
  }
  const dict = mod[locale];
  if (!dict || typeof dict !== "object") {
    console.error(`i18n-parity: ${locale}.ts does not export a "${locale}" object.`);
    process.exit(2);
  }
  dicts[locale] = dict;
}

const keySets = {};
for (const locale of LOCALES) {
  const set = new Set();
  collectKeys(dicts[locale], "", set);
  set.delete("");
  keySets[locale] = set;
}

const allKeys = new Set([...keySets.ar, ...keySets.fr, ...keySets.en]);
let failures = 0;
for (const key of [...allKeys].sort()) {
  const missing = LOCALES.filter((locale) => !keySets[locale].has(key));
  if (missing.length > 0) {
    const present = LOCALES.filter((locale) => keySets[locale].has(key));
    console.log(`MISSING in [${missing.join(", ")}]: ${key}  (present in [${present.join(", ")}])`);
    failures++;
  }
}

const counts = LOCALES.map((l) => `${l}=${keySets[l].size}`).join(" ");
console.log(`i18n-parity: ${counts} key paths checked.`);
if (failures > 0) {
  console.log(`i18n-parity: FAIL — ${failures} key path(s) missing in at least one locale.`);
  process.exit(1);
}
console.log("i18n-parity: PASS — full key parity across ar/fr/en.");
