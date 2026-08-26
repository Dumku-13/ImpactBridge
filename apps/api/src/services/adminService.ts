import type { Role } from "@impactbridge/shared";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/errorHandler.js";
import { recordAudit } from "./auditService.js";
import { notify } from "./notificationService.js";

/**
 * Platform administration.
 *
 * Every state-changing function here does three things in ONE transaction: make
 * the change, write the audit row, and (where a user is affected) create the
 * notification. Splitting them would allow an organisation to be suspended with
 * no record of who did it — exactly the question that gets asked afterwards.
 */

/* ── Organisations ────────────────────────────────────────────────────────── */

export async function listOrganizationsForAdmin(
  filter: "all" | "unverified" | "suspended" = "all",
  page = 1,
  pageSize = 20,
) {
  const where =
    filter === "unverified"
      ? { verified: false, status: { not: "SUSPENDED" as const } }
      : filter === "suspended"
        ? { status: "SUSPENDED" as const }
        : {};

  const [rows, total] = await prisma.$transaction([
    prisma.organization.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        slug: true,
        name: true,
        mission: true,
        city: true,
        state: true,
        verified: true,
        verifiedAt: true,
        status: true,
        totalRaisedMinor: true,
        donorCount: true,
        createdAt: true,
        owner: { select: { id: true, name: true, email: true } },
        _count: { select: { documents: true, donations: true } },
      },
    }),
    prisma.organization.count({ where }),
  ]);

  return {
    items: rows.map((row) => ({
      ...row,
      verifiedAt: row.verifiedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      documentCount: row._count.documents,
      donationCount: row._count.donations,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function setOrganizationVerified(
  adminId: string,
  organizationId: string,
  verified: boolean,
  reason?: string,
) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true, verified: true, ownerId: true, slug: true },
  });

  if (!organization) throw new HttpError(404, "Organisation not found");

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.organization.update({
      where: { id: organizationId },
      data: {
        verified,
        // Written together with the flag — see the schema note on why both.
        verifiedAt: verified ? new Date() : null,
      },
      select: { id: true, name: true, verified: true, verifiedAt: true },
    });

    await recordAudit(
      {
        actorId: adminId,
        action: verified
          ? "ORGANIZATION_VERIFIED"
          : "ORGANIZATION_UNVERIFIED",
        targetType: "Organization",
        targetId: organization.id,
        targetName: organization.name,
        reason: reason ?? null,
      },
      tx,
    );

    if (verified) {
      await notify(
        {
          userId: organization.ownerId,
          type: "ORGANIZATION_VERIFIED",
          title: "Your organisation is verified",
          body: `${organization.name} is now verified and eligible for verified-only grants.`,
          link: `/ngo/${organization.slug}`,
        },
        tx,
      );
    }

    return result;
  });

  return {
    ...updated,
    verifiedAt: updated.verifiedAt?.toISOString() ?? null,
  };
}

export async function setOrganizationSuspended(
  adminId: string,
  organizationId: string,
  suspended: boolean,
  reason?: string,
) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true, status: true, ownerId: true },
  });

  if (!organization) throw new HttpError(404, "Organisation not found");

  /*
   * A suspension without a stated reason is useless three months later, when
   * someone has to explain the decision. Required at the boundary rather than
   * left to the admin's discretion.
   */
  if (suspended && !reason?.trim()) {
    throw new HttpError(400, "A reason is required when suspending.");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.organization.update({
      where: { id: organizationId },
      data: { status: suspended ? "SUSPENDED" : "ACTIVE" },
      select: { id: true, name: true, status: true },
    });

    /*
     * Suspending the organisation must also end the owner's access, the same
     * as setUserSuspended does — otherwise the NGO admin keeps working with a
     * live access token until it naturally expires.
     */
    if (suspended) {
      await tx.refreshToken.updateMany({
        where: { userId: organization.ownerId, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: "LOGOUT" },
      });
    }

    await recordAudit(
      {
        actorId: adminId,
        action: suspended
          ? "ORGANIZATION_SUSPENDED"
          : "ORGANIZATION_REINSTATED",
        targetType: "Organization",
        targetId: organization.id,
        targetName: organization.name,
        reason: reason ?? null,
        metadata: { previousStatus: organization.status },
      },
      tx,
    );

    return result;
  });

  return updated;
}

/* ── Users ────────────────────────────────────────────────────────────────── */

export async function listUsers(
  search?: string,
  role?: Role,
  page = 1,
  pageSize = 20,
) {
  const where = {
    ...(role ? { role } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [rows, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        emailVerifiedAt: true,
        createdAt: true,
        // Never select passwordHash — it must not exist in any response shape.
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    items: rows.map((row) => ({
      ...row,
      emailVerified: row.emailVerifiedAt !== null,
      emailVerifiedAt: row.emailVerifiedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function setUserSuspended(
  adminId: string,
  userId: string,
  suspended: boolean,
  reason?: string,
) {
  if (userId === adminId) {
    throw new HttpError(400, "You cannot suspend your own account.");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, status: true },
  });

  if (!user) throw new HttpError(404, "User not found");

  /*
   * Admins suspending admins is how a platform locks itself out. Blocked
   * outright rather than made conditional on "how many admins are left",
   * which is racy under concurrent requests.
   */
  if (user.role === "PLATFORM_ADMIN") {
    throw new HttpError(403, "Platform admins cannot be suspended here.");
  }

  if (suspended && !reason?.trim()) {
    throw new HttpError(400, "A reason is required when suspending.");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.user.update({
      where: { id: userId },
      data: { status: suspended ? "SUSPENDED" : "ACTIVE" },
      select: { id: true, name: true, email: true, status: true },
    });

    /*
     * Suspending must actually end their access. Revoking refresh tokens kills
     * every session — otherwise a suspended user keeps working until their
     * access token expires, and can refresh indefinitely.
     */
    if (suspended) {
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: "LOGOUT" },
      });
    }

    await recordAudit(
      {
        actorId: adminId,
        action: suspended ? "USER_SUSPENDED" : "USER_REINSTATED",
        targetType: "User",
        targetId: user.id,
        targetName: `${user.name} <${user.email}>`,
        reason: reason ?? null,
        metadata: { previousStatus: user.status, role: user.role },
      },
      tx,
    );

    return result;
  });

  return updated;
}

/* ── Platform analytics ───────────────────────────────────────────────────── */

export async function getPlatformStats() {
  const [
    userCounts,
    organizationCount,
    verifiedCount,
    suspendedOrgCount,
    donationTotals,
    grantTotals,
    releasedTotals,
    applicationCount,
    monthlyRows,
  ] = await Promise.all([
    prisma.user.groupBy({ by: ["role"], _count: true }),
    prisma.organization.count(),
    prisma.organization.count({ where: { verified: true } }),
    prisma.organization.count({ where: { status: "SUSPENDED" } }),
    prisma.donation.aggregate({
      where: { status: "SUCCEEDED" },
      _sum: { amountMinor: true },
      _count: true,
    }),
    prisma.grant.aggregate({
      where: { status: { in: ["OPEN", "CLOSED", "COMPLETED"] } },
      _sum: { amountMinor: true },
      _count: true,
    }),
    prisma.transaction.aggregate({
      where: { type: "GRANT_RELEASE" },
      _sum: { amountMinor: true },
      _count: true,
    }),
    prisma.grantApplication.count({ where: { status: { not: "DRAFT" } } }),
    prisma.$queryRaw<Array<{ month: Date; total: bigint; count: bigint }>>`
      SELECT date_trunc('month', "createdAt") AS month,
             SUM("amountMinor")              AS total,
             COUNT(*)                        AS count
      FROM "Transaction"
      WHERE "createdAt" >= NOW() - INTERVAL '12 months'
      GROUP BY 1
      ORDER BY 1
    `,
  ]);

  const byRole = Object.fromEntries(
    userCounts.map((row) => [row.role, row._count]),
  );

  return {
    users: {
      total: userCounts.reduce((sum, row) => sum + row._count, 0),
      donors: byRole.DONOR ?? 0,
      ngoAdmins: byRole.NGO_ADMIN ?? 0,
      funders: byRole.FUNDER ?? 0,
      admins: byRole.PLATFORM_ADMIN ?? 0,
    },
    organizations: {
      total: organizationCount,
      verified: verifiedCount,
      pending: organizationCount - verifiedCount - suspendedOrgCount,
      suspended: suspendedOrgCount,
    },
    donations: {
      totalMinor: donationTotals._sum.amountMinor ?? 0,
      count: donationTotals._count,
    },
    grants: {
      committedMinor: grantTotals._sum.amountMinor ?? 0,
      count: grantTotals._count,
      applicationCount,
      releasedMinor: releasedTotals._sum.amountMinor ?? 0,
      releasedCount: releasedTotals._count,
    },
    monthly: monthlyRows.map((row) => ({
      month: row.month.toISOString().slice(0, 7),
      totalMinor: Number(row.total),
      count: Number(row.count),
    })),
    currency: "inr",
  };
}
