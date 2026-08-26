import type {
  OrganizationImageKind,
  UpdateOrganizationInput,
  UploadDocumentInput,
  UpsertImpactMetricInput,
  UpsertTeamMemberInput,
} from "@impactbridge/shared";
import {
  MAX_IMPACT_METRICS,
  MAX_TEAM_MEMBERS,
} from "@impactbridge/shared";
import { prisma } from "../lib/prisma.js";
import { deleteAsset, uploadBuffer } from "../lib/cloudinary.js";
import { HttpError } from "../middleware/errorHandler.js";

/**
 * Everything an NGO admin can do to their OWN organisation.
 *
 * Every function starts from the signed-in user's id and resolves the
 * organisation from ownership — never from an id in the request. That makes it
 * structurally impossible for one NGO to edit another's profile, rather than
 * relying on each handler remembering to check.
 */

/** Resolve the organisation this user owns, or 404. */
async function requireOwnedOrganization(userId: string) {
  const organization = await prisma.organization.findUnique({
    where: { ownerId: userId },
    select: { id: true, slug: true, status: true },
  });

  if (!organization) {
    throw new HttpError(
      404,
      "You don't have an organisation profile yet.",
    );
  }

  // A suspended NGO must lose API access immediately — otherwise its admin
  // keeps editing the profile, uploading documents, and reading donor names
  // through every function below that starts here, for as long as they stay
  // signed in.
  if (organization.status === "SUSPENDED") {
    throw new HttpError(
      403,
      "Your organisation has been suspended. Contact support.",
    );
  }

  return organization;
}

/** The full editable profile for the dashboard. */
export async function getMyOrganization(userId: string) {
  /*
   * Goes through the shared guard rather than querying directly, so a suspended
   * organisation is refused here too. Reading the dashboard is not harmless —
   * it exposes contact details and funding totals — and an endpoint that
   * resolves ownership on its own is exactly how a guard gets bypassed.
   */
  await requireOwnedOrganization(userId);

  const organization = await prisma.organization.findUnique({
    where: { ownerId: userId },
    include: {
      categories: { select: { id: true, slug: true, name: true } },
      impactMetrics: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!organization) {
    throw new HttpError(404, "You don't have an organisation profile yet.");
  }

  return {
    ...organization,
    createdAt: organization.createdAt.toISOString(),
    updatedAt: organization.updatedAt.toISOString(),
    verifiedAt: organization.verifiedAt?.toISOString() ?? null,
  };
}

export async function updateMyOrganization(
  userId: string,
  input: UpdateOrganizationInput,
) {
  const { id } = await requireOwnedOrganization(userId);

  /*
   * Optional text fields arrive as "" from an emptied form input. Storing NULL
   * rather than an empty string keeps "no website" a single representable
   * state, so queries don't have to test for both.
   */
  const blankToNull = (value?: string) =>
    value && value.trim() !== "" ? value.trim() : null;

  const updated = await prisma.organization.update({
    where: { id },
    data: {
      name: input.name,
      mission: input.mission,
      description: blankToNull(input.description),
      city: blankToNull(input.city),
      state: blankToNull(input.state),
      country: input.country || "India",
      website: blankToNull(input.website),
      contactEmail: blankToNull(input.contactEmail),
      phone: blankToNull(input.phone),
      foundedYear: input.foundedYear ?? null,
      fundingGoalMinor: input.fundingGoalMinor,
      // `set` replaces the whole many-to-many selection, which is exactly what
      // a checkbox group submits — the full desired state, not a delta.
      categories: { set: input.categoryIds.map((cid) => ({ id: cid })) },
    },
    include: {
      categories: { select: { id: true, slug: true, name: true } },
      impactMetrics: { orderBy: { sortOrder: "asc" } },
    },
  });

  return {
    ...updated,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
    verifiedAt: updated.verifiedAt?.toISOString() ?? null,
  };
}

/**
 * Replace the logo or cover image.
 *
 * The previous asset is deleted from Cloudinary AFTER the new URL is saved. Do
 * it the other way round and a failed upload leaves the profile pointing at a
 * file that no longer exists.
 */
export async function updateOrganizationImage(
  userId: string,
  kind: OrganizationImageKind,
  file: { buffer: Buffer; mimetype: string },
) {
  const { id } = await requireOwnedOrganization(userId);

  if (!file.mimetype.startsWith("image/")) {
    throw new HttpError(400, "That file is not an image.");
  }

  const asset = await uploadBuffer(file.buffer, `organizations/${id}`, "image");

  const previous = await prisma.document.findFirst({
    where: { organizationId: id, type: "OTHER", title: `__${kind}__` },
  });

  const updated = await prisma.organization.update({
    where: { id },
    data: kind === "logo" ? { logoUrl: asset.url } : { coverUrl: asset.url },
    select: { logoUrl: true, coverUrl: true },
  });

  /*
   * Track the asset so its Cloudinary public id is known and the old file can
   * be cleaned up on the next replacement. The reserved `__logo__`/`__cover__`
   * title keeps these out of the user-facing document list.
   */
  await prisma.document.create({
    data: {
      organizationId: id,
      type: "OTHER",
      title: `__${kind}__`,
      url: asset.url,
      publicId: asset.publicId,
      bytes: asset.bytes,
      format: asset.format,
      resourceType: asset.resourceType,
      isPublic: true,
    },
  });

  if (previous) {
    await deleteAsset(previous.publicId, previous.resourceType);
    await prisma.document.delete({ where: { id: previous.id } });
  }

  return updated;
}

/** Documents the NGO uploaded, newest first. */
export async function listMyDocuments(userId: string) {
  const { id } = await requireOwnedOrganization(userId);

  const rows = await prisma.document.findMany({
    where: {
      organizationId: id,
      // Hide the internal logo/cover tracking rows.
      NOT: { title: { in: ["__logo__", "__cover__"] } },
    },
    orderBy: { createdAt: "desc" },
  });

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    url: row.url,
    bytes: row.bytes,
    format: row.format,
    isPublic: row.isPublic,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function uploadDocument(
  userId: string,
  input: UploadDocumentInput,
  file: { buffer: Buffer; mimetype: string },
) {
  const { id } = await requireOwnedOrganization(userId);

  // Gallery images must be images; legal paperwork may be a PDF or a scan.
  const isImage = file.mimetype.startsWith("image/");
  const isPdf = file.mimetype === "application/pdf";

  if (input.type === "GALLERY_IMAGE" && !isImage) {
    throw new HttpError(400, "Gallery items must be images.");
  }

  if (!isImage && !isPdf) {
    throw new HttpError(400, "Upload a PDF or an image.");
  }

  // Unbounded uploads let one account exhaust Cloudinary storage/bandwidth for
  // the whole platform. The internal __logo__/__cover__ tracking rows are
  // excluded, matching how listMyDocuments already hides them from the user.
  const MAX_DOCUMENTS_PER_ORG = 30;
  const documentCount = await prisma.document.count({
    where: {
      organizationId: id,
      NOT: { title: { in: ["__logo__", "__cover__"] } },
    },
  });

  if (documentCount >= MAX_DOCUMENTS_PER_ORG) {
    throw new HttpError(
      400,
      `You can upload at most ${MAX_DOCUMENTS_PER_ORG} documents. Delete an existing one first.`,
    );
  }

  const asset = await uploadBuffer(file.buffer, `organizations/${id}`);

  const row = await prisma.document.create({
    data: {
      organizationId: id,
      type: input.type,
      title: input.title,
      url: asset.url,
      publicId: asset.publicId,
      bytes: asset.bytes,
      format: asset.format,
      resourceType: asset.resourceType,
      // Only gallery imagery is public; legal documents stay private to the
      // NGO and platform admins.
      isPublic: input.type === "GALLERY_IMAGE",
    },
  });

  return {
    id: row.id,
    type: row.type,
    title: row.title,
    url: row.url,
    bytes: row.bytes,
    format: row.format,
    isPublic: row.isPublic,
    createdAt: row.createdAt.toISOString(),
  };
}

/* ── Impact metrics ───────────────────────────────────────────────────────── */

export async function listImpactMetrics(userId: string) {
  const { id } = await requireOwnedOrganization(userId);

  return prisma.impactMetric.findMany({
    where: { organizationId: id },
    orderBy: { sortOrder: "asc" },
    select: { id: true, label: true, value: true, unit: true, sortOrder: true },
  });
}

export async function createImpactMetric(
  userId: string,
  input: UpsertImpactMetricInput,
) {
  const { id } = await requireOwnedOrganization(userId);

  const count = await prisma.impactMetric.count({
    where: { organizationId: id },
  });

  // Capped because the public profile lays these out in a fixed row; an
  // unbounded list would silently wreck that layout.
  if (count >= MAX_IMPACT_METRICS) {
    throw new HttpError(
      400,
      `You can show at most ${MAX_IMPACT_METRICS} impact metrics.`,
    );
  }

  return prisma.impactMetric.create({
    data: {
      organizationId: id,
      label: input.label,
      value: input.value,
      unit: input.unit?.trim() || null,
      // Append to the end of the current order.
      sortOrder: count,
    },
    select: { id: true, label: true, value: true, unit: true, sortOrder: true },
  });
}

export async function updateImpactMetric(
  userId: string,
  metricId: string,
  input: UpsertImpactMetricInput,
) {
  const { id } = await requireOwnedOrganization(userId);

  // updateMany scoped by organizationId means another NGO's id simply matches
  // nothing, rather than us fetching a row and hoping we remember to check it.
  const result = await prisma.impactMetric.updateMany({
    where: { id: metricId, organizationId: id },
    data: {
      label: input.label,
      value: input.value,
      unit: input.unit?.trim() || null,
    },
  });

  if (result.count === 0) throw new HttpError(404, "Metric not found");

  return prisma.impactMetric.findUniqueOrThrow({
    where: { id: metricId },
    select: { id: true, label: true, value: true, unit: true, sortOrder: true },
  });
}

export async function deleteImpactMetric(userId: string, metricId: string) {
  const { id } = await requireOwnedOrganization(userId);

  const result = await prisma.impactMetric.deleteMany({
    where: { id: metricId, organizationId: id },
  });

  if (result.count === 0) throw new HttpError(404, "Metric not found");

  return { deleted: true };
}

/* ── Team members ─────────────────────────────────────────────────────────── */

export async function listTeamMembers(userId: string) {
  const { id } = await requireOwnedOrganization(userId);

  return prisma.teamMember.findMany({
    where: { organizationId: id },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      role: true,
      bio: true,
      photoUrl: true,
      linkedinUrl: true,
      sortOrder: true,
    },
  });
}

export async function createTeamMember(
  userId: string,
  input: UpsertTeamMemberInput,
) {
  const { id } = await requireOwnedOrganization(userId);

  const count = await prisma.teamMember.count({ where: { organizationId: id } });

  if (count >= MAX_TEAM_MEMBERS) {
    throw new HttpError(
      400,
      `You can list at most ${MAX_TEAM_MEMBERS} team members.`,
    );
  }

  return prisma.teamMember.create({
    data: {
      organizationId: id,
      name: input.name,
      role: input.role,
      bio: input.bio?.trim() || null,
      linkedinUrl: input.linkedinUrl?.trim() || null,
      sortOrder: count,
    },
    select: {
      id: true,
      name: true,
      role: true,
      bio: true,
      photoUrl: true,
      linkedinUrl: true,
      sortOrder: true,
    },
  });
}

export async function updateTeamMember(
  userId: string,
  memberId: string,
  input: UpsertTeamMemberInput,
) {
  const { id } = await requireOwnedOrganization(userId);

  const result = await prisma.teamMember.updateMany({
    where: { id: memberId, organizationId: id },
    data: {
      name: input.name,
      role: input.role,
      bio: input.bio?.trim() || null,
      linkedinUrl: input.linkedinUrl?.trim() || null,
    },
  });

  if (result.count === 0) throw new HttpError(404, "Team member not found");

  return prisma.teamMember.findUniqueOrThrow({
    where: { id: memberId },
    select: {
      id: true,
      name: true,
      role: true,
      bio: true,
      photoUrl: true,
      linkedinUrl: true,
      sortOrder: true,
    },
  });
}

/** Upload or replace a team member's photo. */
export async function updateTeamMemberPhoto(
  userId: string,
  memberId: string,
  file: { buffer: Buffer; mimetype: string },
) {
  const { id } = await requireOwnedOrganization(userId);

  const member = await prisma.teamMember.findUnique({
    where: { id: memberId },
  });

  if (!member || member.organizationId !== id) {
    throw new HttpError(404, "Team member not found");
  }

  if (!file.mimetype.startsWith("image/")) {
    throw new HttpError(400, "That file is not an image.");
  }

  const asset = await uploadBuffer(file.buffer, `organizations/${id}/team`, "image");

  const updated = await prisma.teamMember.update({
    where: { id: member.id },
    data: { photoUrl: asset.url, photoPublicId: asset.publicId },
    select: {
      id: true,
      name: true,
      role: true,
      bio: true,
      photoUrl: true,
      linkedinUrl: true,
      sortOrder: true,
    },
  });

  // Replace only after the new photo is safely saved.
  if (member.photoPublicId) {
    await deleteAsset(member.photoPublicId);
  }

  return updated;
}

export async function deleteTeamMember(userId: string, memberId: string) {
  const { id } = await requireOwnedOrganization(userId);

  const member = await prisma.teamMember.findUnique({
    where: { id: memberId },
  });

  if (!member || member.organizationId !== id) {
    throw new HttpError(404, "Team member not found");
  }

  if (member.photoPublicId) {
    await deleteAsset(member.photoPublicId);
  }

  await prisma.teamMember.delete({ where: { id: member.id } });

  return { deleted: true };
}

export async function deleteDocument(userId: string, documentId: string) {
  const { id } = await requireOwnedOrganization(userId);

  const document = await prisma.document.findUnique({
    where: { id: documentId },
  });

  // Scoping the check to the caller's own organisation means a guessed id from
  // another NGO reads as "not found" rather than confirming it exists.
  if (!document || document.organizationId !== id) {
    throw new HttpError(404, "Document not found");
  }

  await deleteAsset(document.publicId, document.resourceType);
  await prisma.document.delete({ where: { id: document.id } });

  return { deleted: true };
}

/* ── Donations received (Phase 3c) ────────────────────────────────────────── */

/**
 * Donations made TO the signed-in NGO's organisation.
 *
 * ── Anonymity is enforced here, in the service ───────────────────────────────
 * When a donor ticks "donate anonymously" the NGO must not learn who they are.
 * That stripping happens at this layer rather than in the UI, because a name
 * that never leaves the database cannot be leaked by a component that forgets
 * to hide it, by the network tab, or by a future endpoint reusing this shape.
 */
export async function listOrganizationDonations(
  userId: string,
  page = 1,
  pageSize = 20,
) {
  const organization = await requireOwnedOrganization(userId);

  const where = {
    organizationId: organization.id,
    // Pending and failed attempts are noise for an NGO — they only care about
    // money that actually arrived.
    status: "SUCCEEDED" as const,
  };

  const [rows, total] = await prisma.$transaction([
    prisma.donation.findMany({
      where,
      orderBy: { completedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        amountMinor: true,
        currency: true,
        message: true,
        anonymous: true,
        receiptNumber: true,
        completedAt: true,
        donor: { select: { name: true } },
      },
    }),
    prisma.donation.count({ where }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      amountMinor: row.amountMinor,
      currency: row.currency,
      message: row.message,
      anonymous: row.anonymous,
      receiptNumber: row.receiptNumber,
      completedAt: row.completedAt?.toISOString() ?? null,
      // The donor's real name is dropped entirely for anonymous gifts.
      donorName: row.anonymous ? null : row.donor.name,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/* ── Analytics (Phase 3d) ─────────────────────────────────────────────────── */

interface MonthlyPoint {
  /** "2026-08" — sortable and unambiguous across locales. */
  month: string;
  totalMinor: number;
  count: number;
}

/**
 * Twelve months of donation history, plus headline figures and top supporters.
 *
 * The monthly series is built with one grouped SQL query rather than pulling
 * every donation into Node and reducing there — the database is far better at
 * this, and the payload stays constant-size however many donations exist.
 */
export async function getOrganizationAnalytics(userId: string) {
  const organization = await requireOwnedOrganization(userId);

  // Start of the month 11 months ago, so the series always spans 12 buckets.
  const now = new Date();
  const since = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1),
  );

  const [aggregate, monthlyRows, topDonorRows, anonymousAggregate] =
    await Promise.all([
      prisma.donation.aggregate({
        where: { organizationId: organization.id, status: "SUCCEEDED" },
        _sum: { amountMinor: true },
        _avg: { amountMinor: true },
        _count: true,
      }),

      prisma.$queryRaw<
        Array<{ month: Date; total: bigint; count: bigint }>
      >`
        SELECT date_trunc('month', "completedAt") AS month,
               SUM("amountMinor")                 AS total,
               COUNT(*)                           AS count
        FROM "Donation"
        WHERE "organizationId" = ${organization.id}
          AND "status" = 'SUCCEEDED'
          AND "completedAt" >= ${since}
        GROUP BY 1
        ORDER BY 1
      `,

      /*
       * Only NON-anonymous donations feed the leaderboard. Aggregating
       * anonymous gifts by donor would re-identify them the moment an NGO
       * cross-referenced the total against a name.
       */
      prisma.donation.groupBy({
        by: ["donorId"],
        where: {
          organizationId: organization.id,
          status: "SUCCEEDED",
          anonymous: false,
        },
        _sum: { amountMinor: true },
        _count: true,
        orderBy: { _sum: { amountMinor: "desc" } },
        take: 5,
      }),

      prisma.donation.aggregate({
        where: {
          organizationId: organization.id,
          status: "SUCCEEDED",
          anonymous: true,
        },
        _sum: { amountMinor: true },
        _count: true,
      }),
    ]);

  // Resolve the top donors' names in one query rather than N.
  const donorNames = new Map(
    (
      await prisma.user.findMany({
        where: { id: { in: topDonorRows.map((r) => r.donorId) } },
        select: { id: true, name: true },
      })
    ).map((u) => [u.id, u.name]),
  );

  /*
   * Fill the gaps. SQL only returns months that HAVE donations, but a chart
   * with missing months silently misleads — a quiet June should read as a zero
   * bar, not vanish and make the year look busier than it was.
   */
  const byMonth = new Map(
    monthlyRows.map((row) => [
      row.month.toISOString().slice(0, 7),
      { total: Number(row.total), count: Number(row.count) },
    ]),
  );

  const monthly: MonthlyPoint[] = [];

  for (let i = 0; i < 12; i += 1) {
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + i, 1),
    );
    const key = date.toISOString().slice(0, 7);
    const found = byMonth.get(key);

    monthly.push({
      month: key,
      totalMinor: found?.total ?? 0,
      count: found?.count ?? 0,
    });
  }

  return {
    totalRaisedMinor: aggregate._sum.amountMinor ?? 0,
    donationCount: aggregate._count,
    averageDonationMinor: Math.round(aggregate._avg.amountMinor ?? 0),
    currency: "inr",
    monthly,
    topDonors: topDonorRows.map((row) => ({
      name: donorNames.get(row.donorId) ?? "Supporter",
      totalMinor: row._sum.amountMinor ?? 0,
      count: row._count,
    })),
    anonymous: {
      totalMinor: anonymousAggregate._sum.amountMinor ?? 0,
      count: anonymousAggregate._count,
    },
  };
}
