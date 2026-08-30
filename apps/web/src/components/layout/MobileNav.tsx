import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { LogOut, Menu, X } from "lucide-react";
import { ROLE_LABELS } from "@impactbridge/shared";
import { useAuth } from "@/auth/AuthContext";
import { cn } from "@/lib/utils";

/**
 * The narrow-viewport half of the app header.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * The header used to put the wordmark, two nav links, the theme toggle, the
 * notification bell, the user's name and role, and a sign-out button on one
 * 375px row. There is a comment in AppLayout about the wordmark being truncated
 * to stop the page scrolling sideways — that was the symptom. Everything that
 * is not immediately reachable moves in here instead, and the desktop layout is
 * left exactly as it was.
 *
 * ── The four things a slide-over has to get right ────────────────────────────
 *
 * Escape closes it, focus is trapped inside while it is open, focus returns to
 * the trigger on close, and the page behind does not scroll. Skip any one and
 * it is a div that looks like a menu rather than a menu.
 */
export function MobileNav({ onSignOut }: { onSignOut: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  /*
   * Close on navigation.
   *
   * Clicking a link inside the panel changes the route but does NOT unmount
   * this component — the header is deliberately stable across navigation (see
   * the note in main.tsx about a single AppLayout). Without this the user taps
   * "Grants", the page changes underneath, and the menu is still sitting on top
   * of it.
   */
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  /* Escape, from anywhere — including from the panel's own backdrop. */
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  /*
   * Lock the page behind the panel.
   *
   * Restoring the PREVIOUS value rather than hard-coding "" matters: a modal
   * dialog may already have locked scrolling when this opens, and blanking the
   * property on close would silently unlock the page underneath it.
   */
  useEffect(() => {
    if (!open) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  /*
   * Focus management: move into the panel on open, trap Tab inside it, and hand
   * focus back to the trigger on close.
   *
   * The trap is a keydown handler rather than the `inert` attribute on the rest
   * of the document, because `inert` is still uneven across the browsers this
   * has to work in and a half-applied trap is worse than an explicit one.
   */
  useEffect(() => {
    if (!open) {
      return;
    }

    const panel = panelRef.current;
    if (!panel) return;

    const trigger = triggerRef.current;

    // Focus the close button rather than the panel itself: a screen reader
    // announces the dialog from its label, and the first Tab should land on
    // the first link, not on a container.
    const closeButton = panel.querySelector<HTMLElement>("[data-close]");
    closeButton?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab") return;

      const focusable = panel!.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      // Wrap in both directions, so Tab from the last item and Shift-Tab from
      // the first both stay inside instead of escaping to the browser chrome.
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    panel.addEventListener("keydown", onKeyDown);

    return () => {
      panel.removeEventListener("keydown", onKeyDown);
      // Returning focus is what makes the menu usable by keyboard twice in a
      // row: without it, focus falls back to <body> and the next Tab starts
      // from the top of the document.
      trigger?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Close menu" : "Open menu"}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 sm:hidden">
          {/*
            The backdrop is a plain div with a click handler, not a <button>:
            it is already reachable by Escape and by the labelled close control,
            and adding it to the tab order would put an unlabelled stop between
            the trigger and the menu's first real link.
          */}
          <div
            className="absolute inset-0 bg-foreground/40"
            onClick={close}
            aria-hidden="true"
          />

          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-modal="true"
            aria-label="Site menu"
            className="absolute inset-y-0 right-0 flex w-[min(20rem,85vw)] animate-slide-in-right flex-col border-l border-border bg-background shadow-xl"
          >
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-4">
              <p className="font-display text-base font-semibold tracking-tight text-foreground">
                Impact<span className="text-primary">Bridge</span>
              </p>
              <button
                type="button"
                data-close
                onClick={close}
                aria-label="Close menu"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-2 py-4">
              <ul className="space-y-1">
                <MobileNavItem to="/browse">Browse</MobileNavItem>
                <MobileNavItem to="/grants">Grants</MobileNavItem>
                {user && (
                  <MobileNavItem to="/notifications">
                    Notifications
                  </MobileNavItem>
                )}
              </ul>
            </nav>

            <div className="shrink-0 border-t border-border p-4">
              {user ? (
                <>
                  <p className="text-sm font-medium leading-tight text-foreground">
                    {user.name}
                  </p>
                  <p className="text-xs leading-tight text-muted-foreground">
                    {ROLE_LABELS[user.role]}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      onSignOut();
                    }}
                    className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    Sign out
                  </button>
                </>
              ) : (
                <div className="space-y-2">
                  <Link
                    to="/login"
                    className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-border text-sm font-medium text-foreground transition-colors hover:bg-secondary"
                  >
                    Sign in
                  </Link>
                  <Link
                    to="/signup"
                    className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    Get started
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MobileNavItem({ to, children }: { to: string; children: string }) {
  return (
    <li>
      <NavLink
        to={to}
        className={({ isActive }) =>
          cn(
            "block rounded-lg px-3 py-2.5 text-base font-medium transition-colors",
            isActive
              ? "bg-secondary text-foreground"
              : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
          )
        }
      >
        {children}
      </NavLink>
    </li>
  );
}
