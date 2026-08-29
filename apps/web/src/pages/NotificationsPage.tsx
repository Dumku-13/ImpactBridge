import { Link } from "react-router-dom";
import { Bell, Check } from "lucide-react";
import {
  useMarkAllRead,
  useMarkRead,
  useNotifications,
} from "@/api/notifications";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

/**
 * Every notification, not just the last handful.
 *
 * The bell in the header holds a short dropdown, which is right for "what just
 * happened" and useless for "what did I miss". An NGO that was away for a week
 * has no way to find the funder's decision from four notifications ago — the
 * record exists, and until now nothing rendered it.
 *
 * Rows link where the notification points, and reading one marks it read on the
 * way out, the same as the dropdown does.
 */

/** "3 minutes ago" without pulling in a date library for one string. */
function timeAgo(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function NotificationsPage() {
  const { user } = useAuth();
  const { data, isPending } = useNotifications(Boolean(user));
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();

  const items = data?.items ?? [];
  const unread = data?.unreadCount ?? 0;

  return (
    <div className="mx-auto max-w-3xl pb-20">
      <header className="border-b border-border pb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Notifications
        </p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <h1
            className="font-display text-3xl font-semibold tracking-[-0.02em] text-foreground sm:text-4xl"
            style={{ fontVariationSettings: '"SOFT" 12' }}
          >
            {unread > 0 ? `${unread} unread` : "You're up to date"}
          </h1>

          {unread > 0 && (
            <Button
              type="button"
              variant="outline"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              <Check className="h-4 w-4" />
              Mark all read
            </Button>
          )}
        </div>
      </header>

      {isPending && (
        <div className="mt-6 space-y-3">
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
      )}

      {!isPending && items.length === 0 && (
        <div className="mt-16 text-center">
          <Bell className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-4 text-sm text-muted-foreground">
            Nothing yet. Donations, grant decisions and reports all show up here.
          </p>
        </div>
      )}

      {items.length > 0 && (
        <ul className="mt-2 divide-y divide-border">
          {items.map((notification) => {
            const isUnread = notification.readAt === null;

            /* Marking read on click is the same behaviour as the dropdown; a
               notification you have opened is read by any definition. */
            const open = () => {
              if (isUnread) markRead.mutate(notification.id);
            };

            const body = (
              <>
                <span
                  className={cn(
                    "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                    isUnread ? "bg-primary" : "bg-transparent",
                  )}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span
                      className={cn(
                        "text-sm",
                        isUnread
                          ? "font-semibold text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {notification.title}
                    </span>
                    <time
                      dateTime={notification.createdAt}
                      className="tnum shrink-0 text-xs text-muted-foreground/70"
                    >
                      {timeAgo(notification.createdAt)}
                    </time>
                  </span>
                  <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                    {notification.body}
                  </span>
                </span>
              </>
            );

            return (
              <li key={notification.id}>
                {notification.link ? (
                  <Link
                    to={notification.link}
                    onClick={open}
                    className="flex gap-3 py-4 transition-colors hover:bg-secondary/50"
                  >
                    {body}
                  </Link>
                ) : (
                  /* Not every notification points anywhere. Those are still
                     readable, just not clickable — a link to nowhere is worse
                     than plain text. */
                  <div className="flex gap-3 py-4">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-8 text-xs text-muted-foreground">
        The most recent 20 are kept.
      </p>
    </div>
  );
}
