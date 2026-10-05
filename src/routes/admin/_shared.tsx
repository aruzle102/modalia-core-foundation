import { Button } from "@/components/ui/button";
import { pickLocalizedName } from "@/lib/names";

/** Pick the display name from a {fr,en,ar} jsonb object. */
export function pickName(name: unknown): string {
  return pickLocalizedName(name);
}

/** Small prev/next pager used across admin tables. */
export function Pager({
  page,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-caption text-muted-foreground">
        Showing {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <span className="text-caption text-muted-foreground">
          Page {page} of {pages}
        </span>
        <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

/** Extract a human-readable message from an unknown error. */
export function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
