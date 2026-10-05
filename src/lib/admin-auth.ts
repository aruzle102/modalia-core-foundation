/**
 * Single source of truth for admin authorization (server-only).
 *
 * Every admin server function must run `.middleware([requireSupabaseAuth])`
 * AND call `assertAdmin(context)` in its handler. The check goes through the
 * `is_super_admin` RPC, which reads the caller's `user_roles` row — never any
 * client-supplied value.
 *
 * Error contract (relied upon by AdminGate):
 * - missing/invalid context → "Unauthorized"
 * - non-admin caller → an error whose message contains "Forbidden"
 */
export async function assertAdmin(context: unknown): Promise<void> {
  const supabase = (
    context as {
      supabase?: { rpc?: (fn: string) => Promise<{ data: unknown; error: unknown }> };
    } | null | undefined
  )?.supabase;
  if (!supabase?.rpc) throw new Error("Unauthorized");
  const { data, error } = await supabase.rpc("is_super_admin");
  if (error || data !== true) throw new Error("Forbidden");
}
