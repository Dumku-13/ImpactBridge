import { useEffect, useRef } from "react";

/**
 * A line down the side of the page that fills as you scroll and marks what you
 * are passing.
 *
 * It answers two questions a long editorial page otherwise leaves open — how
 * much of this is there, and what am I looking at — without a navigation bar
 * sitting on top of the composition.
 *
 * ── Three implementation notes, each of them load-bearing ──────────────────
 *
 * 1. `mix-blend-difference`. This page runs ink → paper → ink as you scroll,
 *    and a rail with a fixed colour would vanish against one of them. Blending
 *    on difference makes it invert against whatever is behind it, so a single
 *    element stays legible over every section and in both themes. It is the
 *    same trick the Browse plate numerals use.
 *
 * 2. No React state per frame. This updates on every scroll event; re-rendering
 *    the tree at that rate is exactly how a page starts dropping frames. The
 *    fill is a transform written straight to the node, and the active label is
 *    a class toggle — both inside one rAF-throttled handler.
 *
 * 3. Decorative, so `aria-hidden`. Every section it lists has a real heading in
 *    the document already; a screen reader gets the outline from those, and a
 *    duplicate set of labels here would just be noise. It is also
 *    `pointer-events-none` — a progress indicator that eats clicks along the
 *    edge of the viewport is a trap.
 */
export function ScrollSpine({
  sections,
}: {
  /** `id` must match an element on the page; `label` is what the rail shows. */
  sections: Array<{ id: string; label: string }>;
}) {
  const fillRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fill = fillRef.current;
    const root = rootRef.current;
    if (!fill || !root) return;

    const marks = sections.map((section) => ({
      ...section,
      node: root.querySelector<HTMLElement>(`[data-spine-mark="${section.id}"]`),
      target: document.getElementById(section.id),
    }));

    let frame = 0;

    const update = () => {
      frame = 0;

      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - window.innerHeight;
      const progress = scrollable > 0 ? window.scrollY / scrollable : 0;
      fill.style.transform = `scaleY(${Math.min(Math.max(progress, 0), 1)})`;

      /*
       * The active section is the one CROSSING the reading line — 45% down the
       * viewport, because what you are reading is near the middle of the screen
       * rather than jammed against its top edge.
       *
       * "Crossing" rather than "the last one that has passed": with the simpler
       * rule a short section can never be active at all, because the next
       * section's top clears the line before the short one's does. The stat
       * band is exactly that — a thin rule of figures between two tall
       * chapters — and it never once lit up until this was fixed.
       */
      const readingLine = window.innerHeight * 0.45;
      let active = marks[0];
      let crossing: (typeof marks)[number] | undefined;

      for (const mark of marks) {
        if (!mark.target) continue;
        const rect = mark.target.getBoundingClientRect();
        if (rect.top <= readingLine) active = mark;
        if (rect.top <= readingLine && rect.bottom > readingLine) crossing = mark;
      }

      if (crossing) active = crossing;

      for (const mark of marks) {
        if (!mark.node) continue;
        mark.node.dataset.active = String(mark === active);
      }
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [sections]);

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      /* Hidden below `lg`: on a phone this would sit on top of the content it
         is describing. Blend mode is applied here so the track, the fill and
         the labels all invert together. */
      className="pointer-events-none fixed left-5 top-1/2 z-40 hidden -translate-y-1/2 mix-blend-difference lg:block"
    >
      <div className="relative flex h-[46svh] items-stretch gap-3">
        {/* Track, then the fill scaling from the top. */}
        <div className="relative w-px bg-[hsl(40_24%_96%/0.28)]">
          <div
            ref={fillRef}
            className="absolute inset-x-0 top-0 h-full origin-top scale-y-0 bg-[hsl(40_24%_96%)]"
          />
        </div>

        <ol className="flex flex-col justify-between py-1">
          {sections.map((section) => (
            <li
              key={section.id}
              data-spine-mark={section.id}
              data-active="false"
              className="group flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-[hsl(40_24%_96%/0.4)] transition-colors duration-300 data-[active=true]:text-[hsl(40_24%_96%)]"
            >
              <span className="h-px w-2 bg-current transition-all duration-300 group-data-[active=true]:w-4" />
              {section.label}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
