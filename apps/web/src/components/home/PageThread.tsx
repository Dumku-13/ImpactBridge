import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "@/lib/gsap";

/**
 * One line, drawn down the entire page as you scroll.
 *
 * Not a section decoration: a single continuous path that starts at the top of
 * the landing page and finishes at the bottom, threading through the gutters
 * and the empty half of each composition. It is the same idea as the squiggle
 * in the GSAP reference — `getTotalLength()`, `stroke-dasharray`, and a
 * `stroke-dashoffset` scrubbed by scroll — with three deliberate differences.
 *
 * ── 1. The trigger is this DIV, never the SVG ──────────────────────────────
 *
 * SVG internals live in their own coordinate space and cannot be used as
 * scroll triggers. The progress here is measured from the WRAPPER's box in page
 * coordinates; the path is only ever a thing being drawn, never a thing being
 * measured against the viewport.
 *
 * ── 2. Clamped start and end ───────────────────────────────────────────────
 *
 * The reference uses `clamp(top center)` → `clamp(bottom center)`: the draw
 * begins when the top of the region reaches the middle of the screen and
 * finishes when its bottom does. Same mapping here, done in arithmetic —
 * `(viewport centre − region top) / region height`, clamped to 0…1 — so the
 * line is never still being drawn after the page has ended, and never finishes
 * a screen early.
 *
 * ── 3. One variable, no timeline ───────────────────────────────────────────
 *
 * The progress is written once per frame as `--th-p` and CSS does the rest.
 * That keeps it consistent with the opening's explode, costs no animation
 * library on this path, and — the practical reason — makes it TESTABLE: the
 * variable can be set by hand and the resulting geometry measured, which a
 * scrubbed timeline does not allow.
 *
 * ── Why it is legible over both grounds ────────────────────────────────────
 *
 * The page runs ink → paper → ink. A single stroke colour would disappear
 * against one of them, so the line is drawn TWICE: a dark under-stroke slightly
 * wider than the bright one, then the gradient on top. The halo keeps marigold
 * and white readable on paper as well as on ink, and it costs one extra path.
 */
export function PageThread({ className }: { className?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) return;

    const paths = Array.from(root.querySelectorAll<SVGPathElement>("path"));
    if (paths.length === 0) return;

    /*
     * Both paths share one `d`, so one length serves both. Written to the
     * wrapper as `--len` — there is no way to ask CSS for a path's length.
     */
    const setLength = () => {
      const length = Math.ceil(paths[0]!.getTotalLength());
      root.style.setProperty("--len", String(length));
    };

    setLength();
    root.classList.add("th-scrub");

    let frame = 0;

    const update = () => {
      frame = 0;

      const rect = root.getBoundingClientRect();
      /*
       * `clamp(top center)` → `clamp(bottom center)`, as arithmetic: how far
       * the viewport's centre line has travelled through this region.
       */
      const centre = window.innerHeight / 2;
      const travelled = centre - rect.top;
      const progress = rect.height > 0 ? travelled / rect.height : 0;

      root.style.setProperty("--th-p", Math.min(Math.max(progress, 0), 1).toFixed(4));
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };

    const onResize = () => {
      setLength();
      onScroll();
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });

    /*
     * The page's height changes as images and fonts land, and this region is
     * the whole page — so its box is wrong until they have. Cheaper and more
     * reliable than guessing a delay.
     */
    const observer = new ResizeObserver(onResize);
    observer.observe(root);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      observer.disconnect();
      root.classList.remove("th-scrub");
    };
  }, []);

  /*
   * A serpentine authored in percentages of the region, so it stretches with
   * whatever the page's real height turns out to be. It crosses from gutter to
   * gutter, which is what puts it through the empty half of each composition
   * rather than across the reading column.
   */
  const d =
    "M 10 0 " +
    "C 10 4, 34 5, 34 9 " +
    "S 68 13, 68 17 " +
    "S 22 22, 22 27 " +
    "S 74 32, 74 37 " +
    "S 18 43, 18 48 " +
    "S 72 54, 72 59 " +
    "S 24 65, 24 70 " +
    "S 70 76, 70 81 " +
    "S 30 88, 30 94 " +
    "S 52 98, 52 100";

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      /* Above the section backgrounds, below nothing that can be clicked. The
         path is authored to run through the gutters, so it crosses the reading
         column only between sections. */
      className={`pointer-events-none absolute inset-0 z-[5] ${className ?? ""}`}
    >
      <svg
        className="h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        fill="none"
      >
        <defs>
          <linearGradient id="th-grad" x1="0" y1="0" x2="0" y2="1">
            {/* Marigold to white, top to bottom: the colour reports depth. */}
            <stop offset="0%" stopColor="hsl(var(--accent))" />
            <stop offset="42%" stopColor="hsl(var(--accent))" />
            <stop offset="78%" stopColor="hsl(38 92% 74%)" />
            <stop offset="100%" stopColor="hsl(40 60% 98%)" />
          </linearGradient>
        </defs>

        {/* The halo: same path, wider, dark, so the bright stroke survives the
            paper sections as well as the ink ones. */}
        <path
          className="th-line"
          d={d}
          stroke="hsl(var(--ink) / 0.55)"
          strokeWidth="7"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        <path
          className="th-line th-line--bright"
          d={d}
          stroke="url(#th-grad)"
          strokeWidth="3"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
