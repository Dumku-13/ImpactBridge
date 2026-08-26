import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Ease-out cubic — fast start, gentle settle. Matches `ease-out-soft`. */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Animate a number up to its value the first time it is seen.
 *
 * Takes a pre-formatted string as `children` (e.g. "₹38,80,800") and a raw
 * `value` to count toward, rather than formatting internally — money formatting
 * here is lakh/crore-aware and already lives in `@impactbridge/shared`
 * (`formatMoney`, `formatMoneyCompact`). Duplicating it would let the two drift.
 *
 * While counting it renders `format(current)`; on completion it renders exactly
 * the `children` string, so the final frame is always the canonical formatting
 * even if `format` is an approximation.
 */
export function CountUp({
  value,
  children,
  format,
  duration = 1400,
  className,
}: {
  value: number;
  /** The final, correctly formatted string. */
  children: string;
  /** Formatter for intermediate frames. Defaults to a plain integer. */
  format?: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || started.current) return;
        started.current = true;
        observer.disconnect();

        const fmt = format ?? ((n: number) => String(Math.round(n)));
        let frame = 0;
        const start = performance.now();

        const tick = (now: number) => {
          const progress = Math.min((now - start) / duration, 1);
          setDisplay(fmt(value * easeOut(progress)));
          if (progress < 1) {
            frame = requestAnimationFrame(tick);
          } else {
            // Hand back to `children` so the resting value is the real one.
            setDisplay(null);
          }
        };

        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
      },
      { threshold: 0.4 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [value, format, duration]);

  return (
    // `tnum` stops the number jittering as digits change width mid-count.
    <span ref={ref} className={cn("tnum tabular-nums", className)}>
      {display ?? children}
    </span>
  );
}
