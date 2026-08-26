import { cn } from "@/lib/utils";

export function ProgressBar({
  value,
  className,
  label,
}: {
  /** Percentage, 0–100. */
  value: number;
  className?: string;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div
      // Exposed as a real progressbar so screen readers announce the funding
      // percentage rather than seeing two meaningless divs.
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? "Funding progress"}
      className={cn(
        "h-1.5 w-full overflow-hidden rounded-full bg-secondary",
        className,
      )}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
