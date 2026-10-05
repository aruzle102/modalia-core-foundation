import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SupportedLocale } from "@/config/platform";
import {
  unreadCount,
  listNotifications,
  markAllRead,
  markRead,
  type NotificationScope,
} from "@/lib/notifications.functions";
import {
  localizedLink,
  pickLocalized,
  timeAgo,
  typeIcon,
  type NotificationsText,
} from "./notifications-shared";

/**
 * Notification bell with unread badge + dropdown.
 * Renders nothing when the viewer has no access (signed out, non-seller…),
 * so it is safe to mount in any shell.
 */
export function NotificationBell({
  scope,
  locale,
  t,
  viewAllTo,
  preferencesTo,
  className,
}: {
  scope: NotificationScope;
  locale: SupportedLocale;
  t: NotificationsText;
  /** Full-page notification center route. */
  viewAllTo: string;
  /** Preferences page route (omitted for admin scope). */
  preferencesTo?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const panelRef = useRef<HTMLDivElement>(null);

  const countQuery = useQuery({
    queryKey: ["notifications", "unread", scope],
    queryFn: () => unreadCount({ data: { scope } }),
    refetchInterval: 60_000,
    retry: false,
  });

  const recentQuery = useQuery({
    queryKey: ["notifications", "recent", scope],
    queryFn: () => listNotifications({ data: { scope, page: 1, pageSize: 8 } }),
    enabled: open,
    retry: false,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["notifications"], refetchType: "all" });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => markRead({ data: { scope, id } }),
    onSettled: invalidate,
  });
  const markAllMutation = useMutation({
    mutationFn: () => markAllRead({ data: { scope } }),
    onSettled: invalidate,
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open ]);

  // No access (signed out etc.): the server function throws → hide the bell.
  if (countQuery.isError) return null;
  const count = countQuery.data?.count ?? 0;

  const notifications = recentQuery.data?.notifications ?? [];

  return (
    <div ref={panelRef} className={`relative ${className ?? ""}`}>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t.bell}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((value) => !value)}
        className="relative"
      >
        <Bell />
        {count > 0 ? (
          <span className="absolute -end-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-foreground px-1 text-[9px] font-bold text-background">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </Button>

      {open ? (
        <div
          role="dialog"
          aria-label={t.bell}
          className="absolute end-0 top-full z-50 mt-2 flex max-h-[70vh] w-80 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl sm:w-96"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">{t.bell}</p>
            <div className="flex items-center gap-1">
              {preferencesTo ? (
                <Link
                  to={preferencesTo as "/"}
                  search={{ locale }}
                  aria-label={t.openPreferences}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  onClick={() => setOpen(false)}
                >
                  <Settings2 className="h-4 w-4" />
                </Link>
              ) : null}
              {count > 0 ? (
                <button
                  type="button"
                  onClick={() => markAllMutation.mutate()}
                  disabled={markAllMutation.isPending}
                  className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                >
                  {t.markAllRead}
                </button>
              ) : null}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {recentQuery.isPending ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">…</p>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Bell className="mx-auto h-8 w-8 text-muted-foreground/40" />
                <p className="mt-3 text-sm font-medium">{t.empty}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t.emptyHint}</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {notifications.map((item) => {
                  const Icon = typeIcon(item.type);
                  const href = localizedLink(item.link, locale);
                  const row = (
                    <>
                      <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${item.readAt ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className={`text-sm ${item.readAt ? "font-normal text-foreground" : "font-semibold text-foreground"}`}>
                            {pickLocalized(item.title, locale)}
                          </span>
                          {!item.readAt ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" /> : null}
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                          {pickLocalized(item.body, locale)}
                        </span>
                        <span className="mt-1 block text-[11px] text-muted-foreground/70">
                          {timeAgo(item.createdAt, locale, t)}
                        </span>
                      </span>
                    </>
                  );
                  const classes = "flex w-full gap-3 px-4 py-3 text-start transition-colors hover:bg-accent/50";
                  return (
                    <li key={item.id}>
                      {href ? (
                        <a
                          href={href}
                          className={classes}
                          onClick={() => {
                            if (!item.readAt) markReadMutation.mutate(item.id);
                            setOpen(false);
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
            )}
          </div>

          <div className="border-t border-border px-4 py-2.5">
            <Link
              to={viewAllTo as "/"}
              search={{ locale }}
              onClick={() => setOpen(false)}
              className="block rounded-md px-2 py-1.5 text-center text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              {t.viewAll}
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
