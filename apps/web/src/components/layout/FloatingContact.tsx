import { useEffect, useRef, useState } from "react";
import { Mail, MessageCircle, X } from "lucide-react";

/**
 * A small "get in touch" affordance in the corner.
 *
 * ── What it deliberately is NOT ────────────────────────────────────────────
 *
 * There is no contact form here. A form implies something on the other end of
 * it, and there is nothing on the other end of it — this project has no
 * ticketing system, no shared inbox and no one on rota. A form that POSTs to
 * `/api/contact` and returns a cheerful "we'll be in touch!" is a lie told to
 * someone who needed help, and it is the single most common piece of fiction in
 * a portfolio project. So: one `mailto:`, which opens the visitor's own mail
 * client, which they can see, keep a copy of, and follow up on themselves.
 *
 * For the same reason there is no phone number and no postal address. Inventing
 * either would make the page look more established and would waste the time of
 * anyone who tried them.
 *
 * ── Stacking ───────────────────────────────────────────────────────────────
 *
 * This owns the ANCHOR slot of the floating stack (`--float-bottom`) because it
 * is always mounted; BackToTop stacks one `--float-slot` above it because it
 * comes and goes. If those were the other way round, this button would hop down
 * the screen every time the scroll one vanished. Offsets are tokens in
 * index.css, along with the app's full z-order table — read that before moving
 * anything here.
 */

/**
 * The author's own address. Not a support alias, because there is no support
 * team to alias to — see the note above about not inventing one. If this
 * project ever gets a real inbox, this is the one line to change.
 */
const CONTACT_EMAIL = "jaymathapaty@gmail.com";

const MAILTO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
  "ImpactBridge",
)}`;

export function FloatingContact() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  /*
   * Escape and outside-click, registered only while open — a document-level
   * listener that lives for the whole session to serve a panel that is shut
   * 99% of the time is a cost paid on every click in the app.
   *
   * This panel is NOT modal: it holds one link, it obscures nothing, and
   * trapping focus in it would be heavier than the thing deserves. (The mobile
   * menu is a different matter and does trap — see MobileNav.)
   */
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      // Escape that leaves focus floating in a removed subtree drops the
      // keyboard user back at the top of the document on their next Tab.
      triggerRef.current?.focus();
    }

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="no-print fixed right-[var(--float-gap)] bottom-[var(--float-bottom)] z-40"
    >
      {open && (
        <div
          role="dialog"
          aria-label="Contact"
          /*
           * Opens upward and to the left from the button, and is width-capped
           * against the viewport rather than the parent: the parent is a 44px
           * button pinned to the right edge, so an unconstrained panel would
           * hang off the screen at 375px.
           */
          className="absolute bottom-[calc(100%+0.75rem)] right-0 w-[min(20rem,calc(100vw-2*var(--float-gap)))] animate-scale-in origin-bottom-right rounded-xl border border-border bg-card p-5 shadow-float"
        >
          <h2 className="font-display text-base font-semibold text-foreground">
            Get in touch
          </h2>

          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            ImpactBridge is a demonstration project, not a running service —
            payments are in test mode and no real money moves through it. There
            is no support desk, so questions come straight to the person who
            built it.
          </p>

          <a
            href={MAILTO}
            className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-subtle transition-all duration-200 ease-out-soft hover:bg-primary/90 active:scale-[0.97]"
          >
            <Mail className="h-4 w-4" />
            Email {CONTACT_EMAIL.split("@")[0]}
          </a>

          {/* An honest expectation beats a fake SLA. One person, one inbox. */}
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Replies usually take a day or two — it is one person reading them.
          </p>
        </div>
      )}

      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={open ? "Close contact panel" : "Contact"}
        title="Contact"
        className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-float transition-all duration-200 ease-out-soft hover:border-primary/30 hover:text-primary active:scale-90"
      >
        {open ? (
          <X className="h-4 w-4" />
        ) : (
          <MessageCircle className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}
