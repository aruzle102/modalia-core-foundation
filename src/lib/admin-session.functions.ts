import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const adminOnly = [requireSupabaseAuth] as const;

async function assertAdmin(context: any) {
  const { data, error } = await context.supabase.rpc("is_super_admin");
  if (error || data !== true) throw new Error("Forbidden: super_admin role required");
}

/**
 * Lightweight session probe used by AdminGate. Verifies the caller is an
 * authenticated super_admin. Any non-admin caller gets a "Forbidden" error,
 * which AdminGate maps to the denied state.
 */
export const checkAdminAccess = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .handler(async ({ context }) => {
    await assertAdmin(context);
    return { ok: true };
  });
