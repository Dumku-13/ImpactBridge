import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatMoney, formatMoneyCompact } from "@impactbridge/shared";
import type { DonationListResponse } from "@impactbridge/shared";
import { apiFetch } from "@/lib/api";
import { donationKeys } from "@/api/donations";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * The most the list endpoint will return in one request (`pageSizeSchema(50,
 * 10)` in `apps/api/src/routes/donations.ts`).
 */
const MAX_PAGE = 50;

/**
 * Giving over time, across as much history as one request can honestly cover.
 *
 * ── The size of the claim ──────────────────────────────────────────────────
 *
 * A donor with more contributions than `MAX_PAGE` has history this chart cannot
 * see, and the fix is NOT to page through their whole record on the client:
 * that is one request per fifty contributions every time the dashboard opens,
 * and it gets worse for exactly the donors who have given most.
 *
 * So the chart shows the most recent fifty and says so. The heading is computed
 * from `total` rather than fixed — under the cap it is the complete record and
 * claims that; over it, it names the number it is actually drawn from. What it
 * never does is imply a lifetime shape from a slice, which is the failure the
 * month totals in the timeline already had to be guarded against.
 *
 * A real "all time by month" figure belongs in an endpoint that groups in SQL,
 * the way `/stats/public` does. That is a backend change, not a chart.
 */
export function GivingOverTime() {
  const { data, isPending } = useQuery({
    queryKey: [...donationKeys.all, "recent", MAX_PAGE] as const,
    queryFn: () =>
      apiFetch<DonationListResponse>(`/donations?page=1&pageSize=${MAX_PAGE}`),
  });

  const [active, setActive] = useState<string | null>(null);

  const months = useMemo(() => {
    if (!data) return [];

    const buckets = new Map<
      string,
      { key: string; label: string; total: number; count: number; currency: string }
    >();

    // Completed only. A pending or failed payment has moved no money, and a
    // column that counts one is drawing a promise as though it were a gift.
    for (const donation of data.items) {
      if (donation.status !== "SUCCEEDED") continue;
      const date = new Date(donation.createdAt);
      const key = `${date.getFullYear()}-${String(date.getMonth()).padStart(2, "0")}`;
      const existing = buckets.get(key);

      if (existing) {
        existing.total += donation.amountMinor;
        existing.count += 1;
        continue;
      }

      buckets.set(key, {
        key,
        label: date.toLocaleDateString("en-IN", { month: "short" }).toUpperCase(),
        total: donation.amountMinor,
        count: 1,
        currency: donation.currency,
      });
    }

    // Oldest first: time reads left to right.
    return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key));
  }, [data]);

  if (isPending) {
    return (
      <section className="border-b border-border py-14">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-8 h-40 w-full" />
      </section>
    );
  }

  // One month is not a shape. Two columns say nothing a sentence would not say
  // better, so the section stands down rather than drawing a stub.
  if (months.length < 2) return null;

  const peak = Math.max(...months.map((m) => m.total));
  const shown = months.reduce((sum, m) => sum + m.count, 0);
  const complete = (data?.total ?? 0) <= MAX_PAGE;
  const activeMonth = months.find((m) => m.key === active);

  return (
    <section className="border-b border-border py-14">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Giving over time
        </p>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {complete
            ? "All contributions"
            : `Most recent ${shown.toLocaleString()} contributions`}
        </p>
      </div>

      {/*
        A readout above the columns rather than a tooltip beside the cursor.
        A floating tooltip on a bar chart covers the neighbouring columns —
        the exact comparison the reader is making — and cannot be reached at
        all by keyboard.
      */}
      <p className="mt-6 h-6 text-sm text-muted-foreground">
        {activeMonth ? (
          <>
            <span className="font-semibold text-foreground">
              {activeMonth.label}
            </span>
            {" · "}
            <span className="tnum font-semibold text-accent">
              {formatMoney(activeMonth.total, activeMonth.currency)}
            </span>
            {" · "}
            {activeMonth.count}{" "}
            {activeMonth.count === 1 ? "contribution" : "contributions"}
          </>
        ) : (
          "Point at a month to read it."
        )}
      </p>

      <ul
        className="mt-4 flex items-end gap-2 sm:gap-3"
        onPointerLeave={() => setActive(null)}
      >
        {months.map((month) => (
          <li key={month.key} className="flex min-w-0 flex-1 flex-col items-center">
            <button
              type="button"
              onPointerEnter={() => setActive(month.key)}
              onFocus={() => setActive(month.key)}
              onBlur={() => setActive(null)}
              aria-label={`${month.label}: ${formatMoney(month.total, month.currency)} across ${month.count} contributions`}
              className="group flex w-full flex-col items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="tnum mb-2 text-[10px] font-semibold text-muted-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
                {formatMoneyCompact(month.total, month.currency)}
              </span>
              {/*
                `h-32` on the track and a percentage inside it, so every column
                is measured against the same axis rather than against its own
                content box.
              */}
              <span className="flex h-32 w-full items-end">
                <span
                  className={`w-full rounded-t-sm transition-colors duration-200 ease-out-soft ${
                    active === month.key ? "bg-accent" : "bg-muted-foreground/35"
                  }`}
                  style={{ height: `${Math.max(2, (month.total / peak) * 100)}%` }}
                />
              </span>
              <span className="tnum mt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {month.label}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
