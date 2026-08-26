import { Link } from "react-router-dom";
import { BadgeCheck, Bookmark, MapPin, Users } from "lucide-react";
import {
  formatMoneyCompact,
  fundingProgress,
  type OrganizationCard as OrganizationCardType,
} from "@impactbridge/shared";
import { useAuth } from "@/auth/AuthContext";
import { useToggleBookmark } from "@/api/organizations";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

/**
 * An organisation, set as an editorial plate rather than a bordered card.
 *
 * The card chrome is gone — no surrounding box, no drop shadow. The photograph
 * is the object, and the type hangs beneath it like a caption. On a page of
 * eight of these, borders were doing nothing but drawing eight rectangles;
 * removing them lets the photography carry the grid, which is the whole point
 * of having commissioned it.
 */
export function OrganizationCard({ org }: { org: OrganizationCardType }) {
  const { user } = useAuth();
  const toggleBookmark = useToggleBookmark();

  const progress = fundingProgress(org.totalRaisedMinor, org.fundingGoalMinor);
  const canBookmark = user?.role === "DONOR";

  return (
    <article className="group relative flex flex-col">
      <div className="relative aspect-[4/3] overflow-hidden rounded-sm bg-secondary">
        {org.coverUrl ? (
          <img
            src={org.coverUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 ease-out-soft group-hover:scale-[1.04]"
          />
        ) : (
          // No cover: a tinted field with the initial, so a grid of
          // organisations without photography still reads as varied.
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/15 via-secondary to-accent/10">
            <span
              aria-hidden="true"
              className="font-display text-6xl font-semibold text-primary/25 transition-transform duration-500 ease-out-soft group-hover:scale-110"
            >
              {org.name.charAt(0)}
            </span>
          </div>
        )}

        {canBookmark && (
          <button
            type="button"
            onClick={(e) => {
              // The whole plate is clickable via the title link's ::after; this
              // stops the tap navigating instead of saving.
              e.preventDefault();
              e.stopPropagation();
              toggleBookmark.mutate(org.id);
            }}
            aria-label={
              org.isBookmarked
                ? `Remove ${org.name} from saved`
                : `Save ${org.name}`
            }
            aria-pressed={org.isBookmarked}
            className="absolute right-2.5 top-2.5 z-10 rounded-full bg-background/85 p-2 shadow-raised transition-all duration-200 ease-out-soft hover:scale-110 hover:bg-background active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Bookmark
              className={cn(
                "h-4 w-4 transition-all duration-200 ease-spring",
                org.isBookmarked
                  ? "scale-110 fill-primary text-primary"
                  : "text-muted-foreground",
              )}
            />
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col pt-4">
        {/* Causes as a small-caps eyebrow — the same device the grant rows use,
            so the two discovery surfaces read as one system. */}
        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {org.categories.slice(0, 2).map((category) => (
            <span key={category.id}>{category.name}</span>
          ))}
          {org.categories.length > 2 && (
            <span className="text-muted-foreground/60">
              +{org.categories.length - 2}
            </span>
          )}
        </p>

        <h3 className="mt-2 flex items-start gap-1.5">
          {/*
            `after:absolute after:inset-0` makes the whole plate clickable from
            this one link — a single focusable element for keyboard users,
            rather than wrapping everything in an <a> that swallows the buttons.
          */}
          <Link
            to={`/ngo/${org.slug}`}
            className="rounded font-display text-xl font-semibold leading-snug tracking-[-0.01em] text-foreground transition-colors duration-200 after:absolute after:inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 group-hover:text-primary"
            style={{ fontVariationSettings: '"SOFT" 12' }}
          >
            {org.name}
          </Link>
          {org.verified && (
            <BadgeCheck
              className="mt-1 h-4 w-4 shrink-0 text-primary"
              aria-label="Verified organisation"
            />
          )}
        </h3>

        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
          {org.mission}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {org.city && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3 w-3" />
              {org.city}
            </span>
          )}
          <span className="tnum inline-flex items-center gap-1.5">
            <Users className="h-3 w-3" />
            {org.donorCount.toLocaleString("en-IN")} donors
          </span>
        </div>

        {/* Funding pinned to the bottom so the row of plates aligns. */}
        <div className="mt-auto pt-5">
          <ProgressBar value={progress} label={`${org.name} funding progress`} />
          <div className="tnum mt-2.5 flex items-baseline justify-between">
            <span
              className="font-grotesk text-base font-extrabold text-foreground"
              style={{ fontStretch: "88%" }}
            >
              {formatMoneyCompact(org.totalRaisedMinor, org.currency)}
              <span className="ml-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                raised
              </span>
            </span>
            <span className="text-xs text-muted-foreground">
              {progress}% of{" "}
              {formatMoneyCompact(org.fundingGoalMinor, org.currency)}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

/** Matches the real plate's layout so the grid doesn't shift when data lands. */
export function OrganizationCardSkeleton() {
  return (
    <div>
      <Skeleton className="aspect-[4/3] rounded-sm" />
      <div className="space-y-3 pt-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-1.5 w-full" />
      </div>
    </div>
  );
}
