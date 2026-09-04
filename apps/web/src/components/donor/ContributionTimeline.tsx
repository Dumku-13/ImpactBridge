import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Download } from "lucide-react";
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
 * One contribution, with everything the API actually knows about it.
 *
 * The row already carried organisation, date, status, receipt number and
 * amount, so a detail view repeating those would be motion for its own sake.
 * It does not repeat them: `message`, `anonymous` and `completedAt` are all
 * returned by `/donations` and shown nowhere else on this dashboard. A note is
 * the most personal thing in the whole record, which makes hiding it the odd
 * choice — 352 of the 559 seeded contributions carry one.
 *
 * Expansion rather than a drawer or a dialog. A donor opening a contribution is
 * checking one line against the rest of its month; a panel that covers the list
 * removes the context they opened it from, and a modal adds a focus trap and a
 * dismissal to a disclosure that needs neither.
 *
 * The disclosure is the left cell only, not the whole row. Making the row a
 * button would nest the receipt download inside it, which is invalid HTML and
 * leaves that control unreachable by keyboard.
 */
function ContributionRow({
  donation,
  expanded,
  onToggle,
}: {
  donation: Donation;
  expanded: boolean;
  onToggle: () => void;
}) {
  const panelId = useId();
  const buttonId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  /*
   * Measured height, not `grid-template-rows: 0fr/1fr`. Same reasoning the FAQ
   * records: where the tidier version is unsupported it does not degrade to an
   * instant open, it degrades to no open at all.
   */
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const measure = () => setContentHeight(el.scrollHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const stamp = (iso: string) =>
    new Date(iso).toLocaleString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  return (
    <li>
      <div className="group grid grid-cols-[1fr_auto] items-baseline gap-x-6 gap-y-1 border-b border-border/60 py-4 transition-colors duration-200 hover:bg-secondary/40 sm:grid-cols-[1fr_auto_auto]">
        <button
          id={buttonId}
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={panelId}
          className="min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground transition-colors duration-200 group-hover:text-primary">
              {donation.organization.name}
            </span>
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-300 ease-out-soft motion-reduce:transition-none",
                expanded && "rotate-180",
              )}
            />
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
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
          </span>
        </button>

        <p className="tnum text-right text-sm font-semibold text-foreground sm:text-base">
          {formatMoney(donation.amountMinor, donation.currency)}
        </p>

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

      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        aria-hidden={!expanded}
        style={{ height: expanded ? contentHeight : 0 }}
        className="overflow-hidden border-b border-border/60 transition-[height] duration-300 ease-out-soft motion-reduce:transition-none"
      >
        <div ref={contentRef}>
          <dl className="grid gap-x-8 gap-y-4 py-5 pr-4 sm:grid-cols-2">
            {donation.message ? (
              <div className="sm:col-span-2">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Your note
                </dt>
                <dd className="mt-2 max-w-prose text-sm leading-relaxed text-foreground">
                  {donation.message}
                </dd>
              </div>
            ) : null}

            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Given
              </dt>
              <dd className="tnum mt-1.5 text-sm text-foreground">
                {stamp(donation.createdAt)}
              </dd>
            </div>

            {donation.completedAt ? (
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Confirmed
                </dt>
                <dd className="tnum mt-1.5 text-sm text-foreground">
                  {stamp(donation.completedAt)}
                </dd>
              </div>
            ) : null}

            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Attribution
              </dt>
              <dd className="mt-1.5 text-sm text-foreground">
                {donation.anonymous
                  ? "Given anonymously - your name is not shown publicly"
                  : "Given in your name"}
              </dd>
            </div>

            <div className="sm:col-span-2">
              <Link
                to={`/ngo/${donation.organization.slug}`}
                className="group/link inline-flex items-center gap-2 text-sm font-semibold text-foreground transition-colors hover:text-primary"
              >
                View organisation
                <span
                  aria-hidden="true"
                  className="transition-transform duration-200 ease-out-soft group-hover/link:translate-x-0.5"
                >
                  &rarr;
                </span>
              </Link>
            </div>
          </dl>
        </div>
      </div>
    </li>
  );
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
  /*
   * One at a time, unlike the FAQ two files over — and the difference is the
   * reading task, not a change of mind. FAQ answers get compared against each
   * other, so closing one to open another turns a comparison into a memory
   * test. A contribution is inspected on its own: nobody reads two receipts
   * side by side, and ten open panels turn a scannable record into a wall.
   */
  const [expanded, setExpanded] = useState<string | null>(null);

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
                <ContributionRow
                  key={donation.id}
                  donation={donation}
                  expanded={expanded === donation.id}
                  onToggle={() =>
                    setExpanded((current) =>
                      current === donation.id ? null : donation.id,
                    )
                  }
                />
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
