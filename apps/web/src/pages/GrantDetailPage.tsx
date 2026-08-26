import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarClock,
  Coins,
  ListChecks,
  MapPin,
} from "lucide-react";
import { formatMoney } from "@impactbridge/shared";
import { useGrant } from "@/api/grants";
import { useAuth } from "@/auth/AuthContext";
import { deadlineLabel } from "@/components/grants/GrantCard";
import { useMyOrganization } from "@/api/ngo";
import {
  EligibilityNotice,
  eligibilityFailures,
} from "@/components/grants/EligibilityCheck";
import { cn } from "@/lib/utils";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";
import { ApiError } from "@/lib/api";

export function GrantDetailPage() {
  const { slug = "" } = useParams();
  const { user } = useAuth();
  const { data: grant, isPending, error } = useGrant(slug);
  // Only an NGO admin has an organisation; the hook no-ops for other roles.
  const { data: myOrg } = useMyOrganization();

  if (isPending) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 py-8">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !grant) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <Alert variant="error">
          {error instanceof ApiError ? error.message : "Grant not found."}
        </Alert>
      </div>
    );
  }

  const deadline = deadlineLabel(grant.deadline);
  const isNgo = user?.role === "NGO_ADMIN";
  const ineligible = eligibilityFailures(grant.eligibility, myOrg);

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-8">
      <Link
        to="/grants"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        All grants
      </Link>

      <header>
        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {grant.categories.map((c) => (
            <span key={c.id}>{c.name}</span>
          ))}
          {grant.status === "CLOSED" && (
            <span className="text-muted-foreground/70">Closed</span>
          )}
          {grant.status === "DRAFT" && (
            <span className="text-muted-foreground/70">Draft</span>
          )}
        </p>

        <h1
          className="mt-3 font-display text-3xl font-semibold leading-tight tracking-[-0.025em] text-foreground sm:text-5xl"
          style={{ fontVariationSettings: '"SOFT" 12' }}
        >
          {grant.title}
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          {grant.summary}
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Offered by <span className="text-foreground">{grant.funder.name}</span>
        </p>
      </header>

      {/*
        The three figures that decide whether to apply, set as a hairline band
        rather than three boxes — the numbers carry it, not the chrome.
      */}
      <div className="grid grid-cols-1 gap-px overflow-hidden border-y border-border bg-border sm:grid-cols-3">
        <div className="bg-background py-5 sm:px-5">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <Coins className="h-3.5 w-3.5" />
            Total fund
          </p>
          <p
            className="tnum mt-2 font-grotesk text-2xl font-extrabold leading-none text-foreground sm:text-3xl"
            style={{ fontStretch: "88%" }}
          >
            {formatMoney(grant.amountMinor, grant.currency)}
          </p>
        </div>

        <div className="bg-background py-5 sm:px-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Max per award
          </p>
          <p
            className="tnum mt-2 font-grotesk text-2xl font-extrabold leading-none text-foreground sm:text-3xl"
            style={{ fontStretch: "88%" }}
          >
            {grant.maxAwardMinor
              ? formatMoney(grant.maxAwardMinor, grant.currency)
              : "No cap"}
          </p>
        </div>

        <div className="bg-background py-5 sm:px-5">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" />
            Deadline
          </p>
          <p
            className={cn(
              "tnum mt-2 font-grotesk text-2xl font-extrabold leading-none sm:text-3xl",
              deadline.urgent ? "text-destructive" : "text-foreground",
            )}
            style={{ fontStretch: "88%" }}
          >
            {deadline.text}
          </p>
        </div>
      </div>

      {/*
        Eligibility, checked before the applicant invests an evening in a
        proposal. The same rules the server enforces on submit — reading them
        here turns a 403 after the fact into a decision made up front.
      */}
      {isNgo && <EligibilityNotice reasons={ineligible} />}

      {grant.description && (
        <section className="rounded-xl border border-border bg-card p-5 shadow-subtle">
          <h2 className="text-lg font-semibold text-foreground">About this grant</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
            {grant.description}
          </p>
        </section>
      )}

      {grant.eligibility && (
        <section className="rounded-xl border border-border bg-card p-5 shadow-subtle">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <BadgeCheck className="h-4 w-4 text-primary" />
            Eligibility
          </h2>

          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {grant.eligibility.verifiedOnly && (
              <li className="flex items-start gap-2">
                <BadgeCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                Your organisation must be verified on ImpactBridge.
              </li>
            )}
            {grant.eligibility.minYearsActive != null &&
              grant.eligibility.minYearsActive > 0 && (
                <li className="flex items-start gap-2">
                  <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  At least {grant.eligibility.minYearsActive} years of operating
                  history.
                </li>
              )}
            {grant.eligibility.states.length > 0 && (
              <li className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                Operating in: {grant.eligibility.states.join(", ")}.
              </li>
            )}
            {grant.eligibility.notes && (
              <li className="text-muted-foreground">{grant.eligibility.notes}</li>
            )}
          </ul>
        </section>
      )}

      {grant.questions.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-5 shadow-subtle">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <ListChecks className="h-4 w-4 text-primary" />
            What you'll be asked
          </h2>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
            {grant.questions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ol>
        </section>
      )}

      {/* Applying itself lands in 4b; this is the entry point for it. */}
      {isNgo && (
        <div className="rounded-xl border border-border bg-card p-5 shadow-subtle">
          {grant.myApplication ? (
            <p className="text-sm text-muted-foreground">
              You have already applied to this grant — status:{" "}
              <span className="font-medium text-foreground">
                {grant.myApplication.status.toLowerCase().replace(/_/g, " ")}
              </span>
              .{" "}
              <Link
                to={`/applications/${grant.myApplication.id}`}
                className="text-primary hover:underline"
              >
                View your application
              </Link>
            </p>
          ) : deadline.closed || grant.status !== "OPEN" ? (
            <p className="text-sm text-muted-foreground">
              This grant is no longer accepting applications.
            </p>
          ) : (
            <Link
              to={`/grants/${grant.slug}/apply`}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              Apply for this grant
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
