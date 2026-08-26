import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Bookmark,
  Building2,
  Download,
  HandHeart,
  Search,
  Wallet,
} from "lucide-react";
import { formatMoney } from "@impactbridge/shared";
import { useDonations, useDonorStats } from "@/api/donations";
import { useBookmarkedOrganizations } from "@/api/organizations";
import { openReceipt } from "@/lib/receipt";
import { OrganizationCard } from "@/components/organizations/OrganizationCard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  SUCCEEDED: "bg-primary/10 text-primary",
  PENDING: "bg-accent/15 text-foreground",
  FAILED: "bg-destructive/10 text-destructive",
  CANCELLED: "bg-secondary text-muted-foreground",
  REFUNDED: "bg-secondary text-muted-foreground",
};

export function DonorDashboard() {
  const [page, setPage] = useState(1);
  const { data: stats, isPending: statsPending } = useDonorStats();
  const { data: donations, isPending: donationsPending } = useDonations(page);
  const { data: bookmarks } = useBookmarkedOrganizations();

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Donor dashboard
          </p>
          <h1
            className="mt-3 font-display text-3xl font-semibold tracking-[-0.02em] text-foreground sm:text-4xl"
            style={{ fontVariationSettings: '"SOFT" 12' }}
          >
            Your giving
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Every donation, and the organisations behind them.
          </p>
        </div>
        <Link
          to="/browse"
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Search className="h-4 w-4" />
          Discover nonprofits
        </Link>
      </header>

      {/* Stats */}
      <section className="grid grid-cols-1 gap-px overflow-hidden border-y border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Wallet}
          label="Total donated"
          value={
            statsPending
              ? undefined
              : formatMoney(stats?.totalDonatedMinor ?? 0, stats?.currency)
          }
        />
        <StatCard
          icon={HandHeart}
          label="Donations made"
          value={statsPending ? undefined : String(stats?.donationCount ?? 0)}
        />
        <StatCard
          icon={Building2}
          label="Organisations supported"
          value={
            statsPending ? undefined : String(stats?.organizationsSupported ?? 0)
          }
        />
        <StatCard
          icon={Bookmark}
          label="Saved"
          value={statsPending ? undefined : String(stats?.bookmarkCount ?? 0)}
        />
      </section>

      {/* Donation history */}
      <section>
        <h2 className="mb-4 text-lg font-semibold tracking-tight text-foreground">
          Donation history
        </h2>

        {donationsPending ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : donations?.items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-14 text-center">
            <p className="font-medium text-foreground">No donations yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Find a cause you care about and make your first contribution.
            </p>
            <Link
              to="/browse"
              className="mt-4 inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Browse nonprofits
            </Link>
          </div>
        ) : (
          <>
            <ul className="space-y-2">
              {donations?.items.map((donation) => (
                <li
                  key={donation.id}
                  className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-subtle"
                >
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-secondary">
                    {donation.organization.coverUrl && (
                      <img
                        src={donation.organization.coverUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/ngo/${donation.organization.slug}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {donation.organization.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {new Date(donation.createdAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                      {donation.receiptNumber && ` · ${donation.receiptNumber}`}
                    </p>
                  </div>

                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-medium",
                      STATUS_STYLES[donation.status],
                    )}
                  >
                    {donation.status.toLowerCase()}
                  </span>

                  <span className="font-semibold text-foreground">
                    {formatMoney(donation.amountMinor, donation.currency)}
                  </span>

                  {donation.status === "SUCCEEDED" && (
                    <button
                      type="button"
                      onClick={() => void openReceipt(donation.id)}
                      aria-label={`Download receipt for ${donation.organization.name}`}
                      className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>

            {donations && donations.totalPages > 1 && (
              <nav
                className="mt-4 flex items-center justify-center gap-2"
                aria-label="Donation history pages"
              >
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
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
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </nav>
            )}
          </>
        )}
      </section>

      {/* Saved organisations */}
      {bookmarks && bookmarks.length > 0 && (
        <section>
          <div className="mb-4 flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Saved organisations
            </h2>
            <Badge>{bookmarks.length}</Badge>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {bookmarks.map((org) => (
              <OrganizationCard key={org.id} org={org} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Wallet;
  label: string;
  value?: string;
}) {
  return (
    // Same hairline-band treatment as the other dashboards, so a donor and an
    // NGO admin recognise the same product.
    <div className="bg-background py-5 sm:px-5">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">
          {label}
        </span>
      </div>
      {value === undefined ? (
        <Skeleton className="mt-2 h-8 w-24" />
      ) : (
        <p
          className="tnum mt-2 font-grotesk text-2xl font-extrabold leading-none tracking-[-0.02em] text-foreground sm:text-3xl"
          style={{ fontStretch: "88%" }}
        >
          {value}
        </p>
      )}
    </div>
  );
}
