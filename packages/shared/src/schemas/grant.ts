import { z } from "zod";

/**
 * Grant contracts.
 *
 * Amounts are MINOR units (paise) as integers everywhere, same rule as
 * donations — see money.ts for why.
 */

export const grantStatusSchema = z.enum([
  "DRAFT",
  "OPEN",
  "CLOSED",
  "COMPLETED",
]);
export type GrantStatus = z.infer<typeof grantStatusSchema>;

export const applicationStatusSchema = z.enum([
  "DRAFT",
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
]);
export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;

/** Human copy for each stage, so the UI never hand-writes these. */
export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  REVIEW_PENDING: "Review pending",
  REVIEWER_ASSIGNED: "Under review",
  INTERVIEW: "Interview",
  APPROVED: "Approved",
  FUNDS_RELEASED: "Funds released",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

/** The happy path, in order — drives the progress tracker in the UI. */
export const APPLICATION_PIPELINE: ApplicationStatus[] = [
  "SUBMITTED",
  "REVIEW_PENDING",
  "REVIEWER_ASSIGNED",
  "INTERVIEW",
  "APPROVED",
  "FUNDS_RELEASED",
  "IN_PROGRESS",
  "COMPLETED",
];

export const MIN_GRANT_MINOR = 1_000_00; // ₹1,000
export const MAX_GRANT_MINOR = 100_00_00_000; // ₹100 crore

/**
 * Eligibility rules.
 *
 * Stored as JSON on the grant rather than as columns: the rules a funder cares
 * about vary per grant, and every new rule would otherwise need a migration.
 * Validating through this schema keeps the shape honest without freezing it.
 */
export const grantEligibilitySchema = z.object({
  /** Only verified NGOs may apply. */
  verifiedOnly: z.boolean().default(false),
  /** Minimum years since the organisation was founded. */
  minYearsActive: z.number().int().min(0).max(100).optional(),
  /** Restrict to these states; empty means anywhere. */
  states: z.array(z.string().trim().min(1)).max(40).default([]),
  /** Free-text conditions the funder wants applicants to read. */
  notes: z.string().trim().max(600).optional().or(z.literal("")),
});
export type GrantEligibility = z.infer<typeof grantEligibilitySchema>;

export const upsertGrantSchema = z
  .object({
    title: z.string().trim().min(6, "Give the grant a title").max(120),
    summary: z
      .string()
      .trim()
      .min(20, "Write at least a sentence describing the grant")
      .max(300),
    description: z.string().trim().max(5000).optional().or(z.literal("")),
    amountMinor: z
      .number({ invalid_type_error: "Enter the total fund size" })
      .int()
      .min(MIN_GRANT_MINOR, "Minimum grant pot is ₹1,000")
      .max(MAX_GRANT_MINOR, "That's larger than this platform supports"),
    maxAwardMinor: z.number().int().positive().optional().nullable(),
    categoryIds: z
      .array(z.string())
      .min(1, "Pick at least one cause this grant supports")
      .max(10),
    /** ISO date string; validated as a real future date below. */
    deadline: z.string().min(1, "Set an application deadline"),
    eligibility: grantEligibilitySchema,
    questions: z
      .array(z.string().trim().min(4).max(240))
      .max(10, "Ten questions is plenty")
      .default([]),
  })
  .refine(
    (data) =>
      data.maxAwardMinor == null || data.maxAwardMinor <= data.amountMinor,
    {
      message: "The per-award cap cannot exceed the total fund",
      path: ["maxAwardMinor"],
    },
  )
  .refine((data) => new Date(data.deadline).getTime() > Date.now(), {
    message: "The deadline must be in the future",
    path: ["deadline"],
  });
export type UpsertGrantInput = z.infer<typeof upsertGrantSchema>;

export const grantCardSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  amountMinor: z.number(),
  maxAwardMinor: z.number().nullable(),
  currency: z.string(),
  status: grantStatusSchema,
  deadline: z.string(),
  createdAt: z.string(),
  funder: z.object({ id: z.string(), name: z.string() }),
  categories: z.array(
    z.object({ id: z.string(), slug: z.string(), name: z.string() }),
  ),
  applicationCount: z.number(),
});
export type GrantCard = z.infer<typeof grantCardSchema>;

export const grantDetailSchema = grantCardSchema.extend({
  description: z.string().nullable(),
  eligibility: grantEligibilitySchema.nullable(),
  questions: z.array(z.string()),
  /** Present for a signed-in NGO: their own application, if any. */
  myApplication: z
    .object({ id: z.string(), status: applicationStatusSchema })
    .nullable()
    .optional(),
});
export type GrantDetail = z.infer<typeof grantDetailSchema>;

export const grantSortSchema = z.enum([
  "deadline",
  "newest",
  "amount_desc",
]);
export type GrantSort = z.infer<typeof grantSortSchema>;

export const grantQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  category: z.string().optional(),
  /** Hide grants whose deadline has passed. */
  openOnly: z.coerce.boolean().default(true),
  minAmountMinor: z.coerce.number().int().nonnegative().optional(),
  sort: grantSortSchema.default("deadline"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(12),
});
export type GrantQuery = z.infer<typeof grantQuerySchema>;

export const grantListResponseSchema = z.object({
  items: z.array(grantCardSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  totalPages: z.number(),
});
export type GrantListResponse = z.infer<typeof grantListResponseSchema>;
