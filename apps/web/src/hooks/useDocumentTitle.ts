import { useEffect } from "react";

const SUFFIX = "ImpactBridge";

/**
 * Set the browser tab's title for this route.
 *
 * A single-page app never changes `document.title` on its own, so every route
 * here read "ImpactBridge" — which makes browser history useless (twelve
 * identical entries), makes a bookmark meaningless, and makes a row of open tabs
 * unreadable. It is also the label a screen reader announces on navigation, so
 * without it the only signal that the page changed is that the content did.
 *
 * Pass `null` while data is still loading and the previous title stays put:
 * flashing "Loading… · ImpactBridge" between two real titles is worse than a
 * title that lags by 200ms.
 */
export function useDocumentTitle(title: string | null) {
  useEffect(() => {
    if (!title) return;

    const previous = document.title;
    document.title = title === SUFFIX ? title : `${title} · ${SUFFIX}`;

    /*
     * Restore on unmount. Without this, a route that sets a title and then
     * navigates somewhere that sets none would keep the stale one — the bug
     * shows up as the tab still naming the organisation you just left.
     */
    return () => {
      document.title = previous;
    };
  }, [title]);
}
