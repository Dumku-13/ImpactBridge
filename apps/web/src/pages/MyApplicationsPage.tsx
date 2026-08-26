import { Link } from "react-router-dom";
import { FileText } from "lucide-react";
import {
  APPLICATION_PIPELINE,
  formatMoney,
  type ApplicationStatus,
} from "@impactbridge/shared";
import { useMyApplications } from "@/api/applications";
import { ApplicationStatusBadge } from "@/components/grants/ApplicationPipeline";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * A compact read on how far an application has travelled.
 *
 * The list payload carries only the current status — no event history — so this
 * shows position, not per-stage timestamps. Those live on the detail page,
 * which does receive the events. Deliberately eight plain segments rather than
 * labelled steps: at list scale the useful question is "how far along", and
 * eight labels would be unreadable anyway.
 */
function PipelineStrip({ status }: { status: ApplicationStatus }) {
  const terminal = status === "REJECTED" || status === "WITHDRAWN";
  const index = APPLICATION_PIPELINE.indexOf(status);

  return (
    <div
      className="flex gap-1"
      role="img"
      aria-label={
        terminal
          ? `Application ${status.toLowerCase()}`
          : `Stage ${index + 1} of ${APPLICATION_PIPELINE.length}`
      }
    >
      {APPLICATION_PIPELINE.map((stage, i) => (
        <span
          key={stage}
          className={cn(
            "h-1 w-6 rounded-full transition-colors duration-300",
            terminal
              ? "bg-destructive/25"
              : i <= index
                ? "bg-primary"
                : "bg-border",
          )}
        />
      ))}
    </div>
  );
}

export function MyApplicationsPage() {
  const { data: applications, isPending } = useMyApplications();

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-8">
      <header className="pb-2">
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <FileText className="h-3.5 w-3.5 text-primary" />
          Grant applications
        </p>
        <h1
          className="mt-3 font-display text-3xl font-semibold tracking-[-0.02em] text-foreground sm:text-4xl"
          style={{ fontVariationSettings: '"SOFT" 12' }}
        >
          Everything you&rsquo;ve applied for
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          And exactly where each one stands.
        </p>
      </header>

      {isPending && <Skeleton className="h-40 w-full rounded-xl" />}

      {applications?.length === 0 && (
        <p className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          You haven&rsquo;t applied to any grants yet.{" "}
          <Link to="/grants" className="text-primary hover:underline">
            Browse open grants
          </Link>
          .
        </p>
      )}

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
                  <ApplicationStatusBadge status={application.status} />

                  <h2
                    className="mt-2.5 font-display text-lg font-semibold leading-snug text-foreground transition-colors duration-200 group-hover:text-primary"
                    style={{ fontVariationSettings: '"SOFT" 12' }}
                  >
                    {application.grant.title}
                  </h2>

                  {/*
                    These dates were on the payload all along and nothing
                    displayed them — so a list of applications gave no sense of
                    which had been sitting unanswered for a month.
                  */}
                  <p className="tnum mt-1.5 text-xs text-muted-foreground">
                    {application.grant.funderName}
                    {application.submittedAt && (
                      <> &middot; Submitted {formatDate(application.submittedAt)}</>
                    )}
                    {application.decidedAt && (
                      <> &middot; Decided {formatDate(application.decidedAt)}</>
                    )}
                    {!application.submittedAt && (
                      <> &middot; Draft, started {formatDate(application.createdAt)}</>
                    )}
                  </p>

                  <div className="mt-3.5">
                    <PipelineStrip status={application.status} />
                  </div>
                </div>

                <div className="shrink-0 sm:text-right">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {application.awardedAmountMinor ? "Awarded" : "Requested"}
                  </p>
                  <p
                    className="tnum mt-1 font-grotesk text-xl font-extrabold leading-none text-foreground"
                    style={{ fontStretch: "88%" }}
                  >
                    {formatMoney(
                      application.awardedAmountMinor ??
                        application.requestedAmountMinor,
                      application.currency,
                    )}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
