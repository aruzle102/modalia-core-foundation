/**
 * Supabase RPC this-binding regression test.
 *
 * Regression test for: "Error: Cannot read properties of undefined (reading 'rest')"
 *
 * Root cause: extracting `client.rpc` as a standalone function loses the
 * `this` binding. Supabase's rpc implementation accesses `this.rest`
 * internally, which becomes undefined when detached.
 *
 * The fix: always call `client.rpc(name, args)` directly on the client
 * object, never `const rpc = client.rpc; rpc(name, args)`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const filesToCheck = [
  "../seller-dashboard.functions.ts",
  "../analytics.functions.ts",
  "../seller-analytics.functions.ts",
  "../recommendations.ts",
];

describe("supabase rpc this-binding", () => {
  for (const rel of filesToCheck) {
    const name = rel.replace("../", "");
    it(`${name}: never detaches client.rpc`, () => {
      const path = join(__dirname, rel);
      const source = readFileSync(path, "utf-8");
      // The broken pattern: extracting rpc and calling WITHOUT .call/.apply/.bind
      // loses `this`. Safe patterns: client.rpc(...) directly, or rpc.call(client, ...).
      const lines = source.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/const rpc\w* = .*\.rpc as unknown/.test(line)) {
          // Check if it's called with .call(client, ...) within next 10 lines
          const context = lines.slice(i, i + 10).join("\n");
          const safeCall = /\.call\(client,|\.apply\(client,|\.bind\(client\)/.test(context);
          assert.ok(
            safeCall,
            `${name}:${i + 1} detaches client.rpc without preserving this-binding via .call/.apply/.bind`,
          );
        }
      }
    });
  }

  it("seller-dashboard callRpc preserves this-binding", () => {
    const path = join(__dirname, "../seller-dashboard.functions.ts");
    const source = readFileSync(path, "utf-8");
    assert.ok(
      source.includes("return client.rpc(name, args)"),
      "callRpc must invoke rpc directly on client",
    );
  });
});
