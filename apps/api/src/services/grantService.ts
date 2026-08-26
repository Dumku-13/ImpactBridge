import type { Prisma } from "@prisma/client";
import type {
  GrantQuery,
  UpsertGrantInput,
} from "@impactbridge/shared";
import { grantEligibilitySchema } from "@impactbridge/shared";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/errorHandler.js";
import { notifyMany } from "./notificationService.js";

/**
 * Grants — creation and management by FUNDERs, discovery by everyone.
 *
 * Funder-owned operations resolve the grant through `funderId`, never from an
 * id alone, so one funder can't edit another's grant. Same principle as
 * ngoService: ownership is part of the query, not a separate check that a
 * handler might forget.
 */

/** "Rural Water Access 2026" → "rural-water-access-2026". */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Find a slug nobody is using yet.
 *
 * Two grants can legitimately share a title ("Annual Education Fund" posted by
 * different funders), so a collision is expected rather than exceptional — we
 * suffix instead of failing.
 */
async function uniqueSlug(title: string, excludeId?: string): Promise<string> {
  const base = slugify(title) || "grant";

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;

    const existing = await prisma.grant.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });

    if (!existing || existing.id === excludeId) return candidate;
  }

  // Astronomically unlikely; a random suffix beats an infinite loop.
  return `${base}-${Date.now().toString(36)}`;
}

const cardSelect = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  amountMinor: true,
  maxAwardMinor: true,
  currency: true,
  status: true,
  deadline: true,
  createdAt: true,
  funder: { select: { id: true, name: true } },
  categories: { select: { id: true, slug: true, name: true } },
  _count: { select: { applications: true } },
} satisfies Prisma.GrantSelect;

function toCard(row: {
  id: string;
  slug: string;
  title: string;
  summary: string;
  amountMinor: number;
  maxAwardMinor: number | null;
  currency: string;
  status: string;
  deadline: Date;
  createdAt: Date;
  funder: { id: string; name: string };
  categories: Array<{ id: string; slug: string; name: string }>;
  _count: { applications: number };
}) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    amountMinor: row.amountMinor,
    maxAwardMinor: row.maxAwardMinor,
    currency: row.currency,
    status: row.status,
    deadline: row.deadline.toISOString(),
    createdAt: row.createdAt.toISOString(),
    funder: row.funder,
    categories: row.categories,
    applicationCount: row._count.applications,
  };
}

/* ── Discovery ────────────────────────────────────────────────────────────── */

/**
 * Public grant browse.
 *
 * DRAFT grants are excluded unconditionally — a funder's unfinished posting
 * must never be discoverable, so that filter is applied here rather than being
 * something each caller passes in and might omit.
 */
export async function listGrants(query: GrantQuery) {
  const where: Prisma.GrantWhereInput = {
    status: query.openOnly ? "OPEN" : { in: ["OPEN", "CLOSED", "COMPLETED"] },
  };

  if (query.openOnly) {
    where.deadline = { gte: new Date() };
  }

  if (query.search) {
    where.OR = [
      { title: { contains: query.search, mode: "insensitive" } },
      { summary: { contains: query.search, mode: "insensitive" } },
    ];
  }

  if (query.category) {
    where.categories = { some: { slug: query.category } };
  }

  if (query.minAmountMinor) {
    where.amountMinor = { gte: query.minAmountMinor };
  }

  const orderBy: Prisma.GrantOrderByWithRelationInput =
    query.sort === "newest"
      ? { createdAt: "desc" }
      : query.sort === "amount_desc"
        ? { amountMinor: "desc" }
        : { deadline: "asc" };

  const [rows, total] = await prisma.$transaction([
    prisma.grant.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: cardSelect,
    }),
    prisma.grant.count({ where }),
  ]);

  return {
    items: rows.map(toCard),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

/**
 * Full grant detail.
 *
 * `viewerOrganizationId` lets a signed-in NGO see whether they've already
 * applied, which is what the page needs to decide between "Apply" and "View
 * your application".
 */
export async function getGrantBySlug(
  slug: string,
  viewerOrganizationId?: string,
  viewerUserId?: string,
) {
  const row = await prisma.grant.findUnique({
    where: { slug },
    select: {
      ...cardSelect,
      description: true,
      eligibility: true,
      questions: true,
      funderId: true,
    },
  });

  if (!row) throw new HttpError(404, "Grant not found");

  // A draft is visible only to the funder who owns it.
  if (row.status === "DRAFT" && row.funderId !== viewerUserId) {
    throw new HttpError(404, "Grant not found");
  }

  const myApplication = viewerOrganizationId
    ? await prisma.grantApplication.findUnique({
        where: {
          grantId_organizationId: {
            grantId: row.id,
            organizationId: viewerOrganizationId,
          },
        },
        select: { id: true, status: true },
      })
    : null;

  const parsedEligibility = grantEligibilitySchema.safeParse(row.eligibility);

  return {
    ...toCard(row),
    description: row.description,
    eligibility: parsedEligibility.success ? parsedEligibility.data : null,
    questions: Array.isArray(row.questions) ? (row.questions as string[]) : [],
    myApplication,
  };
}

/* ── Funder-owned management ──────────────────────────────────────────────── */

/** Every grant this funder has posted, drafts included. */
export async function listMyGrants(funderId: string) {
  const rows = await prisma.grant.findMany({
    where: { funderId },
    orderBy: { createdAt: "desc" },
    select: cardSelect,
  });

  return rows.map(toCard);
}

export async function createGrant(
  funderId: string,
  input: UpsertGrantInput,
) {
  const slug = await uniqueSlug(input.title);

  const grant = await prisma.grant.create({
    data: {
      slug,
      funderId,
      title: input.title,
      summary: input.summary,
      description: input.description?.trim() || null,
      amountMinor: input.amountMinor,
      maxAwardMinor: input.maxAwardMinor ?? null,
      deadline: new Date(input.deadline),
      eligibility: input.eligibility,
      questions: input.questions,
      categories: { connect: input.categoryIds.map((id) => ({ id })) },
    },
    select: cardSelect,
  });

  return toCard(grant);
}

/** Resolve a grant this funder owns, or 404. */
async function requireOwnedGrant(funderId: string, grantId: string) {
  const grant = await prisma.grant.findFirst({
    where: { id: grantId, funderId },
    select: { id: true, status: true, title: true },
  });

  // 404 rather than 403: we don't confirm that someone else's grant exists.
  if (!grant) throw new HttpError(404, "Grant not found");

  return grant;
}

export async function updateGrant(
  funderId: string,
  grantId: string,
  input: UpsertGrantInput,
) {
  const existing = await requireOwnedGrant(funderId, grantId);

  /*
   * Terms are frozen once applications can exist. Changing the pot or the
   * eligibility rules after NGOs have applied would move the goalposts under
   * people who already committed work to a proposal.
   */
  if (existing.status !== "DRAFT") {
    const applicationCount = await prisma.grantApplication.count({
      where: { grantId },
    });

    if (applicationCount > 0) {
      throw new HttpError(
        409,
        "This grant already has applications, so its terms can no longer be changed.",
      );
    }
  }

  const slug = await uniqueSlug(input.title, grantId);

  const grant = await prisma.grant.update({
    where: { id: grantId },
    data: {
      slug,
      title: input.title,
      summary: input.summary,
      description: input.description?.trim() || null,
      amountMinor: input.amountMinor,
      maxAwardMinor: input.maxAwardMinor ?? null,
      deadline: new Date(input.deadline),
      eligibility: input.eligibility,
      questions: input.questions,
      // `set` replaces the whole selection — the form submits desired state.
      categories: { set: input.categoryIds.map((id) => ({ id })) },
    },
    select: cardSelect,
  });

  return toCard(grant);
}

/**
 * Applications that still have somewhere to go.
 *
 * A grant cannot be finished while any of these are open — each one is either
 * awaiting a decision from the funder or is money already committed to work
 * that hasn't been reported as finished.
 *
 * DRAFT is absent deliberately: a draft belongs to the applicant, was never
 * submitted, and the funder cannot see it, let alone resolve it. Letting an
 * abandoned draft hold a grant open forever would make COMPLETED unreachable
 * for exactly the reason it was unreachable before.
 */
const UNRESOLVED_APPLICATION_STATUSES = [
  "SUBMITTED",
  "REVIEW_PENDING",
  "REVIEWER_ASSIGNED",
  "INTERVIEW",
  "APPROVED",
  "FUNDS_RELEASED",
  "IN_PROGRESS",
] as const;

/** Publish a draft, close/reopen an existing grant, or close the book on one. */
export async function setGrantStatus(
  funderId: string,
  grantId: string,
  status: "OPEN" | "CLOSED" | "DRAFT" | "COMPLETED",
) {
  const existing = await requireOwnedGrant(funderId, grantId);

  if (existing.status === "COMPLETED") {
    throw new HttpError(409, "A completed grant cannot be reopened.");
  }

  /*
   * COMPLETED means what the schema says it means: every application resolved
   * and the funds allocated. It is terminal and it is the funder's own
   * statement that the grant is finished, so it is checked rather than trusted
   * — otherwise the status would be a label anybody could apply at any time,
   * which is precisely the kind of unverifiable claim this platform exists to
   * avoid.
   */
  if (status === "COMPLETED") {
    if (existing.status === "DRAFT") {
      throw new HttpError(
        409,
        "This grant was never published, so there is nothing to complete. Delete it instead.",
      );
    }

    const unresolved = await prisma.grantApplication.count({
      where: {
        grantId,
        status: { in: [...UNRESOLVED_APPLICATION_STATUSES] },
      },
    });

    if (unresolved > 0) {
      throw new HttpError(
        409,
        `${unresolved} application${unresolved === 1 ? " is" : "s are"} still open. ` +
          "Every application must be completed, rejected or withdrawn first.",
      );
    }
  }

  // Un-publishing would hide a grant NGOs may already have applied to.
  if (status === "DRAFT" && existing.status !== "DRAFT") {
    const applicationCount = await prisma.grantApplication.count({
      where: { grantId },
    });

    if (applicationCount > 0) {
      throw new HttpError(
        409,
        "This grant has applications and can no longer be moved back to draft.",
      );
    }
  }

  const grant = await prisma.grant.update({
    where: { id: grantId },
    data: { status },
    select: cardSelect,
  });

  /*
   * Publishing is the moment NGOs need to hear about. Only NGOs working in a
   * matching cause are told — blasting every nonprofit on the platform would
   * train people to ignore notifications entirely.
   */
  if (status === "OPEN" && existing.status === "DRAFT") {
    const matching = await prisma.organization.findMany({
      where: {
        status: "ACTIVE",
        categories: { some: { id: { in: grant.categories.map((c) => c.id) } } },
      },
      select: { ownerId: true },
    });

    await notifyMany(
      matching.map((organization) => organization.ownerId),
      {
        type: "GRANT_POSTED",
        title: "New grant you may qualify for",
        body: `${grant.title} — ${grant.funder.name}`,
        link: `/grants/${grant.slug}`,
      },
    );
  }

  return toCard(grant);
}

export async function deleteGrant(funderId: string, grantId: string) {
  const existing = await requireOwnedGrant(funderId, grantId);

  const applicationCount = await prisma.grantApplication.count({
    where: { grantId },
  });

  if (applicationCount > 0) {
    throw new HttpError(
      409,
      "This grant has applications and cannot be deleted. Close it instead.",
    );
  }

  await prisma.grant.delete({ where: { id: existing.id } });

  return { deleted: true };
}
