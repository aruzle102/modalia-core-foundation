/**
 * Supabase RPC this-binding regression test.
 * Regression for: "Cannot read properties of undefined (reading 'rest')"
 * Root cause: `const rpc = client.rpc` loses `this`; Supabase accesses `this.rest`.
 * Fix: call `client.rpc(...)` directly, or use `.call(client, ...)`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const files = [
  "../seller-dashboard.functions.ts",
  "../analytics.functions.ts",
  "../seller-analytics.functions.ts",
  "../recommendations.ts",
];

describe("supabase rpc this-binding", () => {
  for (const rel of files) {
    it(`${rel}: no detached rpc without .call()`, () => {
      const src = readFileSync(join(__dirname, rel), "utf-8");
      const lines = src.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (/const rpc\w* = .*\.rpc as unknown/.test(lines[i])) {
          const ctx = lines.slice(i, i + 10).join("\n");
          assert.ok(
            /\.call\(client,|\.apply\(client,|\.bind\(client\)/.test(ctx),
            `${rel}:${i + 1}: detached rpc must use .call(client,...)`,
          );
        }
      }
    });
  }
});
