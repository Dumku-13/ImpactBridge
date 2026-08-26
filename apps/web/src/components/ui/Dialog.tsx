import { useCallback, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Elements that can hold focus, for the focus trap. */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal dialog: portal, focus trap, Escape, scroll lock.
 *
 * The app had no overlay primitive at all — the notification dropdown was the
 * only thing resembling one, and it had neither a focus trap nor an Escape
 * handler. Every overlay from here (the full-screen menu, trace funding,
 * confirmations) builds on this so that accessibility is the default rather
 * than something each caller remembers to reimplement.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  className,
  variant = "centered",
  showClose = true,
}: {
  open: boolean;
  onClose: () => void;
  /**
   * Accessible name. Rendered visually unless `showClose` is false and the
   * caller supplies its own heading — it is never omitted, because a dialog
   * without a name is announced as just "dialog".
   */
  title: string;
  children: ReactNode;
  className?: string;
  /** `fullscreen` is the editorial menu takeover; `centered` is a normal modal. */
  variant?: "centered" | "fullscreen";
  showClose?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Remembered so focus can go back where it came from — losing your place in
  // the page after closing a dialog is disorienting for keyboard users.
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null);

      if (focusable.length === 0) {
        // Nothing to tab to — keep focus on the panel rather than letting it
        // escape to the page behind.
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;

      // Wrap at both ends so Tab can never reach the inert page behind.
      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  useLayoutEffect(() => {
    if (!open) return;

    returnFocusRef.current = document.activeElement as HTMLElement | null;

    /*
     * Lock scroll by compensating for the scrollbar width. Setting
     * `overflow: hidden` alone removes the scrollbar and the page jumps
     * sideways by ~15px behind the overlay — a small detail that reads as
     * broken every time.
     */
    const { body, documentElement } = document;
    const scrollbarWidth = window.innerWidth - documentElement.clientWidth;
    const previousOverflow = body.style.overflow;
    const previousPadding = body.style.paddingRight;
    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;

    document.addEventListener("keydown", handleKeyDown, true);

    /*
     * Focus the panel so screen readers announce the dialog's name before the
     * first control inside it.
     *
     * This must run in a layout effect body rather than a rAF callback: the
     * portal's children are committed synchronously with this effect, but a rAF
     * scheduled here can fire before the browser considers the node focusable,
     * leaving focus stranded on <body> — which silently defeats the entire trap,
     * since Tab then walks the page behind the dialog.
     */
    panelRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPadding;
      returnFocusRef.current?.focus?.();
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-50 flex",
        variant === "centered"
          ? "items-center justify-center p-4 sm:p-6"
          : "items-stretch",
      )}
    >
      {/*
        Plain tinted scrim, no `backdrop-blur`: blurring a full-viewport layer
        forces the compositor to re-sample everything beneath it every frame,
        which is exactly the class of effect that caused this app's scroll jank
        before.
      */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 animate-fade-in bg-foreground/40"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          "relative z-10 w-full bg-card text-foreground outline-none",
          variant === "centered"
            ? "max-w-lg animate-scale-in rounded-xl border border-border p-6 shadow-float"
            : "animate-fade-in",
          className,
        )}
      >
        {showClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-all duration-200 ease-out-soft hover:bg-secondary hover:text-foreground active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
