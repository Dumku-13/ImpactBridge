import { Loader2 } from "lucide-react";

/**
 * Shown while a lazily-loaded route chunk is in flight. Deliberately quiet —
 * on a warm cache these chunks arrive in a few milliseconds, and a heavy
 * skeleton that flashes for one frame reads as jank rather than progress.
 */
export function PageFallback() {
  return (
    <div className="flex items-center justify-center py-24" role="status">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
