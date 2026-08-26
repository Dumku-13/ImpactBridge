import type { ApplicationStatus, Role } from "@prisma/client";

/**
 * ── The grant application state machine ──────────────────────────────────────
 *
 * Every status change in the platform goes through `assertTransition` below.
 * Keeping the rules as DATA in one table, rather than as `if` statements spread
 * across route handlers, buys three things:
 *
 *   1. The whole workflow is readable in one screen — including, crucially,
 *      which transitions are NOT allowed.
 *   2. The UI cannot invent a transition. A hand-crafted request that tries to
 *      jump SUBMITTED → FUNDS_RELEASED is rejected by the same check that the
 *      buttons go through, because the buttons aren't the enforcement point.
 *   3. Adding a stage means editing one entry, not auditing every handler.
 *
 * The happy path:
 *   DRAFT → SUBMITTED → REVIEW_PENDING → REVIEWER_ASSIGNED → INTERVIEW
 *         → APPROVED → FUNDS_RELEASED → IN_PROGRESS → COMPLETED
 */

/** Who is allowed to perform a transition. */
export type Actor = "NGO" | "FUNDER";

interface TransitionRule {
  to: ApplicationStatus;
  /** Roles permitted to make this move. */
  by: Actor[];
  /** Shown in the audit trail and the UI's confirmation copy. */
  label: string;
}

/**
 * Allowed moves, keyed by current status.
 *
 * A status absent from a list is unreachable from that state — that absence is
 * the security control, so read these as a whitelist, never a suggestion.
 */
const TRANSITIONS: Record<ApplicationStatus, TransitionRule[]> = {
  DRAFT: [
    { to: "SUBMITTED", by: ["NGO"], label: "Submit application" },
    { to: "WITHDRAWN", by: ["NGO"], label: "Discard" },
  ],

  SUBMITTED: [
    { to: "REVIEW_PENDING", by: ["FUNDER"], label: "Begin review" },
    { to: "REJECTED", by: ["FUNDER"], label: "Reject" },
    { to: "WITHDRAWN", by: ["NGO"], label: "Withdraw" },
  ],

  REVIEW_PENDING: [
    { to: "REVIEWER_ASSIGNED", by: ["FUNDER"], label: "Assign reviewer" },
    { to: "REJECTED", by: ["FUNDER"], label: "Reject" },
    { to: "WITHDRAWN", by: ["NGO"], label: "Withdraw" },
  ],

  REVIEWER_ASSIGNED: [
    { to: "INTERVIEW", by: ["FUNDER"], label: "Invite to interview" },
    // A funder may skip the interview when the proposal is clear enough.
    { to: "APPROVED", by: ["FUNDER"], label: "Approve" },
    { to: "REJECTED", by: ["FUNDER"], label: "Reject" },
    { to: "WITHDRAWN", by: ["NGO"], label: "Withdraw" },
  ],

  INTERVIEW: [
    { to: "APPROVED", by: ["FUNDER"], label: "Approve" },
    { to: "REJECTED", by: ["FUNDER"], label: "Reject" },
    { to: "WITHDRAWN", by: ["NGO"], label: "Withdraw" },
  ],

  /*
   * Past APPROVED an NGO can no longer withdraw: money has been committed, and
   * unwinding that is a funder decision with a ledger consequence, not a
   * self-service action.
   */
  APPROVED: [
    { to: "FUNDS_RELEASED", by: ["FUNDER"], label: "Release funds" },
    /*
     * The funder can still pull out before the money moves — fraud surfaces,
     * a budget is cut, the NGO goes quiet. Without this the only legal move
     * from APPROVED is releasing funds they no longer want to release, or
     * leaving the application stuck forever.
     *
     * Deliberately funder-only and deliberately pre-release: rescinding is
     * free here because nothing has been disbursed, whereas clawing back a
     * released grant is a different problem with a ledger consequence.
     * Rescinding returns the committed amount to the grant's pot, since only
     * live commitments count toward it.
     */
    { to: "REJECTED", by: ["FUNDER"], label: "Rescind approval" },
  ],

  FUNDS_RELEASED: [
    { to: "IN_PROGRESS", by: ["NGO"], label: "Start work" },
  ],

  IN_PROGRESS: [
    { to: "COMPLETED", by: ["FUNDER"], label: "Mark complete" },
  ],

  // Terminal states. Empty lists are deliberate, not unfinished.
  COMPLETED: [],
  REJECTED: [],
  WITHDRAWN: [],
};

/** Statuses an applicant NGO may not see in a funder's queue view. */
export const FUNDER_VISIBLE_STATUSES: ApplicationStatus[] = [
  "SUBMITTED",
  "REVIEW_PENDING",
  "REVIEWER_ASSIGNED",
  "INTERVIEW",
  "APPROVED",
  "FUNDS_RELEASED",
  "IN_PROGRESS",
  "COMPLETED",
  "REJECTED",
  "WITHDRAWN",
];

/** True once a decision has been made and the application cannot be edited. */
export function isDecided(status: ApplicationStatus): boolean {
  return (
    status === "APPROVED" ||
    status === "REJECTED" ||
    status === "WITHDRAWN" ||
    status === "FUNDS_RELEASED" ||
    status === "IN_PROGRESS" ||
    status === "COMPLETED"
  );
}

/** Map a platform role onto a workflow actor. */
export function actorForRole(role: Role): Actor | null {
  if (role === "NGO_ADMIN") return "NGO";
  if (role === "FUNDER") return "FUNDER";
  // Platform admins observe the workflow; they don't drive applications.
  return null;
}

/** Transitions this actor could legally make right now — drives the UI. */
export function availableTransitions(
  from: ApplicationStatus,
  actor: Actor,
): TransitionRule[] {
  return TRANSITIONS[from].filter((rule) => rule.by.includes(actor));
}

export interface TransitionError {
  status: number;
  message: string;
}

/**
 * Validate a requested transition.
 *
 * Returns null when allowed, or an error describing why not. It returns rather
 * than throws so callers can attach their own context, and so the distinction
 * between "impossible move" (409) and "not your move" (403) survives — an NGO
 * being told "only the funder can approve" is far more useful than a blanket
 * "forbidden".
 */
export function checkTransition(
  from: ApplicationStatus,
  to: ApplicationStatus,
  actor: Actor,
): TransitionError | null {
  const rule = TRANSITIONS[from].find((candidate) => candidate.to === to);

  if (!rule) {
    const legal = TRANSITIONS[from].map((r) => r.to);

    return {
      status: 409,
      message:
        legal.length === 0
          ? `This application is ${from.toLowerCase().replace(/_/g, " ")} and can no longer change.`
          : `An application cannot go from ${from} to ${to}.`,
    };
  }

  if (!rule.by.includes(actor)) {
    const who = rule.by.join(" or ").toLowerCase();

    return {
      status: 403,
      message: `Only the ${who} can ${rule.label.toLowerCase()}.`,
    };
  }

  return null;
}
