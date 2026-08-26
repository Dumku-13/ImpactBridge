import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/**
 * Reveal a block when it scrolls into view.
 *
 * Uses `IntersectionObserver`, never a scroll listener: the observer fires off
 * the main thread's critical path and costs nothing while the element is out of
 * view, whereas a scroll handler runs on every frame of every scroll for the
 * life of the page. On a long editorial page with many of these, that
 * difference is the whole performance budget.
 *
 * The `.stagger` CSS utility only reaches eight children and fires on mount
 * regardless of visibility, so it can't serve content below the fold — this
 * replaces it there.
 */
export function Reveal({
  children,
  as: Tag = "div",
  delay = 0,
  className,
  style,
  once = true,
}: {
  children: ReactNode;
  as?: ElementType;
  /** Milliseconds. Stagger siblings by passing increasing values. */
  delay?: number;
  className?: string;
  /**
   * Forwarded to the wrapper. Needed because this element is a real box in the
   * layout — callers legitimately need to constrain it (e.g. `maxWidth` to keep
   * a small image at its native size), and without this they'd have to add a
   * second wrapper purely to work around the omission.
   */
  style?: CSSProperties;
  once?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Respect the OS setting before doing any work: show the final state and
    // never observe at all.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setVisible(false);
        }
      },
      {
        // Trigger slightly before the element reaches the viewport edge, so the
        // animation is already underway by the time it is properly in frame.
        rootMargin: "0px 0px -12% 0px",
        threshold: 0.1,
      },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [once]);

  return (
    <Tag
      ref={ref}
      style={{ ...style, ...(visible && delay ? { animationDelay: `${delay}ms` } : null) }}
      className={cn(
        /*
         * Held DIM until seen, never invisible. `opacity-30` rather than
         * `opacity-0` because this state depends entirely on
         * IntersectionObserver firing: anywhere it doesn't deliver — a
         * renderer that never composites, a tab throttled while loading — an
         * `opacity-0` hold is permanent and the section is a blank band. The
         * automated preview browser is exactly such an environment, which is
         * how this was found. Same rule as `.row-enter` and `fade-up`.
         *
         * `animate-fade-up` uses fill mode `both`, so once it runs the final
         * state persists.
         */
        visible ? "animate-fade-up" : "opacity-30",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
