import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

/**
 * "Back to top", appearing once there is enough page behind you to want it.
 *
 * ── Why the listener is written this carefully ─────────────────────────────
 *
 * This is mounted globally, which means it is also mounted on the landing page,
 * which runs GSAP ScrollTrigger plus three hand-rolled scroll handlers of its
 * own (the opening's `--op-p`, the spine, the thread). A fourth listener that
 * is non-passive or unthrottled shows up immediately as dropped frames on the
 * one page whose entire argument is that it moves well.
 *
 * So: `{ passive: true }`, so the browser never has to wait to find out whether
 * we will call `preventDefault` before it scrolls; rAF-throttled, so we read
 * layout at most once a frame; and `setState` only on the boolean FLIP, not on
 * every frame — re-rendering React 60 times a second to set the same `true` is
 * the expensive mistake this shape exists to avoid.
 */

/**
 * Roughly a screen and a half on a laptop. Below this, "back to top" is a
 * button offering to undo a flick of the wheel — it should not be there at all.
 */
const SHOW_AFTER_PX = 600;

export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let frame = 0;

    const update = () => {
      frame = 0;
      const next = window.scrollY > SHOW_AFTER_PX;
      // React bails out of a re-render when the state is unchanged, but the
      // comparison is still cheaper here than a dispatch per frame.
      setVisible((current) => (current === next ? current : next));
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };

    // Deep-linking or a restored scroll position means the page can start well
    // past the threshold; without this first call the button is missing until
    // the visitor happens to scroll.
    update();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  function scrollToTop() {
    /*
     * The reduced-motion check has to happen HERE, in JS.
     *
     * index.css already forces `scroll-behavior: auto` under
     * `prefers-reduced-motion`, and that does nothing to this call: per spec an
     * explicit `behavior: "smooth"` in the options object overrides the
     * element's `scroll-behavior`, it does not inherit from it. So the CSS rule
     * that makes every anchor jump instantly would have left this one button
     * still sailing 8,000px past a user who asked for none of it.
     */
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });

    /*
     * Send focus back to the top of the document as well as the viewport.
     * Scrolling alone moves the eye and leaves the keyboard where it was, so
     * the next Tab drops the user right back down the page they just left.
     * `#main` carries `tabIndex={-1}` in both shells for exactly this.
     */
    document.getElementById("main")?.focus({ preventScroll: true });
  }

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Back to top"
      title="Back to top"
      /*
       * The upper slot of the floating stack: one `--float-slot` above
       * FloatingContact, which owns the anchor position because it is always
       * there. Sizes and offsets are tokens in index.css — do not hard-code a
       * number here, or the two buttons drift apart the first time one of them
       * changes size. Full stacking contract is in that same block.
       */
      className="no-print fixed right-[var(--float-gap)] bottom-[calc(var(--float-bottom)+var(--float-slot))] z-40 inline-flex h-11 w-11 animate-scale-in items-center justify-center rounded-full border border-border bg-card text-foreground shadow-float transition-all duration-200 ease-out-soft hover:border-primary/30 hover:text-primary active:scale-90"
    >
      <ArrowUp className="h-4 w-4" />
    </button>
  );
}
