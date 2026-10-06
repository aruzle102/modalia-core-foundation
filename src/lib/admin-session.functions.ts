import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getAdminIdentity } from "@/lib/admin-permissions";

const adminOnly = [requireSupabaseAuth] as const;

/**
 * Lightweight session probe used by AdminGate. Verifies the caller is an
 * authenticated super_admin OR an active delegated admin member. Per-area
 * permission is enforced by each page and server function. Any other caller
 * gets a "Forbidden" error, which AdminGate maps to the denied state.
 */
export const checkAdminAccess = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .handler(async ({ context }) => {
    // V8 roles: super_admin OR an active delegated member may enter /admin.
    // Per-area permission is enforced by each page and server function.
    const identity = await getAdminIdentity(context);
    if (identity.kind === "none") throw new Error("Forbidden");
    return { ok: true, kind: identity.kind };
  });
