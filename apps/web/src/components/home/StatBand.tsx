import { formatMoneyCompact } from "@impactbridge/shared";
import { usePublicStats } from "@/api/stats";
import { CountUp } from "@/components/ui/CountUp";
import { Reveal } from "@/components/ui/Reveal";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Platform totals — real, and deliberately quiet.
 *
 * This is a portfolio deployment with seeded activity, so setting "₹28,10,600
 * RAISED" at hero scale would invite a question the dataset cannot survive.
 * Presented modestly instead, with the demo footnote stated plainly rather
 * than buried: honest framing reads as professional, whereas an inflated
 * number that turns out to be seed data reads as something much worse on a
 * product whose whole argument is traceable money.
 *
 * Every figure comes from `GET /api/stats/public`, which only returns values
 * derivable from a row count or a sum. Notably absent: "people reached" — the
 * impact metrics are free-form strings and cannot be summed.
 */
export function StatBand() {
  const { data, isPending, isError } = usePublicStats();

  // Silently absent on failure. A broken stat band is worse than no stat band;
  // the page reads perfectly well without it.
  if (isError) return null;

  const stats = data
    ? [
        { label: "Organisations", value: String(data.organizations), n: data.organizations },
        { label: "Verified", value: String(data.verifiedOrganizations), n: data.verifiedOrganizations },
        { label: "Open grants", value: String(data.openGrants), n: data.openGrants },
        {
          label: "Raised",
          value: formatMoneyCompact(data.totalRaisedMinor, data.currency),
          n: data.totalRaisedMinor,
          money: true,
        },
        { label: "States", value: String(data.states), n: data.states },
      ]
    : [];

  return (
    <section className="border-t border-border bg-background py-20 sm:py-24">
      {/* Above the page thread (z-5), which passes behind this column. */}
      <div className="relative z-10 mx-auto max-w-6xl px-6">
        <Reveal>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Built for transparent funding
          </p>
        </Reveal>

        {isPending ? (
          <div className="mt-10 grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-3 h-9 w-16" />
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-10 grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3 lg:grid-cols-5">
            {stats.map((stat, i) => (
              <Reveal key={stat.label} delay={i * 70}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {stat.label}
                </p>
                <p
                  className="tnum mt-2.5 font-grotesk text-3xl font-extrabold leading-none tracking-[-0.02em] text-foreground sm:text-4xl"
                  style={{ fontStretch: "88%" }}
                >
                  {/*
                    Money counts up through the compact formatter so the frames
                    read as currency rather than a raw paise integer racing past.
                  */}
                  <CountUp
                    value={stat.n}
                    format={
                      stat.money
                        ? (v) => formatMoneyCompact(Math.round(v), data!.currency)
                        : undefined
                    }
                  >
                    {stat.value}
                  </CountUp>
                </p>
              </Reveal>
            ))}
          </div>
        )}

        <p className="mt-12 max-w-xl border-t border-border pt-5 text-xs leading-relaxed text-muted-foreground">
          Demo environment — the figures above reflect seeded platform activity,
          not a live deployment. They are read directly from the database rather
          than written into the page.
        </p>
      </div>
    </section>
  );
}
