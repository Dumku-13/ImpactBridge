import { useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { formatMoney, type GrantCard as GrantCardType } from "@impactbridge/shared";
import { causes, type MediaAsset } from "@/content/media";
import { cn } from "@/lib/utils";

/** "in 12 days", "closes today", "closed". */
export function deadlineLabel(iso: string): {
  text: string;
  urgent: boolean;
  closed: boolean;
} {
  const days = Math.ceil(
    (new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000),
  );

  if (days < 0) return { text: "Closed", urgent: false, closed: true };
  if (days === 0) return { text: "Closes today", urgent: true, closed: false };
  if (days === 1) return { text: "1 day left", urgent: true, closed: false };
  if (days <= 7) return { text: `${days} days left`, urgent: true, closed: false };

  return { text: `${days} days left`, urgent: false, closed: false };
}

/**
 * Grants carry no photography of their own — they are money, a deadline and a
 * set of rules. But they DO carry causes, and the cause library has a picture
 * for each. Mapping the grant's first cause to that image gives every row a
 * world to reveal on hover, sourced from real data rather than decoration.
 */
const CAUSE_IMAGE: Record<string, MediaAsset> = {
  education: causes.education,
  healthcare: causes.healthcare,
  "women-empowerment": causes.womenEmpowerment,
  environment: causes.environment,
  animals: causes.animals,
  "disaster-relief": causes.disasterRelief,
};

export function GrantCard({ grant }: { grant: GrantCardType }) {
  const rowRef = useRef<HTMLAnchorElement>(null);
  const deadline = deadlineLabel(grant.deadline);
  const image = grant.categories
    .map((c) => CAUSE_IMAGE[c.slug])
    .find(Boolean);

  /*
   * The photograph drifts with the pointer as it crosses the row — a small
   * parallax that makes the surface feel physical rather than a static fade.
   *
   * Written straight to a CSS custom property instead of React state: this
   * fires on every mousemove, and re-rendering the row at that rate would be
   * wasteful and janky. The browser composites the transform; React never
   * hears about it.
   */
  function trackPointer(event: React.MouseEvent<HTMLAnchorElement>) {
    const row = rowRef.current;
    if (!row) return;
    const box = row.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;
    row.style.setProperty("--px", `${(x * -22).toFixed(1)}px`);
    row.style.setProperty("--py", `${(y * -14).toFixed(1)}px`);
  }

  return (
    <Link
      ref={rowRef}
      to={`/grants/${grant.slug}`}
      onMouseMove={trackPointer}
      className="group relative block overflow-hidden border-t border-border transition-colors duration-300"
    >
      {/*
        The cause photograph, revealed on hover behind the row. It sits at zero
        opacity until then, so the resting page stays a quiet typographic list
        and the image is a reward for exploring rather than constant noise.
      */}
      {image && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 ease-out-soft group-hover:opacity-100"
        >
          <img
            src={image.src}
            alt=""
            loading="lazy"
            style={{ transform: "translate3d(var(--px, 0), var(--py, 0), 0) scale(1.1)" }}
            className="h-full w-full object-cover transition-transform duration-300 ease-out"
          />
          {/* Keeps the type legible over whatever the photograph happens to be. */}
          <div className="absolute inset-0 bg-[hsl(var(--foreground)/0.82)]" />
        </div>
      )}

      <div className="relative flex flex-col gap-5 px-1 py-8 transition-colors duration-300 group-hover:text-[hsl(var(--background))] sm:px-2 lg:flex-row lg:items-baseline lg:gap-10">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-colors duration-300 group-hover:text-[hsl(var(--background)/0.7)]">
            {grant.categories.slice(0, 2).map((category) => (
              <span key={category.id}>{category.name}</span>
            ))}
            {grant.status === "DRAFT" && <span>Draft</span>}
            {grant.status === "CLOSED" && <span>Closed</span>}
          </div>

          {/*
            Oversized and set in the grotesque — at this scale the title is the
            row, and the metadata arranges itself around it.
          */}
          <h3
            className="mt-3 font-grotesk text-3xl font-extrabold uppercase leading-[0.92] tracking-[-0.03em] text-foreground transition-colors duration-300 group-hover:text-[hsl(var(--background))] sm:text-5xl"
            style={{ fontStretch: "84%" }}
          >
            {grant.title}
          </h3>

          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground transition-colors duration-300 group-hover:text-[hsl(var(--background)/0.75)]">
            {grant.summary}
          </p>

          <p className="mt-3 text-xs text-muted-foreground transition-colors duration-300 group-hover:text-[hsl(var(--background)/0.65)]">
            {grant.funder.name}
            <span className="mx-2 opacity-40">/</span>
            {grant.applicationCount}{" "}
            {grant.applicationCount === 1 ? "applicant" : "applicants"}
          </p>
        </div>

        {/* The figures, right-aligned from lg so the column scans on its own. */}
        <div className="flex items-baseline gap-6 lg:shrink-0 lg:flex-col lg:items-end lg:gap-2 lg:text-right">
          <p
            className="tnum font-grotesk text-3xl font-extrabold leading-none tracking-[-0.02em] text-accent sm:text-4xl"
            style={{ fontStretch: "88%" }}
          >
            {formatMoney(grant.amountMinor, grant.currency)}
          </p>
          <p
            className={cn(
              "tnum text-xs font-semibold uppercase tracking-[0.12em] transition-colors duration-300",
              deadline.closed
                ? "text-muted-foreground/60"
                : deadline.urgent
                  ? "text-primary"
                  : "text-muted-foreground group-hover:text-[hsl(var(--background)/0.7)]",
            )}
          >
            {deadline.text}
          </p>
        </div>

        <ArrowUpRight className="hidden h-6 w-6 shrink-0 text-muted-foreground transition-[transform,color] duration-300 ease-out-soft group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-primary lg:block" />
      </div>
    </Link>
  );
}
