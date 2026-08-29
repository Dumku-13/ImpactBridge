import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, Check } from "lucide-react";
import {
  useMarkAllRead,
  useMarkRead,
  useNotificationSocket,
  useNotifications,
} from "@/api/notifications";
import { cn } from "@/lib/utils";

/** "3m ago", "2h ago", "5d ago". */
function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function NotificationBell({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const { data } = useNotifications(signedIn);
  const markAllRead = useMarkAllRead();
  const markRead = useMarkRead();

  // Opens the live channel; the hook tears it down on sign-out.
  useNotificationSocket(signedIn);

  /*
   * Close on an outside click. Registered only while open, so we aren't
   * listening on every document click for the whole session.
   */
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!panelRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  if (!signedIn) return null;

  const unread = data?.unreadCount ?? 0;

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={
          unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
        }
        className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <Bell className="h-4 w-4" />

        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-sm font-medium text-foreground">
              Notifications
            </span>

            {unread > 0 && (
              <button
                type="button"
                disabled={markAllRead.isPending}
                onClick={() => markAllRead.mutate()}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-60"
              >
                <Check className="h-3 w-3" />
                {markAllRead.isPending ? "Marking…" : "Mark all read"}
              </button>
            )}
          </div>

          {markAllRead.isError && (
            <p className="border-b border-border bg-destructive/10 px-4 py-2 text-xs text-destructive">
              Couldn't mark those as read. Try again.
            </p>
          )}

          <ul className="max-h-96 divide-y divide-border overflow-y-auto">
            {(data?.items.length ?? 0) === 0 && (
              <li className="px-4 py-10 text-center text-sm text-muted-foreground">
                Nothing yet.
              </li>
            )}

            {data?.items.map((notification) => {
              const content = (
                <div
                  className={cn(
                    "px-4 py-3 transition-colors hover:bg-secondary/60",
                    !notification.readAt && "bg-primary/5",
                  )}
                >
                  <div className="flex items-start gap-2">
                    {!notification.readAt && (
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {notification.title}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {notification.body}
                      </p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {timeAgo(notification.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>
              );

              return (
                <li key={notification.id}>
                  {notification.link ? (
                    <Link
                      to={notification.link}
                      onClick={() => {
                        setOpen(false);
                        // Opening it is the read receipt. Fire-and-forget: the
                        // navigation must not wait on the request, and a failed
                        // mark is recoverable via "Mark all read".
                        if (!notification.readAt) {
                          markRead.mutate(notification.id);
                        }
                      }}
                    >
                      {content}
                    </Link>
                  ) : (
                    content
                  )}
                </li>
              );
            })}
          </ul>

          {/* The dropdown holds the most recent few; everything else lives on
              the page. Without this link nothing pointed there. */}
          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-border px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            See all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
