import { useEffect, useRef } from "react";

/**
 * A line down the side of the page that fills as you scroll and marks what you
 * are passing.
 *
 * It answers two questions a long editorial page otherwise leaves open — how
 * much of this is there, and what am I looking at — without a navigation bar
 * sitting on top of the composition.
 *
 * ── Why the labels are set vertically ──────────────────────────────────────
 *
 * The first version listed every section horizontally beside the rail. There is
 * no room for that: the page's content column is centred with roughly 70px of
 * gutter at a laptop width, and "HOW A RUPEE TRAVELS" is far wider than 70px —
 * so the rail printed itself straight across the Premise headline. Two changes
 * fix it for good:
 *
 *   - only the ACTIVE section is named, never all six at once
 *   - that name is set vertically along the rail, so the whole component is
 *     about 20px wide no matter how long the section is called
 *
 * ── Three implementation notes, each load-bearing ──────────────────────────
 *
 * 1. `mix-blend-difference`. This page runs ink → paper → ink as you scroll,
 *    and a rail with a fixed colour would vanish against one of them. Blending
 *    on difference inverts it against whatever is behind, so one element stays
 *    legible over every section and in both themes. Same trick as the Browse
 *    plate numerals.
 *
 * 2. No React state per frame. This updates on every scroll event; re-rendering
 *    the tree at that rate is how a page starts dropping frames. The fill is a
 *    transform written straight to the node and the label is a `textContent`
 *    assignment, both inside one rAF-throttled handler.
 *
 * 3. Decorative, so `aria-hidden`: every section it names has a real heading in
 *    the document already. Also `pointer-events-none` — a progress indicator
 *    that eats clicks along the edge of the viewport is a trap.
 */
export function ScrollSpine({
  sections,
}: {
  /** `id` must match an element on the page; `label` is what the rail shows. */
  sections: Array<{ id: string; label: string }>;
}) {
  const fillRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fill = fillRef.current;
    const label = labelRef.current;
    const root = rootRef.current;
    if (!fill || !label || !root) return;

    const marks = sections.map((section) => ({
      ...section,
      node: root.querySelector<HTMLElement>(`[data-spine-mark="${section.id}"]`),
      target: document.getElementById(section.id),
    }));

    let frame = 0;
    let shown = "";

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
       * rule a SHORT section can never be active at all, because the next
       * section's top clears the line before its own does. The stat band is
       * exactly that — a thin rule of figures between two tall chapters — and
       * it never once lit up until this was fixed.
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

      // Only write when it changes: assigning textContent every frame would
      // restart the CSS transition on the label continuously.
      if (active && active.label !== shown) {
        shown = active.label;
        label.textContent = active.label;
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
      /*
       * Shown only from 1440px up, and the number is arithmetic rather than
       * taste: the page's content column is `max-w-7xl`, i.e. 1280px. Below
       * 1440 the gutter either side is under 80px and this rail is ~43px wide
       * plus breathing room — at exactly 1280 there is no gutter at all and the
       * rail prints straight over the text. A progress indicator that sits on
       * the content it is indexing is worse than no indicator.
       *
       * Blend mode is applied here so the track, the fill, the ticks and the
       * label all invert together against ink, paper and ink again.
       */
      className="pointer-events-none fixed left-5 top-1/2 z-40 hidden -translate-y-1/2 mix-blend-difference min-[1440px]:block"
    >
      <div className="relative flex h-[46svh] items-stretch gap-2.5">
        {/* Track, then the fill scaling from the top. */}
        <div className="relative w-px bg-[hsl(40_24%_96%/0.28)]">
          <div
            ref={fillRef}
            className="absolute inset-x-0 top-0 h-full origin-top scale-y-0 bg-[hsl(40_24%_96%)]"
          />
        </div>

        {/* One tick per section — the whole outline, at a glance, in 8px. */}
        <ol className="flex flex-col justify-between py-1">
          {sections.map((section) => (
            <li
              key={section.id}
              data-spine-mark={section.id}
              data-active="false"
              className="group flex h-2 items-center"
            >
              {/* `group-data-` reads the state off the <li>, which is where the
                  handler writes it — a `data-[active]` variant here would look
                  at the span's own attribute and never match. */}
              <span className="h-px w-2 bg-[hsl(40_24%_96%/0.35)] transition-all duration-300 group-data-[active=true]:w-4 group-data-[active=true]:bg-[hsl(40_24%_96%)]" />
            </li>
          ))}
        </ol>

        {/*
          The name of the section you are in, set vertically so the component
          stays ~20px wide however long that name is. Written by the handler
          above rather than rendered from state.
        */}
        <span
          ref={labelRef}
          className="self-center text-[9px] font-semibold uppercase tracking-[0.22em] text-[hsl(40_24%_96%/0.85)] transition-opacity duration-300"
          style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
        />
      </div>
    </div>
  );
}
