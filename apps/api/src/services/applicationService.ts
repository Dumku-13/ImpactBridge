import type { Prisma, Role } from "@prisma/client";
import type {
  CreateCommentInput,
  CreateReportInput,
  TransitionInput,
  UpsertApplicationInput,
  UpsertReviewInput,
} from "@impactbridge/shared";
import { proposalSchema } from "@impactbridge/shared";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/errorHandler.js";
import { notify } from "./notificationService.js";
import {
  actorForRole,
  availableTransitions,
  checkTransition,
} from "./grantWorkflow.js";

/**
 * Grant applications: the NGO side (apply, track) and the funder side (review,
 * decide, release funds).
 *
 * Every status change routes through `transitionApplication`, which is the only
 * function here that writes `status`. That single choke point is what makes the
 * state machine meaningful — if other functions could set status directly, the
 * rules in grantWorkflow.ts would be advisory rather than enforced.
 */

/** The NGO admin's own organisation, or 404. */
async function requireOwnedOrganization(userId: string) {
  const organization = await prisma.organization.findUnique({
    where: { ownerId: userId },
    select: {
      id: true,
      verified: true,
      foundedYear: true,
      state: true,
      name: true,
      status: true,
    },
  });

  if (!organization) {
    throw new HttpError(404, "You don't have an organisation profile yet.");
  }

  // A suspended organisation must not be able to apply for grants or move an
  // existing application forward — the same gate ngoService applies, repeated
  // here because this file resolves ownership independently.
  if (organization.status === "SUSPENDED") {
    throw new HttpError(
      403,
      "Your organisation has been suspended. Contact support.",
    );
  }

  return organization;
}

const cardInclude = {
  grant: {
    select: {
      id: true,
      slug: true,
      title: true,
      deadline: true,
      currency: true,
      funder: { select: { name: true } },
    },
  },
  organization: {
    select: {
      id: true,
      slug: true,
      name: true,
      logoUrl: true,
      verified: true,
      city: true,
      state: true,
      totalRaisedMinor: true,
      foundedYear: true,
    },
  },
  reviews: { select: { score: true } },
} satisfies Prisma.GrantApplicationInclude;

type CardRow = Prisma.GrantApplicationGetPayload<{ include: typeof cardInclude }>;

/**
 * `canSeeScores` is REQUIRED rather than defaulted, deliberately.
 *
 * Reviewer scores are confidential funder deliberation. A default would let a
 * new call site leak them by simply forgetting the argument — which is exactly
 * how the applicant's own dashboard started returning them. Making it explicit
 * forces every caller to state who is looking.
 */
function toCard(row: CardRow, canSeeScores: boolean) {
  const scores = canSeeScores ? row.reviews.map((r) => r.score) : [];

  return {
    id: row.id,
    status: row.status,
    requestedAmountMinor: row.requestedAmountMinor,
    awardedAmountMinor: row.awardedAmountMinor,
    currency: row.grant.currency,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    grant: {
      id: row.grant.id,
      slug: row.grant.slug,
      title: row.grant.title,
      deadline: row.grant.deadline.toISOString(),
      funderName: row.grant.funder.name,
    },
    organization: row.organization,
    averageScore:
      scores.length > 0
        ? Math.round(
            (scores.reduce((a, b) => a + b, 0) / scores.length) * 10,
          ) / 10
        : null,
    reviewCount: scores.length,
  };
}

/* ── Applying (NGO) ───────────────────────────────────────────────────────── */

/**
 * Check the grant's eligibility rules against this organisation.
 *
 * Enforced server-side at apply time, not merely displayed on the grant page —
 * the rendered rules are guidance, this is the gate.
 */
function assertEligible(
  eligibility: unknown,
  organization: {
    verified: boolean;
    foundedYear: number | null;
    state: string | null;
  },
): void {
  if (!eligibility || typeof eligibility !== "object") return;

  const rules = eligibility as {
    verifiedOnly?: boolean;
    minYearsActive?: number;
    states?: string[];
  };

  if (rules.verifiedOnly && !organization.verified) {
    throw new HttpError(
      403,
      "This grant is only open to verified organisations.",
    );
  }

  if (rules.minYearsActive && rules.minYearsActive > 0) {
    const years = organization.foundedYear
      ? new Date().getFullYear() - organization.foundedYear
      : 0;

    if (years < rules.minYearsActive) {
      throw new HttpError(
        403,
        `This grant requires at least ${rules.minYearsActive} years of operating history.`,
      );
    }
  }

  if (rules.states && rules.states.length > 0) {
    if (!organization.state || !rules.states.includes(organization.state)) {
      throw new HttpError(
        403,
        `This grant is limited to organisations in: ${rules.states.join(", ")}.`,
      );
    }
  }
}

export async function createApplication(
  userId: string,
  grantId: string,
  input: UpsertApplicationInput,
) {
  const organization = await requireOwnedOrganization(userId);

  const grant = await prisma.grant.findUnique({
    where: { id: grantId },
    select: {
      id: true,
      status: true,
      deadline: true,
      maxAwardMinor: true,
      amountMinor: true,
      eligibility: true,
    },
  });

  if (!grant || grant.status !== "OPEN") {
    throw new HttpError(404, "This grant is not accepting applications.");
  }

  if (grant.deadline.getTime() < Date.now()) {
    throw new HttpError(409, "The deadline for this grant has passed.");
  }

  assertEligible(grant.eligibility, organization);

  const cap = grant.maxAwardMinor ?? grant.amountMinor;

  if (input.requestedAmountMinor > cap) {
    throw new HttpError(
      400,
      `The most you can request from this grant is ${cap / 100} rupees.`,
    );
  }

  /*
   * @@unique([grantId, organizationId]) means a double-submit hits the database
   * constraint rather than creating a second application. Catching it here
   * turns a 500 into a clear message.
   */
  const existing = await prisma.grantApplication.findUnique({
    where: {
      grantId_organizationId: { grantId, organizationId: organization.id },
    },
    select: { id: true },
  });

  if (existing) {
    throw new HttpError(
      409,
      "Your organisation has already applied to this grant.",
    );
  }

  const application = await prisma.grantApplication.create({
    data: {
      grantId,
      organizationId: organization.id,
      requestedAmountMinor: input.requestedAmountMinor,
      proposal: input.proposal,
      status: "DRAFT",
    },
    include: cardInclude,
  });

  // The applicant, so no scores.
  return toCard(application, false);
}

/** Edit a draft. Locked the moment it is submitted. */
export async function updateApplication(
  userId: string,
  applicationId: string,
  input: UpsertApplicationInput,
) {
  const organization = await requireOwnedOrganization(userId);

  const existing = await prisma.grantApplication.findFirst({
    where: { id: applicationId, organizationId: organization.id },
    select: { id: true, status: true },
  });

  if (!existing) throw new HttpError(404, "Application not found");

  if (existing.status !== "DRAFT") {
    throw new HttpError(
      409,
      "A submitted application can no longer be edited.",
    );
  }

  const updated = await prisma.grantApplication.update({
    where: { id: applicationId },
    data: {
      requestedAmountMinor: input.requestedAmountMinor,
      proposal: input.proposal,
    },
    include: cardInclude,
  });

  return toCard(updated, false);
}

/** Every application this NGO has made. */
export async function listMyApplications(userId: string) {
  const organization = await requireOwnedOrganization(userId);

  const rows = await prisma.grantApplication.findMany({
    where: { organizationId: organization.id },
    orderBy: { createdAt: "desc" },
    include: cardInclude,
  });

  // The applicant's own list — reviewer scores stay on the funder side.
  return rows.map((row) => toCard(row, false));
}

/** Applicants to one of the funder's own grants. */
export async function listGrantApplications(
  funderId: string,
  grantId: string,
) {
  const grant = await prisma.grant.findFirst({
    where: { id: grantId, funderId },
    select: { id: true },
  });

  if (!grant) throw new HttpError(404, "Grant not found");

  const rows = await prisma.grantApplication.findMany({
    where: {
      grantId,
      // A funder never sees an NGO's unsubmitted draft.
      status: { not: "DRAFT" },
    },
    orderBy: [{ status: "asc" }, { submittedAt: "asc" }],
    include: cardInclude,
  });

  return rows.map((row) => toCard(row, true));
}

/* ── Detail, with role-scoped visibility ──────────────────────────────────── */

/**
 * Load an application, enforcing who may see it.
 *
 * Access is resolved from the data (does this user own the applying
 * organisation, or the grant?) rather than from a role claim alone, so a FUNDER
 * cannot read applications to somebody else's grant.
 */
export async function getApplication(
  userId: string,
  role: Role,
  applicationId: string,
) {
  const row = await prisma.grantApplication.findUnique({
    where: { id: applicationId },
    include: {
      ...cardInclude,
      grant: {
        select: {
          id: true,
          slug: true,
          title: true,
          deadline: true,
          currency: true,
          questions: true,
          funderId: true,
          funder: { select: { name: true } },
        },
      },
      reviewer: { select: { id: true, name: true } },
      reviews: {
        orderBy: { createdAt: "desc" },
        include: { reviewer: { select: { name: true } } },
      },
      comments: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { name: true } } },
      },
      events: {
        orderBy: { createdAt: "asc" },
        include: { actor: { select: { name: true } } },
      },
      project: { include: { reports: { orderBy: { createdAt: "desc" } } } },
    },
  });

  if (!row) throw new HttpError(404, "Application not found");

  const organization = await prisma.organization.findUnique({
    where: { ownerId: userId },
    select: { id: true },
  });

  const isApplicant = organization?.id === row.organizationId;
  const isFunder = row.grant.funderId === userId;
  const isAdmin = role === "PLATFORM_ADMIN";

  if (!isApplicant && !isFunder && !isAdmin) {
    // 404 rather than 403 — we don't confirm the application exists.
    throw new HttpError(404, "Application not found");
  }

  const actor = actorForRole(role);

  /*
   * The applicant must not see internal funder discussion, or reviewer scores
   * that were never shared with them. Filtering here rather than in the UI is
   * the same rule as donor anonymity: what is never sent cannot leak.
   */
  const visibleComments = row.comments.filter(
    (comment) => isFunder || isAdmin || !comment.internal,
  );

  const visibleReviews = isFunder || isAdmin ? row.reviews : [];

  // One name for "is this person on the funder side", used for every gate
  // below so they cannot drift apart.
  const canSeeDeliberation = isFunder || isAdmin;

  return {
    ...toCard({ ...row, reviews: row.reviews } as CardRow, canSeeDeliberation),
    proposal: proposalSchema.safeParse(row.proposal).data ?? null,
    questions: Array.isArray(row.grant.questions)
      ? (row.grant.questions as string[])
      : [],
    /*
     * Who is judging you is deliberation, not decision. Telling an applicant
     * the assigned reviewer's name and user id would undo the same anonymity
     * the reviews and internal comments below are filtered to protect.
     */
    reviewerId: canSeeDeliberation ? row.reviewerId : null,
    reviewerName: canSeeDeliberation ? (row.reviewer?.name ?? null) : null,
    reviews: visibleReviews.map((review) => ({
      id: review.id,
      score: review.score,
      strengths: review.strengths,
      concerns: review.concerns,
      recommend: review.recommend,
      reviewerName: review.reviewer.name,
      createdAt: review.createdAt.toISOString(),
    })),
    comments: visibleComments.map((comment) => ({
      id: comment.id,
      body: comment.body,
      internal: comment.internal,
      authorName: comment.author.name,
      createdAt: comment.createdAt.toISOString(),
    })),
    events: row.events.map((event) => ({
      id: event.id,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      /*
       * The status change is always visible — an applicant must be able to see
       * they were rejected. The funder's NOTE is not: the UI asks "why are you
       * making this decision?", which invites candid internal reasoning.
       */
      note: event.noteInternal && !canSeeDeliberation ? null : event.note,
      actorName: event.actor?.name ?? null,
      createdAt: event.createdAt.toISOString(),
    })),
    project: row.project
      ? {
          id: row.project.id,
          title: row.project.title,
          description: row.project.description,
          startedAt: row.project.startedAt.toISOString(),
          endedAt: row.project.endedAt?.toISOString() ?? null,
          reports: row.project.reports.map((report) => ({
            id: report.id,
            type: report.type,
            title: report.title,
            body: report.body,
            spentMinor: report.spentMinor,
            mediaUrls: Array.isArray(report.mediaUrls)
              ? (report.mediaUrls as string[])
              : [],
            createdAt: report.createdAt.toISOString(),
          })),
        }
      : null,
    /*
     * The server tells the client which moves are legal, so the UI renders
     * buttons from the state machine instead of maintaining its own copy of the
     * rules that could drift out of sync.
     */
    availableTransitions:
      actor && (isApplicant || isFunder)
        ? availableTransitions(row.status, actor)
            // An NGO's options apply only to their own application, and a
            // funder's only to grants they own.
            .filter((rule) =>
              rule.by.includes("NGO") ? isApplicant : isFunder,
            )
            .map((rule) => ({ to: rule.to, label: rule.label }))
        : [],
  };
}

/* ── The single choke point for status changes ────────────────────────────── */

export async function transitionApplication(
  userId: string,
  role: Role,
  applicationId: string,
  input: TransitionInput,
) {
  const actor = actorForRole(role);

  if (!actor) {
    throw new HttpError(403, "Your role cannot act on applications.");
  }

  const application = await prisma.grantApplication.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      status: true,
      organizationId: true,
      requestedAmountMinor: true,
      awardedAmountMinor: true,
      grant: {
        select: {
          id: true,
          funderId: true,
          title: true,
          maxAwardMinor: true,
          amountMinor: true,
          // Needed to re-check the window at submit time, and to record the
          // ledger row in the grant's own currency rather than a hardcoded one.
          deadline: true,
          status: true,
          currency: true,
        },
      },
      organization: { select: { id: true, name: true } },
    },
  });

  if (!application) throw new HttpError(404, "Application not found");

  const organization = await prisma.organization.findUnique({
    where: { ownerId: userId },
    select: { id: true },
  });

  const isApplicant = organization?.id === application.organizationId;
  const isFunder = application.grant.funderId === userId;

  if (!isApplicant && !isFunder) {
    throw new HttpError(404, "Application not found");
  }

  // The actor claimed by the role must match the actor they actually are here.
  if (actor === "NGO" && !isApplicant) {
    throw new HttpError(404, "Application not found");
  }
  if (actor === "FUNDER" && !isFunder) {
    throw new HttpError(404, "Application not found");
  }

  // ── The state machine decides, not the caller ──
  const problem = checkTransition(application.status, input.toStatus, actor);

  if (problem) {
    throw new HttpError(problem.status, problem.message);
  }

  /*
   * Submitting re-checks the window. createApplication validates the deadline,
   * but a DRAFT can sit for weeks — without this an NGO could draft before the
   * deadline and submit long after it, or after the funder closed the grant,
   * and still land in the review queue as though it arrived on time.
   */
  if (input.toStatus === "SUBMITTED") {
    if (application.grant.status !== "OPEN") {
      throw new HttpError(409, "This grant is no longer accepting applications.");
    }

    if (application.grant.deadline.getTime() < Date.now()) {
      throw new HttpError(409, "The deadline for this grant has passed.");
    }
  }

  // Destination-specific requirements.
  let awardedAmountMinor = application.awardedAmountMinor;

  if (input.toStatus === "APPROVED") {
    const amount = input.awardedAmountMinor ?? application.requestedAmountMinor;
    const cap =
      application.grant.maxAwardMinor ?? application.grant.amountMinor;

    if (amount > cap) {
      throw new HttpError(
        400,
        "The award cannot exceed this grant's per-award cap.",
      );
    }

    /*
     * The per-award cap alone does not protect the pot. With no maxAward the
     * cap IS the whole fund, so approving five applicants for the full amount
     * each would pass five times over and disburse five times the money the
     * funder actually posted. Committed awards must be summed and checked
     * against what is left.
     */
    const committed = await prisma.grantApplication.aggregate({
      where: {
        grantId: application.grant.id,
        id: { not: application.id },
        // Only live commitments count — a rejected or withdrawn application
        // releases its money back into the pot.
        status: {
          in: ["APPROVED", "FUNDS_RELEASED", "IN_PROGRESS", "COMPLETED"],
        },
      },
      _sum: { awardedAmountMinor: true },
    });

    const alreadyCommitted = committed._sum.awardedAmountMinor ?? 0;
    const remaining = application.grant.amountMinor - alreadyCommitted;

    if (amount > remaining) {
      throw new HttpError(
        400,
        `Only ${Math.max(0, remaining) / 100} of this grant's fund is left to award.`,
      );
    }

    awardedAmountMinor = amount;
  }

  /*
   * `input.reviewerId` is optional AND can arrive as "". An empty string is
   * falsy, so a bare truthiness check would skip validation and then persist ""
   * as a foreign key — a constraint violation surfacing as a 500 instead of a
   * clear 400. Normalise to undefined once, here.
   */
  const reviewerId = input.reviewerId?.trim() || undefined;

  if (input.toStatus === "REVIEWER_ASSIGNED" && reviewerId) {
    const reviewer = await prisma.user.findFirst({
      where: { id: reviewerId, role: { in: ["FUNDER", "PLATFORM_ADMIN"] } },
      select: { id: true },
    });

    if (!reviewer) throw new HttpError(400, "That reviewer doesn't exist.");
  }

  const now = new Date();

  /*
   * The status change, its audit event, and any money movement all land in ONE
   * transaction. A released grant that didn't write its ledger row — or a ledger
   * row without the status to match — would be exactly the kind of silent
   * inconsistency this project is built to avoid.
   */
  const updated = await prisma.$transaction(async (tx) => {
    /*
     * ── Optimistic concurrency ────────────────────────────────────────────
     *
     * The status was read, and the transition validated, BEFORE this
     * transaction opened. Writing unconditionally would let two legal-looking
     * moves race: from REVIEWER_ASSIGNED a funder can both reject and approve,
     * so a double-click could have the reject commit first and the approve
     * then overwrite it — resurrecting a rejected application WITH an award
     * amount, and leaving an audit trail that claims both came from
     * REVIEWER_ASSIGNED.
     *
     * Matching on the status we validated against makes the write fail
     * closed instead: whoever lands second updates zero rows and is told to
     * retry against the new state.
     */
    const claimed = await tx.grantApplication.updateMany({
      where: { id: application.id, status: application.status },
      data: {
        status: input.toStatus,
        awardedAmountMinor,
        reviewerId:
          input.toStatus === "REVIEWER_ASSIGNED"
            ? (reviewerId ?? userId)
            : undefined,
        submittedAt:
          input.toStatus === "SUBMITTED" ? now : undefined,
        decidedAt:
          input.toStatus === "APPROVED" || input.toStatus === "REJECTED"
            ? now
            : undefined,
      },
    });

    if (claimed.count !== 1) {
      throw new HttpError(
        409,
        "This application was just updated by someone else. Reload and try again.",
      );
    }

    const result = await tx.grantApplication.findUniqueOrThrow({
      where: { id: application.id },
      include: cardInclude,
    });

    await tx.applicationEvent.create({
      data: {
        applicationId: application.id,
        actorId: userId,
        fromStatus: application.status,
        toStatus: input.toStatus,
        note: input.note?.trim() || null,
        /*
         * A funder's note is private by default. The UI prompts "why are you
         * making this decision?", which invites candid internal reasoning — an
         * applicant should not receive that verbatim. An NGO's own note (e.g.
         * a withdrawal reason) is addressed to the funder, so it is shared.
         */
        noteInternal: actor === "FUNDER",
      },
    });

    /*
     * Approval COMMITS money; release MOVES it. Both belong in the ledger, and
     * they are different rows on purpose:
     *
     *   GRANT_ALLOCATION — the funder has awarded this amount. It is spoken
     *     for and no longer available to other applicants (the remaining-pot
     *     check counts live commitments, not disbursements), but nothing has
     *     been paid.
     *   GRANT_RELEASE   — the money has actually left the grant.
     *
     * Until now only the release was recorded, which meant the gap between a
     * decision and a disbursement — the period an applicant cares about most —
     * left no financial trace at all. Admin revenue reporting reads
     * GRANT_RELEASE specifically, so adding this row cannot double-count.
     */
    if (input.toStatus === "APPROVED") {
      await tx.transaction.create({
        data: {
          type: "GRANT_ALLOCATION",
          amountMinor: awardedAmountMinor ?? application.requestedAmountMinor,
          currency: application.grant.currency,
          organizationId: application.organizationId,
          description: `Grant awarded — ${application.grant.title}`,
        },
      });
    }

    // Releasing funds writes the ledger entry and opens the project.
    if (input.toStatus === "FUNDS_RELEASED") {
      const amount = awardedAmountMinor ?? application.requestedAmountMinor;

      await tx.transaction.create({
        data: {
          type: "GRANT_RELEASE",
          amountMinor: amount,
          // The grant's own currency, not a hardcoded one — every grant is INR
          // today, but a literal here would silently mislabel the ledger the
          // moment that stops being true.
          currency: application.grant.currency,
          organizationId: application.organizationId,
          description: `Grant released — ${application.grant.title}`,
        },
      });

      await tx.project.create({
        data: {
          applicationId: application.id,
          organizationId: application.organizationId,
          title: application.grant.title,
          description: `Funded by ${application.grant.title}.`,
        },
      });
    }

    /*
     * Tell whichever side DIDN'T make the move. Inside the transaction, so a
     * rollback takes the notification with it — nobody is told about a decision
     * that never landed.
     */
    if (actor === "FUNDER") {
      const owner = await tx.organization.findUnique({
        where: { id: application.organizationId },
        select: { ownerId: true },
      });

      if (owner) {
        await notify(
          {
            userId: owner.ownerId,
            type: "APPLICATION_STATUS_CHANGED",
            title: `Application ${input.toStatus.toLowerCase().replace(/_/g, " ")}`,
            body: `${application.grant.title} — your application moved to ${input.toStatus.toLowerCase().replace(/_/g, " ")}.`,
            link: `/applications/${application.id}`,
          },
          tx,
        );
      }
    } else {
      await notify(
        {
          userId: application.grant.funderId,
          type:
            input.toStatus === "SUBMITTED"
              ? "APPLICATION_SUBMITTED"
              : "APPLICATION_STATUS_CHANGED",
          title:
            input.toStatus === "SUBMITTED"
              ? "New grant application"
              : "Applicant update",
          body: `${application.organization.name} — ${application.grant.title}`,
          link: `/applications/${application.id}`,
        },
        tx,
      );
    }

    return result;
  });

  // Whoever just moved it gets the card back — only the funder may see scores.
  return toCard(updated, actor === "FUNDER");
}

/**
 * Everyone a funder may hand a review to.
 *
 * The same two roles the transition validates against, so the picker cannot
 * offer a person the server would then refuse — a dropdown whose options are
 * rejected on submit is worse than no dropdown.
 *
 * Suspended accounts are excluded: assigning work to someone who cannot sign in
 * parks an application in REVIEWER_ASSIGNED with nobody able to move it on.
 */
export async function listReviewers() {
  const reviewers = await prisma.user.findMany({
    where: {
      role: { in: ["FUNDER", "PLATFORM_ADMIN"] },
      status: "ACTIVE",
    },
    // Names only. This is a user directory, and it is exposed to every funder.
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });

  return reviewers;
}

/* ── Reviews and comments (funder side) ───────────────────────────────────── */

/** Confirm this user funds the grant behind the application. */
async function requireFunderOfApplication(userId: string, applicationId: string) {
  const application = await prisma.grantApplication.findUnique({
    where: { id: applicationId },
    select: { id: true, status: true, grant: { select: { funderId: true } } },
  });

  if (!application || application.grant.funderId !== userId) {
    throw new HttpError(404, "Application not found");
  }

  return application;
}

/** Create or replace this reviewer's assessment. */
export async function upsertReview(
  userId: string,
  applicationId: string,
  input: UpsertReviewInput,
) {
  await requireFunderOfApplication(userId, applicationId);

  const review = await prisma.review.upsert({
    where: {
      applicationId_reviewerId: { applicationId, reviewerId: userId },
    },
    create: {
      applicationId,
      reviewerId: userId,
      score: input.score,
      strengths: input.strengths?.trim() || null,
      concerns: input.concerns?.trim() || null,
      recommend: input.recommend,
    },
    update: {
      score: input.score,
      strengths: input.strengths?.trim() || null,
      concerns: input.concerns?.trim() || null,
      recommend: input.recommend,
    },
    include: { reviewer: { select: { name: true } } },
  });

  return {
    id: review.id,
    score: review.score,
    strengths: review.strengths,
    concerns: review.concerns,
    recommend: review.recommend,
    reviewerName: review.reviewer.name,
    createdAt: review.createdAt.toISOString(),
  };
}

export async function addComment(
  userId: string,
  applicationId: string,
  input: CreateCommentInput,
) {
  const application = await prisma.grantApplication.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      organizationId: true,
      grant: { select: { funderId: true } },
    },
  });

  if (!application) throw new HttpError(404, "Application not found");

  const organization = await prisma.organization.findUnique({
    where: { ownerId: userId },
    select: { id: true },
  });

  const isApplicant = organization?.id === application.organizationId;
  const isFunder = application.grant.funderId === userId;

  if (!isApplicant && !isFunder) {
    throw new HttpError(404, "Application not found");
  }

  const comment = await prisma.comment.create({
    data: {
      applicationId,
      authorId: userId,
      body: input.body,
      // An applicant cannot post an internal note — "internal" means internal
      // to the funder, so allowing it would be meaningless and confusing.
      internal: isFunder ? input.internal : false,
    },
    include: { author: { select: { name: true } } },
  });

  return {
    id: comment.id,
    body: comment.body,
    internal: comment.internal,
    authorName: comment.author.name,
    createdAt: comment.createdAt.toISOString(),
  };
}

/* ── Progress reports (post-release) ──────────────────────────────────────── */

export async function createReport(
  userId: string,
  projectId: string,
  input: CreateReportInput,
) {
  const organization = await requireOwnedOrganization(userId);

  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: organization.id },
    select: {
      id: true,
      application: {
        select: {
          id: true,
          status: true,
          // The funder to tell about this report, and the grant to name in it.
          grant: { select: { title: true, funderId: true } },
        },
      },
    },
  });

  if (!project) throw new HttpError(404, "Project not found");

  if (
    project.application.status !== "IN_PROGRESS" &&
    project.application.status !== "FUNDS_RELEASED"
  ) {
    throw new HttpError(
      409,
      "Reports can only be posted while the project is running.",
    );
  }

  const report = await prisma.report.create({
    data: {
      projectId,
      type: input.type,
      title: input.title,
      body: input.body,
      spentMinor: input.spentMinor ?? null,
      mediaUrls: input.mediaUrls,
    },
  });

  /*
   * Tell the funder. Reporting back is the last stage of the workflow and the
   * only one the funder has no reason to be watching for — every earlier step
   * was triggered by them. Without this the report sits unread on a page nobody
   * has a reason to revisit, which is precisely how "we never heard what
   * happened to the money" becomes true on a platform built to prevent it.
   *
   * Deliberately NOT inside a transaction with the report: the report is
   * already written and useful, and a socket or notification failure must not
   * roll back an NGO's work.
   */
  await notify({
    userId: project.application.grant.funderId,
    type: "REPORT_POSTED",
    title: "New project report",
    body: `${organization.name} posted "${report.title}" on ${project.application.grant.title}.`,
    link: `/applications/${project.application.id}`,
  });

  return {
    id: report.id,
    type: report.type,
    title: report.title,
    body: report.body,
    spentMinor: report.spentMinor,
    mediaUrls: Array.isArray(report.mediaUrls)
      ? (report.mediaUrls as string[])
      : [],
    createdAt: report.createdAt.toISOString(),
  };
}
