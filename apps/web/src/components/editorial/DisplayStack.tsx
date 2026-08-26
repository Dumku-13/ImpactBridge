import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The headline device: a heavy grotesque line with a serif line set beneath it.
 *
 * Two voices in one headline is what stops oversized type reading as merely
 * "big". The grotesque line carries the statement; the Fraunces line carries
 * the meaning, and the contrast between them does the work that a decorative
 * treatment would otherwise have to fake.
 *
 * `font-stretch` is pushed narrow on the grotesque line because a semi-condensed
 * cut holds a long phrase on one line at display scale — the moment a headline
 * wraps unintentionally, the composition collapses.
 */
export function DisplayStack({
  lead,
  trail,
  as: Tag = "div",
  size = "xl",
  align = "left",
  className,
  leadClassName,
  trailClassName,
}: {
  /** The grotesque line. Usually set in caps by the caller's copy. */
  lead: ReactNode;
  /** The serif line beneath. */
  trail?: ReactNode;
  /**
   * The element to render. Defaults to `div`, but a section headline should
   * pass `"h2"` — otherwise the section is invisible to the document outline
   * and screen-reader users get no landmark for it, which is exactly what
   * happened on the impact-stories section.
   */
  as?: ElementType;
  size?: "md" | "lg" | "xl" | "hero";
  align?: "left" | "center";
  className?: string;
  leadClassName?: string;
  trailClassName?: string;
}) {
  const scale = {
    md: { lead: "text-3xl sm:text-4xl", trail: "text-3xl sm:text-4xl" },
    lg: { lead: "text-4xl sm:text-6xl", trail: "text-4xl sm:text-6xl" },
    xl: { lead: "text-5xl sm:text-7xl", trail: "text-5xl sm:text-7xl" },
    hero: {
      lead: "text-[13vw] leading-[0.86] sm:text-[9vw]",
      trail: "text-[13vw] leading-[0.9] sm:text-[9vw]",
    },
  }[size];

  return (
    <Tag className={cn(align === "center" && "text-center", className)}>
      <span
        className={cn(
          "block font-grotesk font-extrabold uppercase tracking-[-0.02em] text-foreground",
          scale.lead,
          size !== "hero" && "leading-[0.95]",
          leadClassName,
        )}
        // Semi-condensed: narrow enough to hold a line, wide enough to stay
        // authoritative rather than looking squeezed.
        style={{ fontStretch: "86%" }}
      >
        {lead}
      </span>

      {trail && (
        <span
          className={cn(
            "mt-1 block font-display font-semibold tracking-[-0.03em] text-foreground",
            scale.trail,
            size !== "hero" && "leading-[1]",
            trailClassName,
          )}
          // SOFT eased back at display size — Fraunces' warmth reads as mushy
          // once the terminals get this large.
          style={{ fontVariationSettings: '"SOFT" 12' }}
        >
          {trail}
        </span>
      )}
    </Tag>
  );
}
