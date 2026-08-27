import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "@/lib/gsap";

/**
 * One line, drawn down the entire page as you scroll.
 *
 * Same technique as the GSAP squiggle reference — `getTotalLength()`,
 * `stroke-dasharray`, `stroke-dashoffset` scrubbed by scroll — with the two
 * rules that reference is emphatic about:
 *
 *  - the trigger is this DIV, never the SVG. SVG internals live in their own
 *    coordinate space and cannot be measured against the viewport.
 *  - the range is clamped: the draw starts when the region's top reaches the
 *    middle of the screen and ends when its bottom does.
 *
 * ── The viewBox is computed, and that is not a detail ──────────────────────
 *
 * The first version used a fixed `viewBox="0 0 100 100"` stretched over a box
 * ~1430 wide and ~9500 tall. Inside that box one horizontal unit costs exactly
 * as much PATH LENGTH as one vertical unit, while being worth about a tenth as
 * much on screen — so **81% of the line's length was being spent going
 * sideways**. Since the draw is a fraction of length, the line raced through
 * each horizontal loop and crawled between them: it read as not tracking the
 * scroll at all, which is precisely what it was doing.
 *
 * The viewBox is now sized to the region's real aspect ratio — `0 0 100 H`
 * where `H = 100 × height / width`. That makes the horizontal and vertical
 * scales EQUAL, so a unit of path length is worth the same on screen wherever
 * it points, and the drawn fraction tracks the scrolled fraction. It also means
 * the stretch is uniform, which removes the need for `vector-effect`.
 *
 * ── Why there is no filter ─────────────────────────────────────────────────
 *
 * There was a `drop-shadow` on the bright stroke, for glow. A filter forces the
 * browser to recompute its whole filter region on every repaint, and the repaint
 * here fires on every scroll frame against a 13.6 MEGAPIXEL element. It lagged
 * the entire site. The bloom is gone; the halo below does the legibility job it
 * was really there for, and costs one extra stroke instead of a full-page
 * filter pass.
 */

/**
 * The serpentine, as fractions of the region.
 *
 * `x` is a percentage of the width, `y` a fraction of the height, so the shape
 * survives any page length. Generated rather than hand-written because the
 * vertical unit depends on the computed viewBox height.
 */
const WAYPOINTS: Array<[x: number, y: number]> = [
  [12, 0], [34, 0.08], [70, 0.16], [24, 0.26], [74, 0.36],
  [18, 0.46], [72, 0.56], [26, 0.66], [70, 0.76], [30, 0.88], [52, 1],
];

/** A smooth curve through the waypoints, in the computed unit system. */
function buildPath(unitsY: number): string {
  const points = WAYPOINTS.map(([x, y]) => [x, y * unitsY] as const);

  return points
    .map(([x, y], i) => {
      if (i === 0) return `M ${x} ${y}`;
      const [px, py] = points[i - 1]!;
      // Vertical control handles: the curve leaves and enters each waypoint
      // travelling DOWN, which is what keeps a serpentine from looping.
      const midway = (py + y) / 2;
      return `C ${px} ${midway}, ${x} ${midway}, ${x} ${y}`;
    })
    .join(" ");
}

export function PageThread({ className }: { className?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) return;

    const svg = root.querySelector("svg");
    const paths = Array.from(root.querySelectorAll<SVGPathElement>("path"));
    if (!svg || paths.length === 0) return;

    /*
     * Everything geometric is derived from the region's real box, so a page
     * that grows when images land is re-fitted rather than left wrong.
     */
    const fit = () => {
      const width = root.clientWidth;
      const height = root.clientHeight;
      if (!width || !height) return;

      const unitsY = (100 * height) / width;
      svg.setAttribute("viewBox", `0 0 100 ${unitsY.toFixed(2)}`);

      const d = buildPath(unitsY);
      // Stroke widths in user units, so they render at a fixed pixel size
      // without the cost of `vector-effect: non-scaling-stroke`.
      const unit = 100 / width;
      for (const path of paths) path.setAttribute("d", d);
      paths[0]!.setAttribute("stroke-width", String(7 * unit));
      paths[1]!.setAttribute("stroke-width", String(3 * unit));

      root.style.setProperty("--len", String(Math.ceil(paths[0]!.getTotalLength())));
    };

    fit();
    root.classList.add("th-scrub");

    let frame = 0;

    const update = () => {
      frame = 0;

      const rect = root.getBoundingClientRect();
      /*
       * `clamp(top center)` → `clamp(bottom center)` as arithmetic: how far the
       * viewport's centre line has travelled through this region.
       */
      const travelled = window.innerHeight / 2 - rect.top;
      const progress = rect.height > 0 ? travelled / rect.height : 0;

      root.style.setProperty("--th-p", Math.min(Math.max(progress, 0), 1).toFixed(4));
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };

    const onResize = () => {
      fit();
      onScroll();
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });

    /*
     * The region is the whole page, so its height changes as images and fonts
     * land. Re-fit when it does — but NOT on every scroll frame: the observer
     * fires on box changes only.
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

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      /* z-5: above every section BACKGROUND, below every text column, each of
         which carries `relative z-10`. See HANDOFF §3.5c. */
      className={`pointer-events-none absolute inset-0 z-[5] ${className ?? ""}`}
    >
      <svg
        className="h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        fill="none"
        /* The line is decoration over a scrolling page; speed beats hinting. */
        shapeRendering="optimizeSpeed"
      >
        <defs>
          <linearGradient id="th-grad" x1="0" y1="0" x2="0" y2="1">
            {/* Marigold to white, top to bottom: the colour reports depth. */}
            <stop offset="0%" stopColor="hsl(var(--accent))" />
            <stop offset="45%" stopColor="hsl(var(--accent))" />
            <stop offset="80%" stopColor="hsl(38 92% 76%)" />
            <stop offset="100%" stopColor="hsl(40 60% 98%)" />
          </linearGradient>
        </defs>

        {/* The halo: same path, wider and dark, so the bright stroke survives
            the paper sections as well as the ink ones. This is also what the
            removed drop-shadow was really doing. */}
        <path className="th-line" stroke="hsl(var(--ink) / 0.5)" strokeLinecap="round" />
        <path className="th-line th-line--bright" stroke="url(#th-grad)" strokeLinecap="round" />
      </svg>
    </div>
  );
}
