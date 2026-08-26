import { z } from "zod";

/**
 * NGO-side contracts: editing your own organisation profile and managing the
 * documents attached to it.
 */

/**
 * This package has no DOM or Node lib in its tsconfig (it's isomorphic —
 * imported by both the API and the browser bundle), so the global `URL`
 * constructor isn't declared even though every runtime that actually loads
 * this file (Node, browsers) provides one. This just tells TS it exists;
 * it's module-scoped and doesn't leak into other files.
 */
declare const URL: new (input: string) => { protocol: string };

/**
 * A URL restricted to http(s).
 *
 * Zod's `.url()` is `new URL()` under the hood, which happily accepts
 * `javascript:`, `data:` and `vbscript:`. Any of those stored and later
 * rendered into an href is stored XSS — React does not block them.
 * Everything user-supplied that ends up in a link MUST go through this.
 */
export const httpUrlSchema = z
  .string()
  .trim()
  .url("Enter a valid URL")
  .refine(
    (value) => {
      try {
        const protocol = new URL(value).protocol;
        return protocol === "http:" || protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "Links must start with http:// or https://" },
  );

export const documentTypeSchema = z.enum([
  "REGISTRATION_CERTIFICATE",
  "PAN_CARD",
  "GST_CERTIFICATE",
  "ANNUAL_REPORT",
  "TAX_EXEMPTION",
  "GALLERY_IMAGE",
  "OTHER",
]);
export type DocumentType = z.infer<typeof documentTypeSchema>;

/** Human labels, so the API and UI never drift apart on wording. */
export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  REGISTRATION_CERTIFICATE: "Registration certificate",
  PAN_CARD: "PAN card",
  GST_CERTIFICATE: "GST certificate",
  ANNUAL_REPORT: "Annual report",
  TAX_EXEMPTION: "80G / 12A certificate",
  GALLERY_IMAGE: "Gallery image",
  OTHER: "Other",
};

/** Types that are legal paperwork rather than public imagery. */
export const LEGAL_DOCUMENT_TYPES: DocumentType[] = [
  "REGISTRATION_CERTIFICATE",
  "PAN_CARD",
  "GST_CERTIFICATE",
  "ANNUAL_REPORT",
  "TAX_EXEMPTION",
  "OTHER",
];

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Editable profile fields.
 *
 * Deliberately excludes `verified`, `rating`, `totalRaisedMinor`, `slug` and
 * `status`: an NGO must not be able to mark itself verified, rewrite its own
 * donation totals, or change the URL donors have bookmarked. Those are set by
 * the platform or derived from real activity.
 */
export const updateOrganizationSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(120),
  mission: z
    .string()
    .trim()
    .min(10, "Write at least a short one-line mission")
    .max(200, "Keep the mission under 200 characters"),
  description: z.string().trim().max(5000).optional().or(z.literal("")),
  city: z.string().trim().max(80).optional().or(z.literal("")),
  state: z.string().trim().max(80).optional().or(z.literal("")),
  /*
   * No `.default()` on this or `categoryIds` deliberately. A Zod default makes
   * the field optional on INPUT but required on OUTPUT, and React Hook Form
   * types the form from the output while typing the resolver from the input —
   * so the two stop matching. The profile form always submits every field, so
   * requiring them keeps one type for both.
   */
  country: z.string().trim().min(1, "Country is required").max(80),
  website: httpUrlSchema
    .refine((value) => value.length <= 200, {
      message: "Keep the URL under 200 characters",
    })
    .optional()
    .or(z.literal("")),
  contactEmail: z
    .string()
    .trim()
    .email("Enter a valid email address")
    .optional()
    .or(z.literal("")),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  foundedYear: z
    .number()
    .int()
    .min(1800, "That founding year looks too early")
    .max(new Date().getFullYear(), "Founding year cannot be in the future")
    .optional()
    .nullable(),
  fundingGoalMinor: z
    .number()
    .int("Funding goal must be a whole number")
    .min(0)
    .max(100_000_000_000),
  /** Category ids the organisation works across. */
  categoryIds: z.array(z.string()).max(6, "Pick at most 6 causes"),
});
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

export const documentSchema = z.object({
  id: z.string(),
  type: documentTypeSchema,
  title: z.string(),
  url: z.string(),
  bytes: z.number(),
  format: z.string().nullable(),
  isPublic: z.boolean(),
  createdAt: z.string(),
});
export type OrganizationDocument = z.infer<typeof documentSchema>;

export const documentListResponseSchema = z.object({
  items: z.array(documentSchema),
});
export type DocumentListResponse = z.infer<typeof documentListResponseSchema>;

/** Metadata that accompanies a multipart upload. */
export const uploadDocumentSchema = z.object({
  type: documentTypeSchema,
  title: z.string().trim().min(1, "Give the file a title").max(120),
});
export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>;

/** Which of the two profile images an upload replaces. */
export const organizationImageKindSchema = z.enum(["logo", "cover"]);
export type OrganizationImageKind = z.infer<typeof organizationImageKindSchema>;

/* ── Impact metrics ───────────────────────────────────────────────────────── */

/**
 * `value` is a STRING, not a number, on purpose. Nonprofits report impact in
 * shapes a number can't hold — "146,000", "31 hrs", "2 in 3", "98%". Forcing a
 * numeric type would either lose that meaning or push formatting rules into
 * every consumer.
 */
export const upsertImpactMetricSchema = z.object({
  label: z.string().trim().min(2, "Give the metric a label").max(60),
  value: z.string().trim().min(1, "Enter a value").max(30),
  unit: z.string().trim().max(40).optional().or(z.literal("")),
});
export type UpsertImpactMetricInput = z.infer<
  typeof upsertImpactMetricSchema
>;

export const impactMetricDetailSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.string(),
  unit: z.string().nullable(),
  sortOrder: z.number(),
});
export type ImpactMetricDetail = z.infer<typeof impactMetricDetailSchema>;

export const MAX_IMPACT_METRICS = 6;

/* ── Team members ─────────────────────────────────────────────────────────── */

export const upsertTeamMemberSchema = z.object({
  name: z.string().trim().min(2, "Enter a name").max(80),
  role: z.string().trim().min(2, "Enter their role").max(80),
  bio: z.string().trim().max(400).optional().or(z.literal("")),
  linkedinUrl: httpUrlSchema
    .refine((value) => value.length <= 200, {
      message: "Keep the URL under 200 characters",
    })
    .optional()
    .or(z.literal("")),
});
export type UpsertTeamMemberInput = z.infer<typeof upsertTeamMemberSchema>;

export const teamMemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  bio: z.string().nullable(),
  photoUrl: z.string().nullable(),
  linkedinUrl: z.string().nullable(),
  sortOrder: z.number(),
});
export type TeamMember = z.infer<typeof teamMemberSchema>;

export const MAX_TEAM_MEMBERS = 20;
