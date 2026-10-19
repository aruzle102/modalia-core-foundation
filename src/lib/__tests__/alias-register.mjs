/**
 * Self-registering entry for the `@/` alias hooks.
 * Usage: node --test --import ./src/lib/__tests__/alias-register.mjs <tests>
 */
import { register } from "node:module";

register("./alias-hooks.mjs", import.meta.url);
