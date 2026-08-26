import { useEffect, useRef } from "react";

/**
 * Reveals grant rows as they scroll into view.
 *
 * Deliberately CSS + IntersectionObserver rather than a GSAP tween, for one
 * safety reason that matters more than the animation itself:
 *
 *   THE RESTING STATE OF A ROW IS VISIBLE.
 *
 * A `gsap.fromTo` applies its `from` state the instant it is created, then
 * relies on the ticker to animate out of it. If the tween never advances — a
 * background tab, a stalled frame loop, anything that pauses rAF — the row is
 * stranded at opacity 0 and the grant is simply invisible. That happened here:
 * filtering by cause left every row at zero, so the page looked empty.
 *
 * With this approach the row is visible by default and the entrance is purely
 * additive. If the animation never runs, the worst case is no animation — not
 * missing content.
 *
 * `replayKey` should be the filter signature: when it changes the result set is
 * genuinely different, so the entrance replays and a filter click is visibly
 * acknowledged rather than swapping text in place.
 */
export function useGrantRowReveal(replayKey: string) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const rows = Array.from(root.children).filter(
      (n): n is HTMLElement => n instanceof HTMLElement,
    );
    if (rows.length === 0) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Clear any previous run so a filter change re-plays rather than being
    // ignored because the class is already present.
    rows.forEach((row) => row.classList.remove("row-enter"));

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const row = entry.target as HTMLElement;
          const index = rows.indexOf(row);
          // Only the first few stagger; beyond that later rows arrive visibly
          // late for no benefit.
          row.style.animationDelay = `${Math.min(index, 4) * 70}ms`;
          row.classList.add("row-enter");
          observer.unobserve(row);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );

    rows.forEach((row) => observer.observe(row));
    return () => observer.disconnect();
  }, [replayKey]);

  return ref;
}
