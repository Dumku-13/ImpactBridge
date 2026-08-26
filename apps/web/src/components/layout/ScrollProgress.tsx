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

    const update = () => {
      frame = 0;
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - window.innerHeight;
      // A page that doesn't scroll has no progress to report — leave the rail
      // empty rather than showing a full bar on a short page.
      const progress = scrollable > 0 ? window.scrollY / scrollable : 0;
      bar.style.transform = `scaleX(${Math.min(Math.max(progress, 0), 1)})`;
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
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5"
    >
      <div
        ref={barRef}
        className="h-full origin-left scale-x-0 bg-primary"
      />
    </div>
  );
}
