import { Button } from "@/components/ui/button";
import { getTranslations, resolveLocale } from "@/lib/i18n";

/**
 * Shared loading / error states for route `pendingComponent` / `errorComponent`.
 * Keeps every route honest: no white screens, no swallowed errors, and a retry
 * affordance wherever a loader can fail.
 */

export function RoutePending({ label }: { label: string }) {
  return (
    <div className="px-6 py-24 text-center text-muted-foreground" aria-busy="true">
      {label}
    </div>
  );
}

export function RouteError({
  message,
  reset,
}: {
  message: string;
  reset?: () => void;
}) {
  return (
    <div role="alert" className="mx-auto max-w-md px-6 py-24 text-center">
      <p className="text-muted-foreground">{message}</p>
      {reset ? (
        <Button type="button" variant="outline" size="sm" className="mt-4" onClick={reset}>
          {getTranslations(resolveLocale()).common.retry}
        </Button>
      ) : null}
    </div>
  );
}
