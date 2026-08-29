import { Link, useParams } from "react-router-dom";
import { ArrowLeft, BadgeCheck, Star, Users } from "lucide-react";
import { formatMoney } from "@impactbridge/shared";
import { useGrantApplications } from "@/api/applications";
import { useMyGrants } from "@/api/grants";
import { ApplicationStatusBadge } from "@/components/grants/ApplicationPipeline";
import { Skeleton } from "@/components/ui/Skeleton";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

/**
 * The funder's applicant queue for one grant — the "compare applicants" view.
 *
 * Deliberately a table: comparing candidates means scanning one attribute
 * across many rows (score, amount, track record), which cards make harder.
 */
export function GrantApplicantsPage() {
  useDocumentTitle("Applicants");
  const { grantId = "" } = useParams();
  const { data: applications, isPending } = useGrantApplications(grantId);
  const { data: grants } = useMyGrants();

  const grant = grants?.find((g) => g.id === grantId);

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-8">
      <Link
        to="/funder"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Funding dashboard
      </Link>

      <header>
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <Users className="h-3.5 w-3.5 text-primary" />
          Review queue
        </p>
        <h1
          className="mt-3 font-display text-3xl font-semibold tracking-[-0.02em] text-foreground sm:text-4xl"
          style={{ fontVariationSettings: '"SOFT" 12' }}
        >
          {grant ? grant.title : "Applicants"}
        </h1>
        {grant && (
          <p className="tnum mt-2 text-sm text-muted-foreground">
            {formatMoney(grant.amountMinor, grant.currency)} available
            {applications ? ` · ${applications.length} submitted` : ""}
          </p>
        )}
      </header>

      {isPending && <Skeleton className="h-48 w-full rounded-xl" />}

      {applications?.length === 0 && (
        <p className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          No submitted applications yet. Drafts stay private to the applicant
          until they submit.
        </p>
      )}

      {/*
        Rows, not a table.

        This was a `min-w-[720px]` table inside a horizontal scroller, which on
        a phone meant swiping sideways to discover that a column existed at all
        — the requested amount, the thing a reviewer most needs, was the one
        furthest off-screen. Each applicant is now a self-contained row that
        reflows: the figures move under the name on narrow screens instead of
        off the edge of it.
      */}
      {applications && applications.length > 0 && (
        <div className="border-t border-border">
          {applications.map((application) => (
            <Link
              key={application.id}
              to={`/applications/${application.id}`}
              className="group block border-b border-border py-5 transition-colors duration-200 hover:bg-secondary/40"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <ApplicationStatusBadge status={application.status} />
                    {application.averageScore != null && (
                      /*
                        A star, a number and a number in brackets is legible to
                        anyone who can see the star. Read aloud it is "4 (1)" —
                        two bare numbers with nothing to attach them to, since
                        lucide icons render as decorative SVG with no name. The
                        label carries the meaning; the parts stay hidden so it
                        isn't announced twice.
                      */
                      <span
                        className="tnum inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground"
                        aria-label={`Average reviewer score ${application.averageScore} out of 5, from ${application.reviewCount} ${application.reviewCount === 1 ? "review" : "reviews"}`}
                      >
                        <span aria-hidden="true" className="inline-flex items-center gap-1">
                          <Star className="h-3 w-3 text-primary" />
                          {application.averageScore}
                          <span className="text-muted-foreground/70">
                            ({application.reviewCount})
                          </span>
                        </span>
                      </span>
                    )}
                  </div>

                  <h2
                    className="mt-2 flex items-center gap-1.5 font-display text-lg font-semibold leading-snug text-foreground transition-colors duration-200 group-hover:text-primary"
                    style={{ fontVariationSettings: '"SOFT" 12' }}
                  >
                    {application.organization.name}
                    {application.organization.verified && (
                      <BadgeCheck
                        className="h-4 w-4 shrink-0 text-primary"
                        aria-label="Verified organisation"
                      />
                    )}
                  </h2>

                  <p className="tnum mt-1.5 text-xs text-muted-foreground">
                    {[application.organization.city, application.organization.state]
                      .filter(Boolean)
                      .join(", ") || "Location not given"}
                    {application.organization.foundedYear && (
                      <> · est. {application.organization.foundedYear}</>
                    )}
                    <> · </>
                    {formatMoney(
                      application.organization.totalRaisedMinor,
                      application.currency,
                    )}{" "}
                    raised to date
                  </p>
                </div>

                <div className="shrink-0 sm:text-right">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Requested
                  </p>
                  <p
                    className="tnum mt-1 font-grotesk text-xl font-extrabold leading-none text-foreground"
                    style={{ fontStretch: "88%" }}
                  >
                    {formatMoney(
                      application.requestedAmountMinor,
                      application.currency,
                    )}
                  </p>
                  {application.awardedAmountMinor != null && (
                    <p className="tnum mt-1.5 text-xs font-semibold text-primary">
                      {formatMoney(
                        application.awardedAmountMinor,
                        application.currency,
                      )}{" "}
                      awarded
                    </p>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
