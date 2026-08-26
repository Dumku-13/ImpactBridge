import { useState } from "react";
import { ArrowRight, Route } from "lucide-react";
import {
  formatMoney,
  type ApplicationDetail,
} from "@impactbridge/shared";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";

function moment(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface Node {
  label: string;
  value: string;
  meta?: string;
  detail?: string;
}

/**
 * Follow one award from the grant it came from to the money actually spent.
 *
 * Every node here is a row that exists in the database — the award amount, the
 * `FUNDS_RELEASED` event with its actor and timestamp, the Project that
 * transition opened, and each Report's `spentMinor`. Nothing is modelled or
 * estimated.
 *
 * That constraint is the point. The obvious version of this feature is a
 * treemap splitting an award into invented categories ("₹12L education, ₹7L
 * infrastructure") — but no such allocation is recorded anywhere, so it would
 * be a drawing of numbers that do not exist. The honest chain is more
 * persuasive anyway: it demonstrates auditability instead of asserting it.
 */
export function TraceFunding({ application }: { application: ApplicationDetail }) {
  const [open, setOpen] = useState(false);

  const project = application.project;
  const awarded = application.awardedAmountMinor;

  // Only meaningful once money has actually moved and a project exists.
  if (!project || awarded === null) return null;

  const released = application.events.find((e) => e.toStatus === "FUNDS_RELEASED");
  const reports = project.reports ?? [];
  const reported = reports.filter((r) => r.spentMinor !== null);
  const spent = reported.reduce((sum, r) => sum + (r.spentMinor ?? 0), 0);

  const nodes: Node[] = [
    {
      label: "Grant",
      value: application.grant.title,
      meta: `Offered by ${application.grant.funderName}`,
    },
    {
      label: "Requested",
      value: formatMoney(application.requestedAmountMinor, application.currency),
      meta: application.submittedAt
        ? `Applied ${moment(application.submittedAt)}`
        : undefined,
    },
    {
      label: "Awarded",
      value: formatMoney(awarded, application.currency),
      meta: application.decidedAt
        ? `Decided ${moment(application.decidedAt)}`
        : undefined,
      detail:
        awarded < application.requestedAmountMinor
          ? "A partial award — the funder granted less than was requested."
          : undefined,
    },
    {
      label: "Funds released",
      value: formatMoney(awarded, application.currency),
      meta: released
        ? `${moment(released.createdAt)}${released.actorName ? ` / ${released.actorName}` : ""}`
        : "Release recorded",
    },
    {
      label: "Project",
      value: project.title,
      meta: `Started ${moment(project.startedAt)}${project.endedAt ? ` / ended ${moment(project.endedAt)}` : ""}`,
    },
    {
      label: "Reported spend",
      value: formatMoney(spent, application.currency),
      meta:
        reported.length > 0
          ? `Across ${reported.length} ${reported.length === 1 ? "report" : "reports"}`
          : "No spend reported yet",
    },
  ];

  const remaining = awarded - spent;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group inline-flex items-center gap-2 text-sm font-semibold text-foreground transition-colors duration-200 hover:text-primary"
      >
        <Route className="h-4 w-4 text-primary" />
        Trace this funding
        <ArrowRight className="h-4 w-4 transition-transform duration-200 ease-out-soft group-hover:translate-x-0.5" />
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Trace this funding"
        className="max-w-2xl overflow-y-auto sm:max-h-[85vh]"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Trace this funding
        </p>
        <h2
          className="mt-3 font-display text-2xl font-semibold leading-tight text-foreground"
          style={{ fontVariationSettings: '"SOFT" 12' }}
        >
          {application.organization.name}
        </h2>

        <ol className="mt-8">
          {nodes.map((node, i) => {
            const isLast = i === nodes.length - 1;
            return (
              <li key={node.label} className="relative flex gap-4 pb-6 last:pb-0">
                {!isLast && (
                  <span
                    aria-hidden="true"
                    className="absolute left-[11px] top-6 h-[calc(100%-1.5rem)] w-px bg-primary/30"
                  />
                )}
                <span
                  aria-hidden="true"
                  className={cn(
                    "relative z-10 mt-1 h-[23px] w-[23px] shrink-0 rounded-full border-2",
                    isLast
                      ? "border-accent bg-accent"
                      : "border-primary bg-primary",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {node.label}
                  </p>
                  <p className="tnum mt-1 break-words font-grotesk text-xl font-extrabold leading-tight text-foreground">
                    {node.value}
                  </p>
                  {node.meta && (
                    <p className="tnum mt-1 text-xs text-muted-foreground">
                      {node.meta}
                    </p>
                  )}
                  {node.detail && (
                    <p className="mt-2 border-l-2 border-border pl-3 text-sm leading-relaxed text-muted-foreground">
                      {node.detail}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        {/* Reconciliation, stated plainly rather than hidden. */}
        <div className="mt-6 border-t border-border pt-5">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Unreported
            </span>
            <span className="tnum text-sm font-semibold text-foreground">
              {formatMoney(Math.max(remaining, 0), application.currency)}
            </span>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Spend is whatever the nonprofit has reported so far, not an
            independent audit. Unreported simply means no report accounts for it
            yet — it does not imply the money is missing.
          </p>
        </div>
      </Dialog>
    </>
  );
}
