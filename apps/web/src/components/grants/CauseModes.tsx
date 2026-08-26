import { useState } from "react";
import { causes, type MediaAsset } from "@/content/media";
import { cn } from "@/lib/utils";

/** Cause slug → its photograph. Same map the grant rows use. */
const CAUSE_IMAGE: Record<string, MediaAsset> = {
  education: causes.education,
  healthcare: causes.healthcare,
  "women-empowerment": causes.womenEmpowerment,
  environment: causes.environment,
  animals: causes.animals,
  "disaster-relief": causes.disasterRelief,
};

/**
 * Causes as visual modes, not filter pills.
 *
 * Touching a cause changes the environment: its photograph floods the backdrop
 * and the word lights up. That is the interaction the brief asked for — the
 * page reacting to exploration rather than waiting for a click — and it costs
 * nothing extra, because the imagery already exists for the grant rows.
 *
 * The filtering behaviour underneath is byte-for-byte the old chips: same
 * `onSelect(slug)` toggle, same "All causes" reset. Only the surface changed.
 *
 * Hover drives the preview but SELECTION is what persists, so a mouse leaving
 * the block returns you to the selected cause rather than to nothing.
 */
export function CauseModes({
  categories,
  selected,
  onSelect,
}: {
  categories: Array<{ id: string; slug: string; name: string }>;
  selected: string | undefined;
  onSelect: (slug: string | undefined) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);

  const active = preview ?? selected ?? null;
  const backdrop = active ? CAUSE_IMAGE[active] : undefined;

  return (
    <div
      className="relative isolate overflow-hidden border-y border-border"
      onMouseLeave={() => setPreview(null)}
    >
      {/*
        Backdrop. Keyed on the active cause so React swaps the element and the
        fade re-runs — crossfading a single <img> by changing src would show the
        old photograph until the new one decoded.
      */}
      {backdrop && (
        <div key={active} aria-hidden="true" className="absolute inset-0 -z-10">
          {/*
            The one place this project deliberately renders a photograph above
            its native width. It is a full-bleed backdrop sitting under a 0.9
            scrim — roughly a tenth of it survives — so it reads as tone, not as
            an image, and softening is not perceptible at any window size. Every
            other surface caps to the asset's real width (see `maxWidth` in
            content/media.ts); don't "fix" this one by shrinking it, that just
            breaks the bleed.
          */}
          <img
            src={backdrop.src}
            alt=""
            className="h-full w-full animate-fade-in object-cover"
          />
          <div className="absolute inset-0 bg-[hsl(var(--background)/0.9)]" />
        </div>
      )}

      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 px-1 py-6 sm:gap-x-10">
        <button
          type="button"
          onMouseEnter={() => setPreview(null)}
          onFocus={() => setPreview(null)}
          onClick={() => onSelect(undefined)}
          aria-pressed={!selected}
          className={cn(
            "font-grotesk text-2xl font-extrabold uppercase tracking-[-0.02em] transition-colors duration-300 sm:text-4xl",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            !selected
              ? "text-foreground"
              : "text-muted-foreground/45 hover:text-foreground",
          )}
          style={{ fontStretch: "84%" }}
        >
          All
        </button>

        {categories.map((c) => {
          const isSelected = selected === c.slug;
          const isPreviewing = preview === c.slug;
          return (
            <button
              key={c.id}
              type="button"
              onMouseEnter={() => setPreview(c.slug)}
              onFocus={() => setPreview(c.slug)}
              onClick={() => onSelect(isSelected ? undefined : c.slug)}
              aria-pressed={isSelected}
              className={cn(
                "font-grotesk text-2xl font-extrabold uppercase tracking-[-0.02em] transition-colors duration-300 sm:text-4xl",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isSelected
                  ? "text-primary"
                  : isPreviewing
                    ? "text-foreground"
                    : "text-muted-foreground/45 hover:text-foreground",
              )}
              style={{ fontStretch: "84%" }}
            >
              {c.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
