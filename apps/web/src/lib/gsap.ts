import { useLayoutEffect, useRef, type RefObject } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/*
 * Register once, at module scope. Registering inside a component re-runs on
 * every mount and GSAP warns about duplicate plugin registration.
 */
gsap.registerPlugin(ScrollTrigger);

export { gsap, ScrollTrigger };

/** True when the visitor has asked the OS to reduce motion. */
export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Scoped GSAP setup with guaranteed teardown.
 *
 * Every animation must be created inside a `gsap.context()` bound to the
 * component's root element. Two reasons, both learned the hard way in SPAs:
 *
 *  - Selectors inside the context are scoped to that root, so `".node"` can't
 *    reach into another route's DOM.
 *  - `context.revert()` kills every tween AND every ScrollTrigger the callback
 *    created. Without it, navigating away leaves orphaned triggers attached to
 *    a detached DOM, each still recalculating on scroll. They accumulate across
 *    a session and scroll degrades steadily — the symptom looks like a slow
 *    memory leak and is miserable to trace back.
 *
 * Under `prefers-reduced-motion` the callback never runs at all, rather than
 * running and then being disabled: the resting DOM is the finished state, so
 * skipping setup gives exactly the right result with no work.
 */
export function useGsap(
  setup: (ctx: { root: HTMLElement }) => void,
  deps: unknown[] = [],
): RefObject<HTMLDivElement> {
  const root = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    if (prefersReducedMotion()) return;

    const ctx = gsap.context(() => setup({ root: el }), el);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return root;
}

/**
 * Recalculate every trigger's start/end positions.
 *
 * Pin positions are computed against document height at creation time. If
 * images or a font land afterwards the document grows and every measurement
 * silently drifts — sections unpin early, progress reaches 1 before the section
 * is done. Call this once the things that change layout have settled.
 */
export function refreshScrollTriggers() {
  ScrollTrigger.refresh();
}

/**
 * Re-measure every trigger once the page has stopped moving underneath them.
 *
 * Triggers are created during mount, when web fonts have not yet swapped in and
 * images have no intrinsic size. Both change document height afterwards, and
 * every start/end computed before that is wrong — in practice badly wrong:
 * ranges collapse to zero (so a scrub never advances) or go negative (so a
 * section is treated as already passed).
 *
 * Call once per scroll-animated page. Refreshing is cheap and idempotent, so
 * doing it at each settle point is safer than trying to pick the single right
 * moment.
 */
export function useScrollTriggerRefresh() {
  useLayoutEffect(() => {
    if (prefersReducedMotion()) return;

    let cancelled = false;
    const refresh = () => {
      if (!cancelled) ScrollTrigger.refresh();
    };

    // Fonts change line-wrapping, which changes height.
    document.fonts?.ready.then(refresh);

    // `load` covers images that had no width/height attribute.
    if (document.readyState === "complete") refresh();
    else window.addEventListener("load", refresh, { once: true });

    // Backstop for anything that settles later still (lazy images entering
    // view, a late-arriving video poster).
    const timer = setTimeout(refresh, 1200);

    /*
     * And the case a timer cannot cover: the document getting TALLER after that
     * backstop has already fired.
     *
     * The landing page now renders panels of live records — organisations,
     * their totals, the open grants — fetched over the network and sitting
     * ABOVE every scroll-driven section on the page. When they arrive the
     * document grows by hundreds of pixels, and every trigger below them keeps
     * the start/end it measured against the shorter page: ranges collapse or
     * go negative, and a scrub either never advances or behaves as though its
     * section has already passed (§3.6).
     *
     * A slow request, an image with no intrinsic size, an expanded accordion —
     * all the same shape of problem. Watching the height catches them all,
     * where guessing a delay catches only the ones faster than the guess.
     */
    let settle = 0;
    let lastHeight = document.documentElement.scrollHeight;

    const observer = new ResizeObserver(() => {
      const height = document.documentElement.scrollHeight;
      // Only on a real change: the observer also fires on width-only resizes,
      // which ScrollTrigger already handles itself.
      if (height === lastHeight) return;
      lastHeight = height;

      // Debounced, because a run of images landing together would otherwise
      // trigger a full re-measure of every trigger on the page per image.
      clearTimeout(settle);
      settle = window.setTimeout(refresh, 160);
    });

    observer.observe(document.documentElement);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearTimeout(settle);
      observer.disconnect();
      window.removeEventListener("load", refresh);
    };
  }, []);
}
