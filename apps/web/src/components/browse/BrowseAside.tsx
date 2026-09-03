import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The column beside each organisation plate in the browse opening.
 *
 * The plates are laid out at 70% / 56% / 62% of the column with different
 * offsets, which leaves a tall empty gutter alternating left and right. Left
 * bare it read as unfinished rather than as composition. This fills it with
 * the two things that belong there: the organisation's own words, and a drawn
 * line that echoes the page thread running behind everything.
 *
 * Desktop only. Below `sm` the plates are full width, there is no gutter, and
 * the mission already appears in the card itself — so this would be a
 * duplicate stacked under the image.
 */

/**
 * A line that draws itself once, when it comes into view.
 *
 * ── Why this is NOT scroll-scrubbed ─────────────────────────────────────────
 *
 * The page thread is scrubbed: it maps scroll position onto `stroke-dashoffset`
 * every frame. That is affordable exactly once, for one path. There are up to
 * five of these on the page, and `stroke-dashoffset` is a PAINT property — it
 * cannot be composited — so scrubbing all of them would put five path repaints
 * into every scroll frame and undo the work spent getting this page's scroll
 * path down to zero forced layouts.
 *
 * An IntersectionObserver fires once, flips a class, and a CSS transition does
 * the rest: the browser paints the animation on its own timeline and never
 * consults the scroll position at all. Visually it reads the same — a line
 * drawing itself as you arrive at it.
 *
 * ── pathLength, so nothing has to be measured ───────────────────────────────
 *
 * `getTotalLength()` would mean a JS read of layout per instance. SVG's
 * `pathLength` attribute re-scales the path's own coordinate system so its
 * length is exactly 1, which lets the dash array and offset be written as
 * literals. No measurement, no effect, no reflow.
 */
function DrawnArc({ mirrored }: { mirrored: boolean }) {
  const ref = useRef<SVGSVGElement>(null);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Respect the OS setting before observing anything: show the finished line.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDrawn(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setDrawn(true);
          observer.disconnect(); // draws once; never undraws on the way back up
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <svg
      ref={ref}
      aria-hidden="true"
      viewBox="0 0 120 260"
      fill="none"
      preserveAspectRatio="none"
      className={cn(
        "h-40 w-full opacity-70",
        // The gutter alternates sides, so the curve leans toward the plate it
        // belongs to rather than away from it.
        mirrored && "-scale-x-100",
      )}
    >
      <path
        d="M 8 4 C 8 70, 112 88, 112 150 C 112 206, 40 214, 40 256"
        stroke="hsl(var(--accent))"
        strokeWidth="1.5"
        strokeLinecap="round"
        /* Length normalised to 1 — see the note above. */
        pathLength={1}
        strokeDasharray={1}
        style={{
          /*
           * Rests at 0.6 drawn, never at 0 — the same rule as `Reveal`'s
           * `opacity-30` and the `fade-up` keyframes that start at 0.3.
           *
           * This whole effect depends on IntersectionObserver delivering. Where
           * it does not — a tab throttled during load, a renderer that never
           * composites — a hold at "fully undrawn" is permanent and the line is
           * simply absent, with nothing to indicate anything was meant to be
           * there. Resting part-drawn means the worst case is a shorter line
           * rather than no line. (The automated preview browser is exactly such
           * an environment: IO never fires there, which is how this was caught.)
           */
          strokeDashoffset: drawn ? 0 : 0.6,
          transition: "stroke-dashoffset 1.6s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      />
      {/* The terminal dot only appears once the line has arrived. */}
      <circle
        cx="40"
        cy="256"
        r="2.5"
        fill="hsl(var(--accent))"
        style={{
          // Same reasoning as the stroke: a dot that only exists after the
          // observer fires would never appear at all where it does not.
          opacity: drawn ? 1 : 0.35,
          transition: "opacity 0.4s ease-out 1.3s",
        }}
      />
    </svg>
  );
}

export function BrowseAside({
  mission,
  city,
  state,
  side,
}: {
  mission: string;
  city: string | null;
  state: string | null;
  /** Which gutter this sits in — decides the text alignment and the curve. */
  side: "left" | "right";
}) {
  const place = [city, state].filter(Boolean).join(", ");

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute top-6 hidden sm:block",
        side === "right"
          ? "left-full ml-10 w-[24%] text-left"
          : "right-full mr-10 w-[34%] text-right",
      )}
    >
      <DrawnArc mirrored={side === "left"} />

      {/*
        The organisation's own mission, set as a pull-quote. Serif and large
        rather than small print: this is the one place on the page where the
        NGO speaks in its own words, and setting it at caption size would bury
        that under the photography.
      */}
      <blockquote className="mt-6">
        <p className="font-display text-lg leading-[1.35] tracking-[-0.01em] text-[hsl(var(--paper)/0.82)]">
          &ldquo;{mission}&rdquo;
        </p>
        {place && (
          <footer className="mt-4 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--paper)/0.45)]">
            {side === "right" && (
              <span className="h-px w-8 shrink-0 bg-[hsl(var(--paper)/0.25)]" />
            )}
            <span className={cn(side === "left" && "ml-auto")}>{place}</span>
            {side === "left" && (
              <span className="h-px w-8 shrink-0 bg-[hsl(var(--paper)/0.25)]" />
            )}
          </footer>
        )}
      </blockquote>
    </div>
  );
}
