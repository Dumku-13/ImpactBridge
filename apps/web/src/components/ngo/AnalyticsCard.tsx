import { BarChart3, TrendingUp, UserX } from "lucide-react";
import { formatMoney } from "@impactbridge/shared";
import { useOrganizationAnalytics } from "@/api/ngo";
import { Skeleton } from "@/components/ui/Skeleton";

/** "2026-08" → "Aug" (and "Aug '26" each January, to mark the year turning). */
function monthLabel(key: string): string {
  const [year, month] = key.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  const short = date.toLocaleDateString("en-IN", { month: "short" });
  return month === "01" ? `${short} '${year!.slice(2)}` : short;
}

/**
 * Twelve-month donation chart, drawn as inline SVG.
 *
 * A charting library would be several hundred kilobytes for one bar chart, and
 * would still need this much configuration to look right. Plain SVG also means
 * the bars inherit `currentColor`, so light and dark themes work with no extra
 * code.
 */
function MonthlyChart({
  data,
  currency,
}: {
  data: Array<{ month: string; totalMinor: number; count: number }>;
  currency: string;
}) {
  // Guard against dividing by zero when an NGO has no donations yet.
  const max = Math.max(...data.map((d) => d.totalMinor), 1);

  return (
    <div className="mt-4">
      <div className="relative flex h-44 items-end gap-1.5">
        {/* Gridlines behind the bars give the eye a baseline to read against. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex flex-col justify-between"
        >
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="h-px w-full bg-border/60" />
          ))}
        </div>

        {data.map((point, i) => {
          const heightPct = (point.totalMinor / max) * 100;

          return (
            <div
              key={point.month}
              className="group relative flex flex-1 flex-col items-center justify-end"
            >
              {/* Tooltip on hover. `pointer-events-none` stops it stealing the
                  hover from the bar underneath and flickering. */}
              <div className="pointer-events-none absolute bottom-full z-10 mb-2 hidden whitespace-nowrap rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs shadow-lifted group-hover:block">
                <span className="tnum font-semibold text-foreground">
                  {formatMoney(point.totalMinor, currency)}
                </span>
                <span className="ml-1.5 text-muted-foreground">
                  {point.count} {point.count === 1 ? "gift" : "gifts"}
                </span>
              </div>

              {/*
                Bars grow from the baseline on first paint, staggered left to
                right so the year reads as a sequence. `transform-origin: bottom`
                with scaleY keeps it on the compositor — animating `height`
                would relayout the chart twelve times per frame.
              */}
              <div
                className="w-full origin-bottom rounded-t-md bg-gradient-to-t from-primary to-primary/70 transition-all duration-200 ease-out-soft group-hover:from-primary group-hover:to-accent motion-safe:animate-[fade-up_0.6s_cubic-bezier(0.22,1,0.36,1)_both]"
                style={{
                  // A floor of 2px keeps a zero month visible as an empty
                  // baseline rather than disappearing entirely.
                  height: `max(${heightPct}%, 2px)`,
                  animationDelay: `${i * 45}ms`,
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex gap-1.5">
        {data.map((point) => (
          <p
            key={point.month}
            className="flex-1 text-center text-[10px] text-muted-foreground"
          >
            {monthLabel(point.month)}
          </p>
        ))}
      </div>
    </div>
  );
}

export function AnalyticsCard() {
  const { data, isPending } = useOrganizationAnalytics();

  if (isPending) {
    return (
      <section className="rounded-xl border border-border bg-card p-5 shadow-subtle">
        <Skeleton className="h-64 w-full rounded-lg" />
      </section>
    );
  }

  if (!data) return null;

  const stats = [
    {
      label: "Total raised",
      value: formatMoney(data.totalRaisedMinor, data.currency),
    },
    { label: "Donations", value: String(data.donationCount) },
    {
      label: "Average gift",
      value: formatMoney(data.averageDonationMinor, data.currency),
    },
  ];

  const topMax = Math.max(...data.topDonors.map((d) => d.totalMinor), 1);

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-subtle">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
        <BarChart3 className="h-4 w-4 text-primary" />
        Analytics
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        The last 12 months of giving.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-border bg-secondary/30 p-3"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {stat.label}
            </p>
            <p className="tnum mt-1 font-display text-xl font-semibold text-foreground">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <h3 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
          Monthly donations
        </h3>
        <MonthlyChart data={data.monthly} currency={data.currency} />
      </div>

      {data.topDonors.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-medium text-foreground">Top supporters</h3>

          <ul className="mt-3 space-y-2">
            {data.topDonors.map((donor) => (
              <li key={donor.name} className="group flex items-center gap-3">
                <span className="w-32 shrink-0 truncate text-sm text-foreground">
                  {donor.name}
                </span>

                <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                  {/*
                    scaleX from the left, so the leaderboard draws itself in
                    rather than appearing pre-filled.
                  */}
                  <div
                    className="h-full origin-left rounded-full bg-gradient-to-r from-primary to-primary/70 transition-all duration-300 ease-out-soft group-hover:to-accent motion-safe:animate-draw-in"
                    style={{
                      width: `${(donor.totalMinor / topMax) * 100}%`,
                    }}
                  />
                </div>

                <span className="tnum w-24 shrink-0 text-right text-sm font-semibold text-foreground">
                  {formatMoney(donor.totalMinor, data.currency)}
                </span>
              </li>
            ))}
          </ul>

          {data.anonymous.count > 0 && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <UserX className="h-3.5 w-3.5" />
              Plus {formatMoney(data.anonymous.totalMinor, data.currency)} from{" "}
              {data.anonymous.count} anonymous{" "}
              {data.anonymous.count === 1 ? "gift" : "gifts"} — these are left
              out of the leaderboard so totals can't identify the giver.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
