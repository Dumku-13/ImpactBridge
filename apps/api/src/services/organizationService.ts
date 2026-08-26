import type { Prisma } from "@prisma/client";
import type {
  OrganizationCard,
  OrganizationDetail,
  OrganizationListResponse,
  OrganizationQuery,
} from "@impactbridge/shared";
import { DEFAULT_CURRENCY } from "@impactbridge/shared";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/errorHandler.js";

/**
 * Fields every organisation card needs. Declared once and reused by the list
 * and detail queries so the two can't drift, and so we never accidentally
 * over-fetch (e.g. pulling `description` for a grid of 12 cards).
 */
const cardSelect = {
  id: true,
  slug: true,
  name: true,
  mission: true,
  city: true,
  state: true,
  country: true,
  verified: true,
  rating: true,
  ratingCount: true,
  fundingGoalMinor: true,
  totalRaisedMinor: true,
  donorCount: true,
  coverUrl: true,
  logoUrl: true,
  categories: {
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      icon: true,
    },
    orderBy: { sortOrder: "asc" },
  },
} satisfies Prisma.OrganizationSelect;

type OrganizationRow = Prisma.OrganizationGetPayload<{
  select: typeof cardSelect;
}>;

function toCard(
  row: OrganizationRow,
  flags: { isBookmarked?: boolean; isFollowing?: boolean } = {},
): OrganizationCard {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    mission: row.mission,
    city: row.city,
    state: row.state,
    country: row.country,
    verified: row.verified,
    rating: row.rating,
    ratingCount: row.ratingCount,
    fundingGoalMinor: row.fundingGoalMinor,
    totalRaisedMinor: row.totalRaisedMinor,
    donorCount: row.donorCount,
    currency: DEFAULT_CURRENCY,
    coverUrl: row.coverUrl,
    logoUrl: row.logoUrl,
    categories: row.categories,
    ...flags,
  };
}

const SORT_ORDER: Record<
  OrganizationQuery["sort"],
  Prisma.OrganizationOrderByWithRelationInput[]
> = {
  /*
   * "relevance" = verified organisations first, then the most-supported.
   *
   * This sorts on the `verified` BOOLEAN rather than the `verifiedAt`
   * timestamp for two reasons: a timestamp's NULLs sort first under DESC in
   * Postgres (ranking unverified orgs at the top — the opposite of the intent),
   * and because every timestamp is distinct it would fully determine the order,
   * leaving `donorCount` as a tiebreaker that never actually breaks any ties.
   */
  relevance: [{ verified: "desc" }, { donorCount: "desc" }],
  "most-funded": [{ totalRaisedMinor: "desc" }],
  // Surfaces organisations that need help most — a genuinely useful view.
  "least-funded": [{ totalRaisedMinor: "asc" }],
  "top-rated": [{ rating: "desc" }, { ratingCount: "desc" }],
  newest: [{ createdAt: "desc" }],
};

/**
 * List organisations with search, filters, sorting and pagination.
 *
 * `viewerId` is optional: when a donor is signed in we additionally report
 * whether they've bookmarked or followed each result, so the UI can render the
 * correct icon state without a second round trip.
 */
export async function listOrganizations(
  query: OrganizationQuery,
  viewerId?: string,
): Promise<OrganizationListResponse> {
  const where: Prisma.OrganizationWhereInput = {
    // Only publicly visible organisations are ever browsable. Draft, pending
    // and suspended profiles must never leak into search results.
    status: "ACTIVE",
  };

  if (query.q) {
    /*
     * `mode: "insensitive"` makes this a case-insensitive ILIKE in Postgres.
     * Good enough for this dataset; if it ever needs ranking or stemming we'd
     * move to Postgres full-text search with a tsvector column and GIN index.
     */
    where.OR = [
      { name: { contains: query.q, mode: "insensitive" } },
      { mission: { contains: query.q, mode: "insensitive" } },
      { description: { contains: query.q, mode: "insensitive" } },
    ];
  }

  if (query.category?.length) {
    // `some` = organisations linked to ANY of the chosen categories.
    where.categories = { some: { slug: { in: query.category } } };
  }

  if (query.city) {
    where.city = { equals: query.city, mode: "insensitive" };
  }

  if (query.verifiedOnly) {
    where.verified = true;
  }

  if (query.minRating !== undefined && query.minRating > 0) {
    where.rating = { gte: query.minRating };
  }

  const skip = (query.page - 1) * query.pageSize;

  /*
   * Run the page query and the count in ONE database round trip. Prisma's
   * $transaction with an array issues them together, which is meaningfully
   * faster than awaiting them in sequence.
   */
  const [rows, total] = await prisma.$transaction([
    prisma.organization.findMany({
      where,
      select: cardSelect,
      orderBy: SORT_ORDER[query.sort],
      skip,
      take: query.pageSize,
    }),
    prisma.organization.count({ where }),
  ]);

  const flagsByOrgId = await viewerFlags(
    rows.map((r) => r.id),
    viewerId,
  );

  return {
    items: rows.map((row) => toCard(row, flagsByOrgId.get(row.id) ?? {})),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

/**
 * Fetch bookmark/follow state for a set of organisations in two queries,
 * rather than one query per card.
 *
 * This is the N+1 trap: checking `isBookmarked` inside a map over 12 cards
 * would issue 12 extra queries. Fetching the viewer's matching rows in bulk and
 * building a lookup keeps it constant regardless of page size.
 */
async function viewerFlags(
  organizationIds: string[],
  viewerId?: string,
): Promise<Map<string, { isBookmarked: boolean; isFollowing: boolean }>> {
  const result = new Map<
    string,
    { isBookmarked: boolean; isFollowing: boolean }
  >();

  if (!viewerId || organizationIds.length === 0) return result;

  const [bookmarks, follows] = await prisma.$transaction([
    prisma.bookmark.findMany({
      where: { userId: viewerId, organizationId: { in: organizationIds } },
      select: { organizationId: true },
    }),
    prisma.follow.findMany({
      where: { userId: viewerId, organizationId: { in: organizationIds } },
      select: { organizationId: true },
    }),
  ]);

  const bookmarked = new Set(bookmarks.map((b) => b.organizationId));
  const following = new Set(follows.map((f) => f.organizationId));

  for (const id of organizationIds) {
    result.set(id, {
      isBookmarked: bookmarked.has(id),
      isFollowing: following.has(id),
    });
  }

  return result;
}

export async function getOrganizationBySlug(
  slug: string,
  viewerId?: string,
): Promise<OrganizationDetail> {
  const row = await prisma.organization.findUnique({
    where: { slug },
    select: {
      ...cardSelect,
      verifiedAt: true,
      description: true,
      website: true,
      contactEmail: true,
      foundedYear: true,
      latitude: true,
      longitude: true,
      createdAt: true,
      status: true,
      impactMetrics: {
        select: { id: true, label: true, value: true, unit: true },
        orderBy: { sortOrder: "asc" },
      },
      teamMembers: {
        select: {
          id: true,
          name: true,
          role: true,
          bio: true,
          photoUrl: true,
          linkedinUrl: true,
          sortOrder: true,
        },
        orderBy: { sortOrder: "asc" },
      },
      /*
       * Gallery photographs only.
       *
       * Legal documents share this table — registration certificates, tax
       * exemption, audited accounts — so the filter is deliberately doubled:
       * `isPublic` AND `type: GALLERY_IMAGE`. The upload path sets `isPublic`
       * exclusively for gallery images today, but relying on that alone would
       * mean one careless change elsewhere silently publishes an NGO's
       * registration paperwork to the open internet.
       */
      documents: {
        where: { isPublic: true, type: "GALLERY_IMAGE" },
        select: { id: true, title: true, url: true },
        orderBy: { createdAt: "desc" },
        take: 12,
      },
    },
  });

  if (!row || row.status !== "ACTIVE") {
    // A suspended organisation returns 404, not 403 — we don't confirm to the
    // public that a given slug exists but is hidden.
    throw new HttpError(404, "Organisation not found");
  }

  const flags = await viewerFlags([row.id], viewerId);

  return {
    ...toCard(row, flags.get(row.id) ?? {}),
    // Serialised, not the Date object — the schema and the wire format are
    // both ISO strings.
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    gallery: row.documents,
    description: row.description,
    website: row.website,
    contactEmail: row.contactEmail,
    foundedYear: row.foundedYear,
    latitude: row.latitude,
    longitude: row.longitude,
    impactMetrics: row.impactMetrics,
    teamMembers: row.teamMembers,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listCategories() {
  return prisma.category.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      icon: true,
    },
    orderBy: { sortOrder: "asc" },
  });
}

/** Distinct cities that have at least one active organisation — powers the filter. */
export async function listCities(): Promise<string[]> {
  const rows = await prisma.organization.findMany({
    where: { status: "ACTIVE", city: { not: null } },
    select: { city: true },
    distinct: ["city"],
    orderBy: { city: "asc" },
  });

  return rows.map((r) => r.city!).filter(Boolean);
}

/** Toggle a bookmark. Returns the resulting state so the UI can sync. */
export async function toggleBookmark(
  userId: string,
  organizationId: string,
): Promise<{ isBookmarked: boolean }> {
  const existing = await prisma.bookmark.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
  });

  if (existing) {
    await prisma.bookmark.delete({ where: { id: existing.id } });
    return { isBookmarked: false };
  }

  await prisma.bookmark.create({ data: { userId, organizationId } });
  return { isBookmarked: true };
}

export async function toggleFollow(
  userId: string,
  organizationId: string,
): Promise<{ isFollowing: boolean }> {
  const existing = await prisma.follow.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
  });

  if (existing) {
    await prisma.follow.delete({ where: { id: existing.id } });
    return { isFollowing: false };
  }

  await prisma.follow.create({ data: { userId, organizationId } });
  return { isFollowing: true };
}

/** Organisations the viewer has bookmarked, for the donor dashboard. */
export async function listBookmarkedOrganizations(
  userId: string,
): Promise<OrganizationCard[]> {
  const bookmarks = await prisma.bookmark.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { organization: { select: cardSelect } },
  });

  return bookmarks.map((b) => toCard(b.organization, { isBookmarked: true }));
}
