import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { SupportedLocale } from "@/config/platform";
import {
  getPreferences,
  unreadCount,
  listNotifications,
  markAllRead,
  markRead,
  updatePreferences,
  type NotificationScope,
} from "@/lib/notifications.functions";
import {
  localizedLink,
  pickLocalized,
  timeAgo,
  typeIcon,
  type NotificationsText,
} from "./notifications-shared";

function invalidateAll(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: ["notifications"], refetchType: "all" });
}

/**
 * Full notification list: paginated, mark-as-read on open, mark-all button.
 * Shared by the customer, seller and admin centers.
 */
export function NotificationList({
  scope,
  locale,
  t,
  pageSize = 15,
}: {
  scope: NotificationScope;
  locale: SupportedLocale;
  t: NotificationsText;
  pageSize?: number;
}) {
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ["notifications", "list", scope, page],
    queryFn: () => listNotifications({ data: { scope, page, pageSize } }),
    retry: false,
  });
  const countQuery = useQuery({
    queryKey: ["notifications", "unread", scope],
    queryFn: () => unreadCount({ data: { scope } }),
    retry: false,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => markRead({ data: { scope, id } }),
    onSettled: () => invalidateAll(queryClient),
  });
  const markAllMutation = useMutation({
    mutationFn: () => markAllRead({ data: { scope } }),
    onSettled: () => invalidateAll(queryClient),
  });

  if (listQuery.isError) {
    return (
      <p role="alert" className="rounded-xl border border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
        {t.emptyHint}
      </p>
    );
  }

  const items = listQuery.data?.notifications ?? [];
  const unread = countQuery.data?.count ?? 0;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {unread > 0 ? `${unread} · ${t.bell}` : t.bell}
        </p>
        {unread > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={markAllMutation.isPending}
            onClick={() => markAllMutation.mutate()}
          >
            {t.markAllRead}
          </Button>
        ) : null}
      </div>

      {listQuery.isPending ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-muted/60" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-6 py-16 text-center">
          <Bell className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-4 text-base font-semibold">{t.empty}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t.emptyHint}</p>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {items.map((item) => {
              const Icon = typeIcon(item.type);
              const href = localizedLink(item.link, locale);
              const row = (
                <>
                  <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${item.readAt ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-3">
                      <span className={`text-sm ${item.readAt ? "font-normal" : "font-semibold"}`}>
                        {pickLocalized(item.title, locale)}
                      </span>
                      {!item.readAt ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" /> : null}
                    </span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {pickLocalized(item.body, locale)}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground/70">
                      {timeAgo(item.createdAt, locale, t)}
                    </span>
                  </span>
                </>
              );
              const classes = "flex w-full gap-4 px-4 py-4 text-start transition-colors hover:bg-accent/40 sm:px-5";
              return (
                <li key={item.id} className={item.readAt ? "" : "bg-primary/[0.03]"}>
                  {href ? (
                    <a
                      href={href}
                      className={classes}
                      onClick={() => {
                        if (!item.readAt) markReadMutation.mutate(item.id);
                      }}
                    >
                      {row}
                    </a>
                  ) : (
                    <button
                      type="button"
                      className={classes}
                      onClick={() => {
                        if (!item.readAt) markReadMutation.mutate(item.id);
                      }}
                    >
                      {row}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-6 flex justify-center">
            {listQuery.data?.hasMore ? (
              <Button type="button" variant="outline" onClick={() => setPage((p) => p + 1)}>
                {t.loadMore}
              </Button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Preference toggles for customer/seller scopes. Unknown keys are ignored;
 * missing keys default to enabled (handled server-side).
 */
export function NotificationPreferencesForm({
  scope,
  t,
}: {
  scope: "customer" | "seller";
  t: NotificationsText;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Record<string, boolean> | null>(null);
  const [saved, setSaved] = useState(false);

  const prefsQuery = useQuery({
    queryKey: ["notifications", "prefs", scope],
    queryFn: () => getPreferences({ data: { scope } }),
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: (prefs: Record<string, boolean>) => updatePreferences({ data: { scope, prefs } }),
    onSuccess: (result) => {
      setDraft(result.prefs);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 3000);
    },
    onSettled: () => invalidateAll(queryClient),
  });

  if (prefsQuery.isPending) {
    return (
      <div className="space-y-3" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/60" />
        ))}
      </div>
    );
  }

  if (prefsQuery.isError || !prefsQuery.data) {
    return (
      <p role="alert" className="rounded-xl border border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
        {t.saveError}
      </p>
    );
  }

  const { keys, prefs } = prefsQuery.data;
  const current = draft ?? prefs;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        saveMutation.mutate(current);
      }}
    >
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {keys.map((key) => {
          const meta = t.prefs[key as keyof typeof t.prefs];
          const checked = current[key] !== false;
          return (
            <li key={key} className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <p className="text-sm font-medium">{meta?.label ?? key}</p>
                {meta?.hint ? <p className="mt-0.5 text-xs text-muted-foreground">{meta.hint}</p> : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-muted-foreground">{checked ? t.enabled : t.disabled}</span>
                <Switch
                  checked={checked}
                  onCheckedChange={(value) => setDraft({ ...current, [key]: value })}
                  aria-label={meta?.label ?? key}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-6 flex items-center gap-3">
        <Button type="submit" disabled={saveMutation.isPending}>
          {saveMutation.isPending ? t.saving : t.save}
        </Button>
        {saved ? <p className="text-sm text-muted-foreground">{t.saved}</p> : null}
        {saveMutation.isError ? (
          <p role="alert" className="text-sm text-destructive">{t.saveError}</p>
        ) : null}
      </div>
    </form>
  );
}
