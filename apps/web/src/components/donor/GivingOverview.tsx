import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { formatMoney, formatMoneyCompact } from "@impactbridge/shared";
import type { DonorStats } from "@impactbridge/shared";
import { CountUp } from "@/components/ui/CountUp";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * The first thing a donor sees: what they have given, at the scale it deserves.
 *
 * ── Why one figure and not four cards ──────────────────────────────────────
 *
 * The previous version set total contributed, donations made, organisations
 * supported and saved in four identical bordered cells. Four equal frames say
 * the four numbers matter equally, which is false: one of them is the reason
 * the page exists and the other three are context for it. Giving the total the
 * display face at 5rem and demoting the rest to a single metadata line is the
 * whole change — the hierarchy does the work that a grid of equals cannot.
 *
 * ── What is deliberately NOT here ──────────────────────────────────────────
 *
 * No "causes supported" and no "states reached", both of which a giving summary
 * obviously wants. Neither is derivable. `schemas/stats.ts` sets out why for
 * the platform figures and the same applies per donor: a donation carries no
 * category, and an organisation may hold up to six, so attributing money to a
 * cause would either double-count it or pick one arbitrarily. States are worse
 * — the donations endpoint returns organisations as `{id, slug, name, logoUrl,
 * coverUrl}` with no location at all, so a per-donor count could only come from
 * fetching every organisation the donor has ever supported.
 *
 * On a platform whose pitch is traceable money, an invented denominator is a
 * worse failure than a missing statistic.
 */
export function GivingOverview({
  stats,
  isPending,
}: {
  stats: DonorStats | undefined;
  isPending: boolean;
}) {
  const currency = stats?.currency ?? "inr";
  const total = stats?.totalDonatedMinor ?? 0;
  const donations = stats?.donationCount ?? 0;
  const organizations = stats?.organizationsSupported ?? 0;

  return (
    <section className="border-b border-border pb-10">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Your giving
      </p>

      <div className="mt-6 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          {isPending ? (
            <Skeleton className="h-20 w-72" />
          ) : (
            <p
              className="font-display font-semibold leading-[0.9] tracking-[-0.03em] text-foreground"
              style={{
                // Sized against the viewport so a seven-figure total on a phone
                // stays on one line. `tnum` keeps the digits from reflowing as
                // the count runs.
                fontSize: "clamp(2.75rem, 8vw, 5rem)",
                fontVariationSettings: '"SOFT" 12',
              }}
            >
              <CountUp
                className="tnum"
                value={total}
                format={(n) => formatMoneyCompact(n, currency)}
                duration={1100}
              >
                {formatMoney(total, currency)}
              </CountUp>
            </p>
          )}

          <p className="mt-4 text-sm text-muted-foreground">
            {isPending ? (
              <Skeleton className="h-4 w-56" />
            ) : (
              <>
                total contributed across{" "}
                <span className="font-semibold text-foreground">
                  {donations.toLocaleString()}
                </span>{" "}
                {donations === 1 ? "contribution" : "contributions"} to{" "}
                <span className="font-semibold text-foreground">
                  {organizations.toLocaleString()}
                </span>{" "}
                {organizations === 1 ? "organisation" : "organisations"}
              </>
            )}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <Link
            to="/browse"
            className="group inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-subtle transition-all duration-200 ease-out-soft hover:shadow-raised active:scale-[0.97]"
          >
            Discover nonprofits
            <ArrowRight className="h-4 w-4 transition-transform duration-200 ease-out-soft group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
