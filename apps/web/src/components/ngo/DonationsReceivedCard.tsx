import { useState } from "react";
import { ChevronLeft, ChevronRight, HandCoins, UserX } from "lucide-react";
import { formatMoney } from "@impactbridge/shared";
import { useReceivedDonations } from "@/api/ngo";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Every donation that actually reached this organisation.
 *
 * Anonymous gifts arrive with `donorName: null` — the API strips the name
 * server-side, so there is no real name in the payload for this component to
 * accidentally reveal.
 */
export function DonationsReceivedCard() {
  const [page, setPage] = useState(1);
  const { data, isPending, isPlaceholderData } = useReceivedDonations(page);

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-subtle">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <HandCoins className="h-4 w-4 text-primary" />
            Donations received
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {data ? `${data.total} donations` : "Money that reached you"}
          </p>
        </div>
      </div>

      {isPending && <Skeleton className="mt-4 h-48 w-full rounded-lg" />}

      {data && data.items.length === 0 && (
        <p className="mt-4 rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          No donations yet. Share your profile to start receiving support.
        </p>
      )}

      {data && data.items.length > 0 && (
        <>
          <div
            className={
              isPlaceholderData ? "mt-4 opacity-60 transition-opacity" : "mt-4"
            }
          >
            {/* Horizontal scroll keeps the table usable on a phone without
                squashing the amount column. */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    <th className="pb-2 font-medium">Donor</th>
                    <th className="pb-2 font-medium">Date</th>
                    <th className="pb-2 font-medium">Receipt</th>
                    <th className="pb-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.items.map((donation) => (
                    <tr key={donation.id}>
                      <td className="py-3 pr-4">
                        {donation.donorName ? (
                          <span className="font-medium text-foreground">
                            {donation.donorName}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                            <UserX className="h-3.5 w-3.5" />
                            Anonymous
                          </span>
                        )}
                        {donation.message && (
                          <p className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground">
                            “{donation.message}”
                          </p>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {formatDate(donation.completedAt)}
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">
                        {donation.receiptNumber ?? "—"}
                      </td>
                      <td className="py-3 text-right font-semibold text-foreground">
                        {formatMoney(donation.amountMinor, donation.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {data.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
              <p className="text-xs text-muted-foreground">
                Page {data.page} of {data.totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={page >= data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
