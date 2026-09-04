import { useEffect, useRef, useState } from "react";

/**
 * A short label that follows the pointer over major media.
 *
 * Opt in from anywhere by putting `data-cursor-label="View story"` on an
 * element; this component watches the document and needs no wiring per call
 * site. One listener for the whole page rather than a handler per card.
 *
 * ── Pointer only, and genuinely ────────────────────────────────────────────
 *
 * Gated on `(hover: hover) and (pointer: fine)` and never mounted otherwise. A
 * label chasing a finger is nonsense — there is no cursor to annotate — and on
 * a touch device the whole feature is dead weight, so it does not render at
 * all rather than rendering invisibly.
 *
 * The media query is watched rather than read once: a laptop with a
 * touchscreen, or a tablet that gains a trackpad, changes the answer mid
 * session.
 *
 * ── No trail, no spring ────────────────────────────────────────────────────
 *
 * The label is written straight to the element's transform on pointer move —
 * no easing, no lag, no particles. Anything that trails behind the cursor puts
 * a moving object between the reader and the photograph they are trying to
 * look at, which is the opposite of the point. The only motion is the label
 * appearing and disappearing.
 *
 * ── Why transform and not state ────────────────────────────────────────────
 *
 * Position is written directly to the node. Holding pointer coordinates in
 * React state would re-render this component on every mouse move across a
 * full-bleed photograph, which is a lot of renders to place one small label.
 * Only the TEXT lives in state, and that changes once per element entered.
 */
export function CursorLabel() {
  const [label, setLabel] = useState<string | null>(null);
  const [pointerFine, setPointerFine] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => setPointerFine(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!pointerFine) return;

    let frame = 0;
    let x = 0;
    let y = 0;

    const place = () => {
      frame = 0;
      const node = ref.current;
      if (!node) return;
      // `translate(-50%, -50%)` centres it, then it is nudged below-right so it
      // sits beside the cursor rather than underneath it.
      node.style.transform = `translate3d(${x + 18}px, ${y + 18}px, 0)`;
    };

    const onMove = (event: PointerEvent) => {
      x = event.clientX;
      y = event.clientY;

      const target = event.target as HTMLElement | null;
      const host = target?.closest<HTMLElement>("[data-cursor-label]");
      const next = host?.dataset.cursorLabel ?? null;
      setLabel((current) => (current === next ? current : next));

      if (!frame) frame = requestAnimationFrame(place);
    };

    // Leaving the window entirely must clear it, or the label is still sitting
    // there when the pointer comes back somewhere else.
    const onLeave = () => setLabel(null);

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [pointerFine]);

  if (!pointerFine) return null;

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 z-[60] will-change-transform"
    >
      <span
        className={`inline-flex items-center rounded-full bg-[hsl(var(--paper))] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--ink))] transition-opacity duration-150 ease-out-soft ${
          label ? "opacity-100" : "opacity-0"
        }`}
      >
        {label ?? ""}
      </span>
    </div>
  );
}
