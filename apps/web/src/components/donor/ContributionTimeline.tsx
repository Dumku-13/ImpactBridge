import { Download } from "lucide-react";
import { formatMoney } from "@impactbridge/shared";
import type { Donation, DonationListResponse } from "@impactbridge/shared";
import { openReceipt } from "@/lib/receipt";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  SUCCEEDED: "Completed",
  PENDING: "Pending",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
};

/*
 * Status as a word in a colour, not a pill. Twenty rows each carrying a filled
 * lozenge turns a financial record into a bag of sweets; the money is what the
 * eye should land on, and everything else is annotation around it.
 */
const STATUS_TONE: Record<string, string> = {
  SUCCEEDED: "text-muted-foreground",
  PENDING: "text-accent",
  FAILED: "text-destructive",
  CANCELLED: "text-muted-foreground",
  REFUNDED: "text-muted-foreground",
};

interface MonthGroup {
  key: string;
  label: string;
  items: Donation[];
  /** Sum of completed contributions in this group, or null when unknowable. */
  total: number | null;
  currency: string;
}

/**
 * Group a page of contributions by calendar month.
 *
 * ── Why a total is sometimes null ──────────────────────────────────────────
 *
 * The endpoint pages ten at a time, so a month can be cut in half by a page
 * boundary: September might have four rows here and nine more on the next page.
 * Printing "SEPTEMBER ₹27,400" beside four of thirteen contributions is not a
 * rounding error, it is a wrong number in the one place a giving record has to
 * be right.
 *
 * A boundary group is provably incomplete, and exactly two can be:
 *
 *   - the FIRST group on any page after the first, because its month almost
 *     certainly continues onto the page above
 *   - the LAST group on any page before the last, for the mirror reason
 *
 * Those two get no total. Every other group is wholly contained in this page,
 * so its sum is exact and is shown.
 */
function groupByMonth(
  items: Donation[],
  page: number,
  totalPages: number,
): MonthGroup[] {
  const groups: MonthGroup[] = [];

  for (const item of items) {
    const date = new Date(item.createdAt);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const last = groups[groups.length - 1];

    if (last && last.key === key) {
      last.items.push(item);
      continue;
    }

    groups.push({
      key,
      label: date
        .toLocaleDateString("en-IN", { month: "long", year: "numeric" })
        .toUpperCase(),
      items: [item],
      total: 0,
      currency: item.currency,
    });
  }

  return groups.map((group, index) => {
    const isFirst = index === 0;
    const isLast = index === groups.length - 1;
    const cutAbove = isFirst && page > 1;
    const cutBelow = isLast && page < totalPages;

    return {
      ...group,
      total:
        cutAbove || cutBelow
          ? null
          : group.items
              .filter((d) => d.status === "SUCCEEDED")
              .reduce((sum, d) => sum + d.amountMinor, 0),
    };
  });
}

/**
 * The contribution record, as a timeline rather than twenty identical cards.
 *
 * Structure comes from the month headings and a single hairline rule per row —
 * no boxes. A bordered card around every donation was the largest single source
 * of visual noise on this page, and it carried no information: the rows are
 * already a list, and a list does not need twenty frames to say so.
 */
export function ContributionTimeline({
  donations,
  isPending,
  page,
  onPageChange,
}: {
  donations: DonationListResponse | undefined;
  isPending: boolean;
  page: number;
  onPageChange: (page: number) => void;
}) {
  if (isPending) {
    return (
      <section className="border-b border-border py-14">
        <Skeleton className="h-3 w-44" />
        <div className="mt-8 space-y-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </section>
    );
  }

  if (!donations || donations.items.length === 0) {
    return (
      <section className="border-b border-border py-14">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Your contributions
        </p>
        <p className="mt-6 font-display text-2xl font-semibold text-foreground">
          Nothing here yet
        </p>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          Your contributions will appear here as a running record, with a
          receipt for every completed payment.
        </p>
      </section>
    );
  }

  const groups = groupByMonth(donations.items, donations.page, donations.totalPages);

  return (
    <section className="border-b border-border py-14">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Your contributions
      </p>

      <div className="mt-8 space-y-10">
        {groups.map((group) => (
          <div key={group.key}>
            <div className="flex items-baseline justify-between gap-4 border-b border-border pb-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground">
                {group.label}
              </h3>
              {group.total !== null && group.total > 0 ? (
                <p className="tnum text-sm font-semibold text-accent">
                  {formatMoney(group.total, group.currency)}
                </p>
              ) : null}
            </div>

            <ul>
              {group.items.map((donation) => (
                <li key={donation.id}>
                  {/*
                    The row is a grid, not a flex run, so the amount column
                    lines up down the whole month regardless of how long an
                    organisation's name is — which is the entire point of
                    setting a financial record in tabular figures.
                  */}
                  <div className="group grid grid-cols-[1fr_auto] items-baseline gap-x-6 gap-y-1 border-b border-border/60 py-4 transition-colors duration-200 hover:bg-secondary/40 sm:grid-cols-[1fr_auto_auto]">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground transition-colors duration-200 group-hover:text-primary">
                        {donation.organization.name}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        <time dateTime={donation.createdAt}>
                          {new Date(donation.createdAt).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                          })}
                        </time>
                        <span className={cn("ml-2", STATUS_TONE[donation.status])}>
                          {STATUS_LABEL[donation.status] ?? donation.status}
                        </span>
                        {donation.receiptNumber ? (
                          <span className="ml-2 tnum">{donation.receiptNumber}</span>
                        ) : null}
                      </p>
                    </div>

                    <p className="tnum text-right text-sm font-semibold text-foreground sm:text-base">
                      {formatMoney(donation.amountMinor, donation.currency)}
                    </p>

                    {/*
                      The receipt is always in the layout when it exists, never
                      revealed only on hover: a control that appears on hover is
                      unreachable by touch, and this one is the document a donor
                      needs at tax time. Hover only raises its contrast.
                    */}
                    <div className="col-start-2 row-start-1 justify-self-end sm:col-start-3">
                      {donation.status === "SUCCEEDED" ? (
                        <button
                          type="button"
                          onClick={() => void openReceipt(donation.id)}
                          aria-label={`Download receipt for ${donation.organization.name}`}
                          className="rounded-lg p-2 text-muted-foreground opacity-60 transition-all duration-200 ease-out-soft hover:bg-secondary hover:text-foreground group-hover:opacity-100 active:scale-90"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      ) : (
                        <span className="block h-8 w-8" aria-hidden="true" />
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {donations.totalPages > 1 && (
        <nav
          className="mt-8 flex items-center justify-center gap-2"
          aria-label="Contribution history pages"
        >
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </Button>
          <span className="px-2 text-sm text-muted-foreground">
            Page {donations.page} of {donations.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page === donations.totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </nav>
      )}
    </section>
  );
}
