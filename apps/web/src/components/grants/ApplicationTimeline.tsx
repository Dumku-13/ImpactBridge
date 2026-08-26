import { Check, CircleDashed, X } from "lucide-react";
import {
  APPLICATION_PIPELINE,
  APPLICATION_STATUS_LABELS,
  type ApplicationEvent,
  type ApplicationStatus,
} from "@impactbridge/shared";
import { cn } from "@/lib/utils";

/** "12 Aug 2026, 14:32" — date and time, because order within a day matters. */
function formatMoment(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const TERMINAL: Partial<Record<ApplicationStatus, string>> = {
  REJECTED: "This application was not successful.",
  WITHDRAWN: "This application was withdrawn.",
};

/**
 * The application's real history, not a generic progress bar.
 *
 * Every transition is a row in `ApplicationEvent`, written inside the same
 * transaction as the status change, carrying who made it and when. So each
 * stage here can show an actual timestamp and an actual name — this is the
 * audit trail made visible rather than merely claimed.
 *
 * Stages come from `APPLICATION_PIPELINE` in the shared package — the same list
 * the server's state machine is built from — so the display cannot drift out of
 * step with the workflow it describes.
 */
export function ApplicationTimeline({
  status,
  events,
}: {
  status: ApplicationStatus;
  events: ApplicationEvent[];
}) {
  // First event per stage: a stage can legitimately be re-entered, and the
  // moment it was first reached is the one worth showing.
  const reached = new Map<ApplicationStatus, ApplicationEvent>();
  for (const event of events) {
    if (!reached.has(event.toStatus)) reached.set(event.toStatus, event);
  }

  const terminalNote = TERMINAL[status];
  const terminalEvent = terminalNote ? reached.get(status) : undefined;

  // A terminated application still shows how far it travelled first, so the
  // pipeline is rendered up to wherever it stopped rather than being replaced.
  const currentIndex = terminalNote
    ? APPLICATION_PIPELINE.length
    : APPLICATION_PIPELINE.indexOf(status);

  return (
    <div>
      <ol className="relative">
        {APPLICATION_PIPELINE.map((stage, index) => {
          const event = reached.get(stage);
          const done = event !== undefined || currentIndex > index;
          const current = !terminalNote && currentIndex === index;
          const isLast = index === APPLICATION_PIPELINE.length - 1;

          return (
            <li key={stage} className="relative flex gap-4 pb-7 last:pb-0">
              {/* Connector, drawn behind the marker. */}
              {!isLast && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute left-[13px] top-7 h-[calc(100%-1.75rem)] w-px transition-colors duration-500",
                    done ? "bg-primary/40" : "bg-border",
                  )}
                />
              )}

              <span
                aria-hidden="true"
                className={cn(
                  "relative z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-500 ease-out-soft",
                  done && "border-primary bg-primary text-primary-foreground",
                  current &&
                    "border-primary bg-primary text-primary-foreground ring-4 ring-primary/15",
                  !done && !current && "border-border bg-background text-muted-foreground/60",
                )}
              >
                {done ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <span className="tnum text-[10px] font-bold">{index + 1}</span>
                )}
              </span>

              <div className="min-w-0 flex-1 pt-0.5">
                <p
                  className={cn(
                    "font-display text-base font-semibold leading-tight transition-colors duration-500",
                    done || current ? "text-foreground" : "text-muted-foreground/50",
                  )}
                  style={{ fontVariationSettings: '"SOFT" 12' }}
                >
                  {APPLICATION_STATUS_LABELS[stage]}
                  {current && (
                    <span className="ml-2 align-middle text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                      Now
                    </span>
                  )}
                </p>

                {event ? (
                  <p className="tnum mt-1 text-xs text-muted-foreground">
                    {formatMoment(event.createdAt)}
                    {event.actorName && (
                      <>
                        <span className="mx-1.5 text-border">/</span>
                        {event.actorName}
                      </>
                    )}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground/45">
                    Not yet reached
                  </p>
                )}

                {/* Notes are redacted server-side for viewers who shouldn't see
                    them, so anything present here is safe to show. */}
                {event?.note && (
                  <p className="mt-2 border-l-2 border-border pl-3 text-sm leading-relaxed text-muted-foreground">
                    {event.note}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {terminalNote && (
        <div className="mt-6 flex items-start gap-3 border-t border-destructive/25 pt-5">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            {status === "REJECTED" ? (
              <X className="h-3.5 w-3.5" />
            ) : (
              <CircleDashed className="h-3.5 w-3.5" />
            )}
          </span>
          <div>
            <p className="font-display text-base font-semibold text-foreground">
              {APPLICATION_STATUS_LABELS[status]}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {terminalNote}
            </p>
            {terminalEvent && (
              <p className="tnum mt-1 text-xs text-muted-foreground">
                {formatMoment(terminalEvent.createdAt)}
                {terminalEvent.actorName && (
                  <>
                    <span className="mx-1.5 text-border">/</span>
                    {terminalEvent.actorName}
                  </>
                )}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
