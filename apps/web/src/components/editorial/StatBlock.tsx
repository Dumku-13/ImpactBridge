import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Small-caps label over an enormous numeral.
 *
 * The editorial move is the size ratio, not decoration: a label at 11px against
 * a figure at 60px+ makes the number the thing you read from across the room,
 * and the label only when you've decided you care. Cards and borders would
 * dilute that — this deliberately has neither.
 */
export function StatBlock({
  label,
  children,
  footnote,
  size = "md",
  className,
}: {
  label: string;
  /** The figure. Pre-formatted by the caller (see `formatMoney`). */
  children: ReactNode;
  footnote?: ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const scale = {
    sm: "text-2xl sm:text-3xl",
    md: "text-4xl sm:text-5xl",
    lg: "text-5xl sm:text-7xl",
  }[size];

  return (
    <div className={className}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "tnum mt-2 font-grotesk font-extrabold leading-none tracking-[-0.02em] text-foreground",
          scale,
        )}
        style={{ fontStretch: "88%" }}
      >
        {children}
      </p>
      {footnote && (
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {footnote}
        </p>
      )}
    </div>
  );
}
