import { useEffect } from "react";

/**
 * ── First-party campaign attribution ─────────────────────────────────────────
 *
 * What this is, stated plainly because the shape of the file invites the wrong
 * assumption: there is NO third-party script here, no analytics vendor, no
 * tracking pixel, no network call of any kind, and no identifier that follows a
 * person between sites. The entire implementation is a handful of strings read
 * out of our own URL and written to our own `localStorage`, in the visitor's own
 * browser, readable only by this origin.
 *
 * That is not an unfinished first step toward wiring up a real analytics SDK. It
 * is the design. A donation platform asking people for money has no business
 * handing their browsing to a third party in order to learn that an email
 * campaign worked, and the question "which campaign brought this donor" is
 * answerable from data we already have. If something ever does need to leave the
 * browser, `getAttribution()` is the seam it goes through — deliberately one
 * function, so that decision cannot be made by accident.
 *
 * ── Consent ──────────────────────────────────────────────────────────────────
 *
 * Nothing is captured until the visitor says yes. The consent banner is a
 * separate component and this module never reads or writes its decision — it
 * only listens. The contract is fixed:
 *
 *   localStorage["ib_consent"]  →  "granted" | "denied" | absent (undecided)
 *   window event "ib:consent"   →  e.detail is the new value
 *
 * Undecided is treated exactly like denied. Silence is not consent.
 */

const CONSENT_KEY = "ib_consent";
const CONSENT_EVENT = "ib:consent";
const STORAGE_KEY = "ib_attribution";

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;

export type ConsentValue = "granted" | "denied";

export interface Attribution {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  term: string | null;
  content: string | null;
  /** Where they came from, as the browser reported it. Empty string means direct. */
  referrer: string | null;
  /** The path they arrived on — a campaign that lands on /grants is a different campaign. */
  landingPath: string;
  capturedAt: string;
}

/*
 * Every storage access is wrapped.
 *
 * `localStorage` is not merely empty in a locked-down browser — the getter
 * THROWS. Safari with cross-site tracking prevention, Chrome with third-party
 * cookies blocked in an embedded context, and any browser with site data
 * disabled all raise a SecurityError on property access, not on read. An
 * unguarded `localStorage.getItem` here would take down the entire app root for
 * the most privacy-conscious visitors, which would be a fitting irony.
 */
function safeRead(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage full or blocked. Attribution is a nice-to-have; losing it is not
    // worth an exception on a page that is otherwise working.
  }
}

function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // As above.
  }
}

function readConsent(): ConsentValue | null {
  const raw = safeRead(CONSENT_KEY);
  return raw === "granted" || raw === "denied" ? raw : null;
}

function readStored(): Attribution | null {
  const raw = safeRead(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Attribution;
    // A stored blob is only trustworthy to the extent it is checked. Anything
    // hand-edited or written by an older version is discarded rather than fed
    // to a caller expecting this shape.
    return typeof parsed?.landingPath === "string" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The campaign tags currently in the address bar, or null if there are none.
 */
function readUtmFromUrl(search: string) {
  const params = new URLSearchParams(search);
  const found = UTM_KEYS.some((key) => params.get(key));
  if (!found) return null;

  return {
    source: params.get("utm_source"),
    medium: params.get("utm_medium"),
    campaign: params.get("utm_campaign"),
    term: params.get("utm_term"),
    content: params.get("utm_content"),
  };
}

/**
 * Remove the utm_* parameters from the address bar without navigating.
 *
 * Two things this protects against. The obvious one: a visitor who copies the
 * URL out of the address bar and shares it would otherwise tag every person who
 * follows it with someone else's campaign, quietly poisoning the numbers the
 * whole exercise exists to produce. The less obvious one: campaign tags end up
 * in `document.referrer` on outbound links, in screenshots, and in support
 * tickets, and none of those are places a marketing identifier belongs.
 *
 * `history.replaceState` is used rather than React Router's `navigate(...,
 * { replace: true })` on purpose — it rewrites the URL without producing a
 * navigation, so no route re-renders, no scroll position is lost, no data
 * refetches, and this runs safely from an effect at the app root without racing
 * the router's own first render.
 *
 * `window.history.state` is passed BACK IN rather than left as null. React
 * Router keeps its own bookkeeping there (an index and any `state` a link
 * carried); replacing it with null strands the router's history stack, which
 * breaks the back button and silently empties `location.state` — the object
 * ProtectedRoute uses to send a user back where they were headed after signing
 * in.
 *
 * One honest limitation: the router's in-memory location still holds the
 * original search string until the next real navigation, so a component calling
 * `setSearchParams` before then could write the tags back. Nothing in the app
 * does that on a landing route today.
 */
function stripUtmFromUrl(): void {
  const url = new URL(window.location.href);
  let changed = false;

  for (const key of UTM_KEYS) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }

  if (!changed) return;

  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}

/**
 * Capture the current visit, if consent allows and there is anything to record.
 *
 * ── Why FIRST-touch ──────────────────────────────────────────────────────────
 *
 * Once a visit is recorded it is not overwritten by a later one. For a donation
 * funnel that is the honest default, and last-touch would actively mislead.
 *
 * Giving money is a considered decision with a long gap in the middle: someone
 * reads a campaign, thinks about it for a week, then comes back by typing the
 * name into their browser or clicking a bookmark. Under last-touch that donation
 * is credited to "direct", the campaign that actually did the persuading scores
 * zero, and the rational response is to stop running the thing that works. First
 * touch answers the question the platform actually needs answered — what
 * introduced this person to us — rather than which link they happened to have
 * open at the end.
 *
 * The one exception below is deliberate: a stored record that carries only a
 * referrer, with no campaign at all, IS upgraded when a tagged link later
 * arrives. "Somebody linked to us" is strictly weaker information than "this
 * named campaign brought them", and it would be perverse to let the weaker one
 * permanently block the stronger. Once a `source` is recorded, it is final.
 */
function captureIfConsented(): void {
  if (readConsent() !== "granted") return;

  const utm = readUtmFromUrl(window.location.search);
  const referrer = document.referrer || null;

  const existing = readStored();
  // First touch already recorded, and it carries a real campaign. Nothing to do
  // but clean the address bar — a returning visitor should still not be able to
  // hand someone else their campaign tags.
  if (existing?.source) {
    stripUtmFromUrl();
    return;
  }

  /*
   * An external referrer counts as attribution on its own; our own pages do
   * not. Without this check every internal navigation that ran this code would
   * look like a fresh referred visit from ourselves.
   */
  const isExternalReferrer =
    !!referrer && !referrer.startsWith(window.location.origin);

  // A direct visit with no tags and no referrer carries nothing worth storing.
  // Recording an empty husk here would be actively harmful: it would count as
  // the "first touch" and lock out the real campaign click that comes next.
  if (!utm && !isExternalReferrer) return;

  // An existing referrer-only record is kept unless this visit brings a campaign.
  if (existing && !utm) return;

  const attribution: Attribution = {
    source: utm?.source ?? null,
    medium: utm?.medium ?? null,
    campaign: utm?.campaign ?? null,
    term: utm?.term ?? null,
    content: utm?.content ?? null,
    referrer: isExternalReferrer ? referrer : null,
    landingPath: window.location.pathname,
    capturedAt: new Date().toISOString(),
  };

  safeWrite(STORAGE_KEY, JSON.stringify(attribution));
  stripUtmFromUrl();
}

/**
 * What we know about how this visitor first arrived, or null.
 *
 * The seam for a future signup or donation call that wants to attach a source:
 * `apiPost("/auth/register", { ...values, attribution: getAttribution() })`.
 *
 * Consent is re-checked on read rather than trusted from write time. Denial
 * clears storage, so this is belt and braces — but a function that hands out
 * attribution data is exactly the wrong place to assume an invariant held
 * somewhere else.
 */
export function getAttribution(): Attribution | null {
  if (readConsent() !== "granted") return null;
  return readStored();
}

/** Forget everything. Called when consent is withdrawn. */
export function clearAttribution(): void {
  safeRemove(STORAGE_KEY);
}

/**
 * Mount once at the app root.
 *
 * Runs a capture on load and then watches for the consent decision changing in
 * either direction, because both directions have to do something:
 *
 *   → granted: capture NOW. The visitor arrived on a tagged URL, sat looking at
 *     the banner, and clicked accept. The tags are usually still in the address
 *     bar at that moment, and this is the only chance to read them — which is
 *     also why the strip step lives inside `captureIfConsented` and never runs
 *     while the decision is outstanding. Cleaning the URL early would look
 *     tidier and would throw away the data the moment consent arrived.
 *
 *   → denied: delete what is stored. Withdrawing consent has to mean the data
 *     goes, not merely that collection stops; a "denied" that leaves last
 *     month's campaign sitting in localStorage is a checkbox, not a choice.
 *
 * Safe under StrictMode's double-invoked effects: capture is idempotent (first
 * touch wins, and the second pass finds a record already written), and the
 * listener is removed on cleanup.
 */
export function useUtmCapture(): void {
  useEffect(() => {
    captureIfConsented();

    /*
     * Typed by hand rather than by augmenting `WindowEventMap`. A global
     * interface augmentation for "ib:consent" declared in two files with even
     * slightly different detail types is a compile error in whichever file
     * loses, and the consent banner is being written separately — this keeps
     * the two sides independent.
     */
    const onConsentChange = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;

      if (detail === "denied") {
        clearAttribution();
        return;
      }
      if (detail === "granted") {
        captureIfConsented();
      }
      // Anything else — a malformed event, a value we don't recognise — is
      // ignored rather than guessed at. Guessing here means capturing without
      // consent.
    };

    window.addEventListener(CONSENT_EVENT, onConsentChange);
    return () => window.removeEventListener(CONSENT_EVENT, onConsentChange);
  }, []);
}
