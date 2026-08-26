import { cn } from "@/lib/utils";

/**
 * Loading placeholder.
 *
 * Skeletons that match the real content's shape prevent layout shift when data
 * arrives — the page doesn't jump, which reads as noticeably more polished than
 * a centred spinner.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative overflow-hidden rounded-md bg-secondary",
        // A highlight sweeping left-to-right, rather than the whole block
        // pulsing. A pulse reads as "something is wrong"; a sweep reads as
        // "this is on its way" — and it points in the direction of reading.
        "after:absolute after:inset-0 after:-translate-x-full after:animate-shimmer",
        "after:bg-gradient-to-r after:from-transparent after:via-background/70 after:to-transparent",
        className,
      )}
    />
  );
}
