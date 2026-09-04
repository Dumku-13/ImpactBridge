import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import type { OrganizationCard as OrganizationCardType } from "@impactbridge/shared";
import { OrganizationCard } from "@/components/organizations/OrganizationCard";

/**
 * The shortlist.
 *
 * ── Why zero is not a number here ──────────────────────────────────────────
 *
 * The previous dashboard printed "Saved 0" in a cell the same size and weight
 * as the lifetime total. A zero rendered at that scale states a fact nobody
 * asked for and offers nothing to do about it — and it is the one state where
 * the feature has to explain itself, because a donor with no shortlist has by
 * definition never seen what a shortlist is for.
 *
 * So the empty state is the copy, and the count is dropped entirely: when there
 * is nothing saved, "0" is not the information, the invitation is.
 */
export function SavedOrganisations({
  bookmarks,
}: {
  bookmarks: OrganizationCardType[] | undefined;
}) {
  // Still loading. Silent rather than flashing an empty state that is about to
  // be contradicted — a shortlist that says "you have none" and then fills in
  // reads as a bug.
  if (!bookmarks) return null;

  if (bookmarks.length === 0) {
    return (
      <section className="py-14">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Saved
        </p>

        <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2
              className="font-display text-2xl font-semibold tracking-[-0.01em] text-foreground sm:text-3xl"
              style={{ fontVariationSettings: '"SOFT" 12' }}
            >
              Build your shortlist
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              Save organisations you would like to support later, and they will
              wait for you here.
            </p>
          </div>

          <Link
            to="/browse"
            className="group inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-foreground transition-colors hover:text-primary"
          >
            Explore nonprofits
            <ArrowRight className="h-4 w-4 transition-transform duration-200 ease-out-soft group-hover:translate-x-0.5" />
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="py-14">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Saved
        </p>
        <p className="tnum text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {bookmarks.length}
        </p>
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {bookmarks.map((org) => (
          <OrganizationCard key={org.id} org={org} />
        ))}
      </div>
    </section>
  );
}
