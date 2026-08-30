import { useEffect, useRef, useState } from "react";

/**
 * The consent prompt.
 *
 * ── What this app actually does, which is the whole reason the copy is short ─
 *
 * ImpactBridge sets exactly ONE cookie today: the httpOnly refresh token,
 * scoped to `/api/auth`. It exists to keep you signed in, it is never read by
 * anything else, and under both GDPR and the ePrivacy directive it is
 * "strictly necessary" — which means asking permission for it would be
 * theatre. You cannot decline it and keep a working sign-in, so offering a
 * choice that does not exist is worse than not asking.
 *
 * What IS optional is campaign attribution: capturing the `utm_*` tags off the
 * URL you arrived on so we can tell which link actually brought someone here.
 * That is genuinely elective, so that is what this banner asks about, and it
 * is what the banner says out loud.
 *
 * ── The contract with the attribution code ─────────────────────────────────
 *
 * Two names, and they are fixed — the attribution module reads the first and
 * listens for the second:
 *
 *   localStorage["ib_consent"]  →  "granted" | "denied"   (absent = undecided)
 *   window event "ib:consent"   →  CustomEvent<detail: choice>
 *
 * The event matters because attribution is initialised long before anyone
 * clicks a button here; polling localStorage would be the alternative and it
 * would either be a timer or it would miss the decision entirely.
 *
 * ── No dark patterns ───────────────────────────────────────────────────────
 *
 * Both buttons are the same height, the same width and side by side. There is
 * no "manage preferences" maze behind the decline, no pre-ticked box, and
 * nothing is captured before the choice is made. If a visitor cannot find the
 * decline as fast as the accept, the consent is not consent.
 */

/** Fixed by contract — the attribution module reads this exact key. */
const STORAGE_KEY = "ib_consent";

/** Fixed by contract — the attribution module listens for this exact name. */
const CONSENT_EVENT = "ib:consent";

export type ConsentChoice = "granted" | "denied";

/**
 * Reads the stored decision, treating anything unrecognised as undecided.
 *
 * Wrapped in try/catch because `localStorage` THROWS rather than returning null
 * in Safari private mode and under a blocked-cookies policy. An uncaught throw
 * here happens during render and takes the whole app down with it — a consent
 * banner is the last component that should be able to blank the page.
 */
function readStoredChoice(): ConsentChoice | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}

export function CookieBanner() {
  /*
   * Read the decision in a LAZY initialiser, not an effect.
   *
   * The effect version renders the banner once and removes it on the next
   * commit, so every returning visitor gets a flash of a prompt they answered
   * months ago — on every single navigation that remounts this. The initialiser
   * runs before the first paint, so a decided visitor never sees a frame of it.
   */
  const [decided, setDecided] = useState(() => readStoredChoice() !== null);
  const panelRef = useRef<HTMLDivElement>(null);

  /*
   * Lift the floating stack (BackToTop, FloatingContact) clear of the banner
   * while it is open, by overriding `--float-bottom` on <html>. See the token
   * block in index.css for the full stacking contract.
   *
   * Measured with a ResizeObserver rather than hard-coded: this banner is two
   * lines at 1440px and six at 375px, so any constant is wrong at one of those
   * widths. Cleaning the property up on unmount is what puts the stack back
   * down in the corner once a choice is made.
   */
  useEffect(() => {
    const node = panelRef.current;
    if (decided || !node) return;

    const root = document.documentElement;
    const sync = () => {
      root.style.setProperty(
        "--float-bottom",
        `calc(${node.offsetHeight}px + var(--float-gap) * 2)`,
      );
    };

    const observer = new ResizeObserver(sync);
    observer.observe(node);
    sync();

    return () => {
      observer.disconnect();
      root.style.removeProperty("--float-bottom");
    };
  }, [decided]);

  function choose(choice: ConsentChoice) {
    try {
      window.localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      /*
       * Storage is unavailable (private mode, blocked cookies). Announce the
       * choice anyway so attribution honours it for THIS page load, and dismiss
       * the banner so the visitor is not asked twice in one session. It will
       * ask again next visit, which is the correct failure: with nowhere to
       * record a decision, "no record" must mean "not yet consented".
       */
    }

    window.dispatchEvent(
      new CustomEvent<ConsentChoice>(CONSENT_EVENT, { detail: choice }),
    );
    setDecided(true);
  }

  if (decided) return null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Privacy and cookies"
      /*
       * `fixed`, so appearing costs no reflow — an in-flow banner would shove
       * the page up under the reader's cursor a beat after it settled.
       *
       * z-30 puts it above page content and below the floating stack at z-40,
       * which is deliberate: you must still be able to hit back-to-top while
       * you are deciding. Full stacking contract is in index.css.
       *
       * Anchored bottom-left and capped at `max-w-lg` rather than run as a
       * full-width bar: a bar tall enough to hold honest copy eats a third of a
       * 375px screen, and on this site the bottom of the first screen is where
       * the landing page puts its scroll cue.
       */
      className="no-print fixed inset-x-4 bottom-4 z-30 mx-auto max-w-lg animate-fade-up rounded-xl border border-border bg-card p-5 shadow-float sm:left-6 sm:right-auto sm:mx-0"
    >
      <h2 className="font-display text-base font-semibold text-foreground">
        One cookie, and one question
      </h2>

      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Signing in sets a single cookie that keeps you signed in. It is required
        for the site to work, so it is not something we can offer to switch off.
      </p>

      <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
        What <em className="not-italic text-foreground">is</em> optional: we can
        remember which link brought you here — the{" "}
        <code className="rounded bg-secondary px-1 py-0.5 text-[0.8em] text-foreground">
          utm_
        </code>{" "}
        tags in the address bar — so we can tell what is actually reaching
        people. It stays on this device. It is never sold, shared or used to
        build a profile of you.
      </p>

      {/*
        Equal width, equal height, side by side, no default. Accept is filled
        and decline is outlined so the pair reads as a pair rather than as one
        button and a link — but they are the same size and the same distance
        from the thumb, which is the part that decides whether a decline is a
        real option.
      */}
      <div className="mt-4 flex gap-2.5">
        <button
          type="button"
          onClick={() => choose("denied")}
          className="inline-flex h-10 flex-1 items-center justify-center rounded-lg border border-border bg-card text-sm font-semibold text-foreground transition-all duration-200 ease-out-soft hover:border-primary/30 hover:bg-secondary/60 active:scale-[0.97]"
        >
          No thanks
        </button>
        <button
          type="button"
          onClick={() => choose("granted")}
          className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground shadow-subtle transition-all duration-200 ease-out-soft hover:bg-primary/90 active:scale-[0.97]"
        >
          That's fine
        </button>
      </div>
    </div>
  );
}
