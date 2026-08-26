import { useState } from "react";
import { BadgeCheck, ChevronDown, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * What "verified" actually means on this platform, stated rather than implied.
 *
 * A tick alone is a claim; this is the claim broken into the checks behind it.
 *
 * The list is deliberately short and only asserts what the data supports. The
 * platform records a single verification decision (`verified` + `verifiedAt`)
 * made by an admin after reviewing uploaded legal documents — so these are the
 * steps that decision covers, not four independently-stored flags. Inventing a
 * per-check status would be exactly the kind of hollow detail this panel exists
 * to argue against.
 */
const CHECKS = [
  {
    label: "Registration",
    body: "Legal registration documents submitted and reviewed.",
  },
  {
    label: "Governing documents",
    body: "Trust deed, bylaws or equivalent held on file.",
  },
  {
    label: "Identity",
    body: "The account holder is confirmed to represent the organisation.",
  },
  {
    label: "Platform review",
    body: "Approved by a platform administrator, recorded in the audit log.",
  },
] as const;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function VerificationPanel({
  verified,
  verifiedAt,
}: {
  verified: boolean;
  verifiedAt?: string | null;
}) {
  const [open, setOpen] = useState(false);

  if (!verified) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 shadow-subtle">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          Not yet verified
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          This organisation has not completed platform verification. It can
          still be viewed, but its documents have not been reviewed.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-primary/25 bg-card p-5 shadow-subtle">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">
            Verified organisation
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {verifiedAt
              ? `Checked ${formatDate(verifiedAt)}`
              : "Checked by a platform administrator"}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-out-soft",
            open && "rotate-180",
          )}
        />
      </button>

      {/*
        Grid-rows trick: animates open from zero to content height without
        needing a measured pixel value, and collapses cleanly when the content
        length differs between organisations.
      */}
      <div
        className={cn(
          "grid transition-all duration-300 ease-out-soft",
          open ? "mt-4 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <ol className="space-y-3 border-t border-border pt-4">
            {CHECKS.map((check) => (
              <li key={check.label} className="flex gap-3">
                <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {check.label}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {check.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
