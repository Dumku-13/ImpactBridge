import { Check, X } from "lucide-react";
import {
  APPLICATION_PIPELINE,
  APPLICATION_STATUS_LABELS,
  type ApplicationStatus,
} from "@impactbridge/shared";
import { cn } from "@/lib/utils";

/** Colour treatment per stage, reused by the badge and the tracker. */
function statusTone(status: ApplicationStatus): string {
  if (status === "REJECTED" || status === "WITHDRAWN")
    return "bg-destructive/10 text-destructive";
  if (status === "COMPLETED") return "bg-primary/10 text-primary";
  if (status === "DRAFT") return "bg-secondary text-muted-foreground";
  return "bg-primary/10 text-primary";
}

export function ApplicationStatusBadge({
  status,
}: {
  status: ApplicationStatus;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        statusTone(status),
      )}
    >
      {APPLICATION_STATUS_LABELS[status]}
    </span>
  );
}

/**
 * Visual walk through the grant pipeline.
 *
 * The stages come from APPLICATION_PIPELINE in the shared package — the same
 * list the server's state machine is built from — so the tracker can't drift
 * out of step with the workflow it is describing.
 */
export function ApplicationPipeline({
  status,
}: {
  status: ApplicationStatus;
}) {
  // Terminal failures don't sit on the happy path, so they get their own row.
  if (status === "REJECTED" || status === "WITHDRAWN") {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
        <X className="h-4 w-4" />
        {status === "REJECTED"
          ? "This application was not successful."
          : "This application was withdrawn."}
      </div>
    );
  }

  const currentIndex = APPLICATION_PIPELINE.indexOf(status);

  return (
    <ol className="flex flex-wrap gap-y-3">
      {APPLICATION_PIPELINE.map((stage, index) => {
        const done = currentIndex > index;
        const current = currentIndex === index;

        return (
          <li key={stage} className="flex flex-1 items-center gap-2">
            <div className="flex flex-col items-center gap-1">
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold transition-colors",
                  done && "bg-primary text-primary-foreground",
                  current && "bg-primary text-primary-foreground ring-4 ring-primary/20",
                  !done && !current && "bg-secondary text-muted-foreground",
                )}
              >
                {done ? <Check className="h-3 w-3" /> : index + 1}
              </span>
            </div>

            <span
              className={cn(
                "text-[11px] leading-tight",
                current ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {APPLICATION_STATUS_LABELS[stage]}
            </span>

            {index < APPLICATION_PIPELINE.length - 1 && (
              <span
                className={cn(
                  "mx-1 hidden h-px flex-1 sm:block",
                  done ? "bg-primary" : "bg-border",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
