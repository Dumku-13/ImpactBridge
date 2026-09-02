import { useEffect, useRef } from "react";

/**
 * A hairline at the top of the viewport showing how far through the page you
 * are. Small, constant feedback that scrolling is doing something.
 *
 * Written directly to the element's transform on a rAF-throttled scroll
 * listener rather than through React state: this fires continuously while
 * scrolling, and re-rendering the tree at that rate is exactly how a page
 * starts dropping frames. Scale on the compositor, no layout, no React.
 */
export function ScrollProgress() {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;

    /*
     * The scrollable distance is CACHED rather than read per frame.
     *
     * `scrollHeight` is a layout property: reading it forces the browser to
     * flush any pending style and layout work before it can answer. Doing that
     * inside the scroll loop means a forced synchronous layout on every frame,
     * on a page where several other scroll listeners are also reading and
     * writing — the classic layout-thrashing pattern.
     *
     * It only actually changes when the document resizes, so it is measured on
     * resize and by a ResizeObserver (images landing, fonts swapping, a panel
     * of fetched records arriving) and simply read from a variable in between.
     */
    let scrollable = 0;

    const measure = () => {
      scrollable = document.documentElement.scrollHeight - window.innerHeight;
    };

    const update = () => {
      frame = 0;
      // A page that doesn't scroll has no progress to report — leave the rail
      // empty rather than showing a full bar on a short page.
      const progress = scrollable > 0 ? window.scrollY / scrollable : 0;
      bar.style.transform = `scaleX(${Math.min(Math.max(progress, 0), 1)})`;
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };

    const onResize = () => {
      measure();
      onScroll();
    };

    measure();
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });

    // Catches height changes that no resize event reports.
    const observer = new ResizeObserver(onResize);
    observer.observe(document.documentElement);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5"
    >
      {/* `will-change: transform` keeps the bar on its own compositor layer,
          so the per-frame scaleX never triggers a repaint of the rail. */}
      <div
        ref={barRef}
        className="h-full origin-left scale-x-0 bg-primary will-change-transform"
      />
    </div>
  );
}
