import { z } from "zod";

/**
 * Organisation (NGO) contracts — browsing, filtering, and profile shapes.
 */

export const categorySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  icon: z.string().nullable(),
});
export type Category = z.infer<typeof categorySchema>;

export const impactMetricSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.string(),
  unit: z.string().nullable(),
});
export type ImpactMetric = z.infer<typeof impactMetricSchema>;

/** Summary shape used for cards in the browse grid. */
export const organizationCardSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  mission: z.string(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  country: z.string(),
  verified: z.boolean(),
  rating: z.number(),
  ratingCount: z.number(),
  fundingGoalMinor: z.number(),
  totalRaisedMinor: z.number(),
  donorCount: z.number(),
  currency: z.string(),
  coverUrl: z.string().nullable(),
  logoUrl: z.string().nullable(),
  categories: z.array(categorySchema),
  /** Only present for a signed-in donor — drives the filled/empty heart icon. */
  isBookmarked: z.boolean().optional(),
  isFollowing: z.boolean().optional(),
});
export type OrganizationCard = z.infer<typeof organizationCardSchema>;

/** Full shape for the public profile page. */
export const organizationDetailSchema = organizationCardSchema.extend({
  /**
   * When platform verification was granted. Public because the date is what
   * makes the verified badge a checkable claim rather than a decoration — "we
   * reviewed this on 3 March" says considerably more than a tick.
   */
  verifiedAt: z.string().nullable(),
  /**
   * Gallery photographs the organisation has published.
   *
   * ONLY documents flagged `isPublic` — which the upload path sets exclusively
   * for `GALLERY_IMAGE`. Legal documents (registration certificates, tax
   * exemption, audited accounts) live in the same table and must never reach
   * this array; the query filters on both the flag and the type so a future
   * change to either one alone cannot leak them.
   */
  gallery: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      url: z.string(),
    }),
  ),
  description: z.string().nullable(),
  website: z.string().nullable(),
  contactEmail: z.string().nullable(),
  foundedYear: z.number().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  impactMetrics: z.array(impactMetricSchema),
  teamMembers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      role: z.string(),
      bio: z.string().nullable(),
      photoUrl: z.string().nullable(),
      linkedinUrl: z.string().nullable(),
      sortOrder: z.number(),
    }),
  ),
  createdAt: z.string(),
});
export type OrganizationDetail = z.infer<typeof organizationDetailSchema>;

/** Sort options offered in the browse UI. */
export const organizationSortSchema = z.enum([
  "relevance",
  "most-funded",
  "least-funded",
  "top-rated",
  "newest",
]);
export type OrganizationSort = z.infer<typeof organizationSortSchema>;

/**
 * Query parameters for GET /organizations.
 *
 * Everything arrives from a URL as a string, so `coerce` converts numbers and
 * booleans. Defining the whole filter set as one schema means the server, the
 * client fetcher, and the URL-state hook all agree on exactly what a valid
 * search looks like.
 */
export const organizationQuerySchema = z.object({
  /** Free-text search across name and mission. */
  q: z.string().trim().max(120).optional(),
  /** Category slugs; repeated params arrive as an array. */
  category: z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : [v]))
    .optional(),
  city: z.string().trim().max(80).optional(),
  verifiedOnly: z.coerce.boolean().optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  sort: organizationSortSchema.default("relevance"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(12),
});
export type OrganizationQuery = z.infer<typeof organizationQuerySchema>;

export const organizationListResponseSchema = z.object({
  items: z.array(organizationCardSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  totalPages: z.number(),
});
export type OrganizationListResponse = z.infer<
  typeof organizationListResponseSchema
>;
