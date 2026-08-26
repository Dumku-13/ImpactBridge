import { z } from "zod";
import { applicationStatusSchema } from "./grant.js";
import { httpUrlSchema } from "./ngo.js";

/**
 * Grant application contracts — the NGO side (apply, track) and the funder side
 * (review, decide, release).
 */

export const proposalSchema = z.object({
  pitch: z
    .string()
    .trim()
    .min(80, "Give the funder at least a paragraph")
    .max(4000),
  /** Answers to Grant.questions, index-aligned with that array. */
  answers: z.array(z.string().trim().max(2000)).max(10).default([]),
});
export type Proposal = z.infer<typeof proposalSchema>;

export const upsertApplicationSchema = z.object({
  requestedAmountMinor: z
    .number({ invalid_type_error: "Enter the amount you're requesting" })
    .int()
    .positive("Request must be more than zero"),
  proposal: proposalSchema,
});
export type UpsertApplicationInput = z.infer<typeof upsertApplicationSchema>;

/**
 * A status change request.
 *
 * The server re-derives what is legal from the state machine; this only says
 * what the caller WANTS. Extra fields are required by specific destinations —
 * an award amount when approving, a reviewer when assigning.
 */
export const transitionSchema = z.object({
  toStatus: applicationStatusSchema,
  note: z.string().trim().max(600).optional().or(z.literal("")),
  /** Required when moving to APPROVED. May differ from the amount requested. */
  awardedAmountMinor: z.number().int().positive().optional().nullable(),
  /** Required when moving to REVIEWER_ASSIGNED. */
  reviewerId: z.string().optional().nullable(),
});
export type TransitionInput = z.infer<typeof transitionSchema>;

export const upsertReviewSchema = z.object({
  score: z
    .number({ invalid_type_error: "Give a score" })
    .int()
    .min(1, "Score runs from 1 to 5")
    .max(5, "Score runs from 1 to 5"),
  strengths: z.string().trim().max(1500).optional().or(z.literal("")),
  concerns: z.string().trim().max(1500).optional().or(z.literal("")),
  recommend: z.boolean(),
});
export type UpsertReviewInput = z.infer<typeof upsertReviewSchema>;

export const createCommentSchema = z.object({
  body: z.string().trim().min(1, "Write something").max(2000),
  /**
   * Internal comments stay on the funder side; public ones are shown to the
   * applicant as reviewer feedback. Defaults to internal, so a note is never
   * accidentally exposed to the applicant by omission.
   */
  internal: z.boolean().default(true),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export const reportTypeSchema = z.enum(["MILESTONE", "EXPENSE", "UPDATE"]);
export type ReportType = z.infer<typeof reportTypeSchema>;

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  MILESTONE: "Milestone",
  EXPENSE: "Expense report",
  UPDATE: "Update",
};

export const createReportSchema = z
  .object({
    type: reportTypeSchema.default("UPDATE"),
    title: z.string().trim().min(4, "Give the update a title").max(140),
    body: z.string().trim().min(20, "Say a little more").max(4000),
    /** Money spent since the last report. Required for expense reports. */
    spentMinor: z.number().int().nonnegative().optional().nullable(),
    mediaUrls: z.array(httpUrlSchema).max(10).default([]),
  })
  .refine(
    (data) => data.type !== "EXPENSE" || (data.spentMinor ?? 0) > 0,
    {
      message: "An expense report needs the amount spent",
      path: ["spentMinor"],
    },
  );
export type CreateReportInput = z.infer<typeof createReportSchema>;

/* ── Response shapes ──────────────────────────────────────────────────────── */

export const applicationEventSchema = z.object({
  id: z.string(),
  fromStatus: applicationStatusSchema.nullable(),
  toStatus: applicationStatusSchema,
  note: z.string().nullable(),
  actorName: z.string().nullable(),
  createdAt: z.string(),
});
export type ApplicationEvent = z.infer<typeof applicationEventSchema>;

export const applicationCardSchema = z.object({
  id: z.string(),
  status: applicationStatusSchema,
  requestedAmountMinor: z.number(),
  awardedAmountMinor: z.number().nullable(),
  currency: z.string(),
  submittedAt: z.string().nullable(),
  decidedAt: z.string().nullable(),
  createdAt: z.string(),
  grant: z.object({
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    deadline: z.string(),
    funderName: z.string(),
  }),
  organization: z.object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    logoUrl: z.string().nullable(),
    verified: z.boolean(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    totalRaisedMinor: z.number(),
    foundedYear: z.number().nullable(),
  }),
  /** Average reviewer score, once any review exists. */
  averageScore: z.number().nullable(),
  reviewCount: z.number(),
});
export type ApplicationCard = z.infer<typeof applicationCardSchema>;

export const reviewSchema = z.object({
  id: z.string(),
  score: z.number(),
  strengths: z.string().nullable(),
  concerns: z.string().nullable(),
  recommend: z.boolean(),
  reviewerName: z.string(),
  createdAt: z.string(),
});
export type Review = z.infer<typeof reviewSchema>;

export const commentSchema = z.object({
  id: z.string(),
  body: z.string(),
  internal: z.boolean(),
  authorName: z.string(),
  createdAt: z.string(),
});
export type Comment = z.infer<typeof commentSchema>;

export const reportSchema = z.object({
  id: z.string(),
  type: reportTypeSchema,
  title: z.string(),
  body: z.string(),
  spentMinor: z.number().nullable(),
  mediaUrls: z.array(z.string()),
  createdAt: z.string(),
});
export type Report = z.infer<typeof reportSchema>;

export const projectSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  reports: z.array(reportSchema),
});
export type Project = z.infer<typeof projectSchema>;

export const applicationDetailSchema = applicationCardSchema.extend({
  proposal: proposalSchema.nullable(),
  questions: z.array(z.string()),
  reviewerId: z.string().nullable(),
  reviewerName: z.string().nullable(),
  reviews: z.array(reviewSchema),
  comments: z.array(commentSchema),
  events: z.array(applicationEventSchema),
  project: projectSchema.nullable(),
  /** Transitions the VIEWER may perform right now, straight from the server. */
  availableTransitions: z.array(
    z.object({ to: applicationStatusSchema, label: z.string() }),
  ),
});
export type ApplicationDetail = z.infer<typeof applicationDetailSchema>;
