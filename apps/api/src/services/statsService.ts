import type { PublicStats } from "@impactbridge/shared";
import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";

/**
 * Cached because this is unauthenticated and sits on the landing page — the
 * one route a crawler or a burst of traffic will hit hardest. The numbers move
 * slowly (a new organisation, an occasional donation), so a stale minute costs
 * nothing and spares the database five aggregate queries per visitor.
 */
const TTL_MS = 60_000;

let cache: { value: PublicStats; expiresAt: number } | null = null;

export async function getPublicStats(): Promise<PublicStats> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;

  const now = new Date();

  const [organizations, verifiedOrganizations, openGrants, raised, stateRows] =
    await Promise.all([
      prisma.organization.count({ where: { status: "ACTIVE" } }),
      prisma.organization.count({ where: { status: "ACTIVE", verified: true } }),
      // "Open" means both flagged OPEN *and* still accepting — a grant past its
      // deadline is not an opportunity, whatever its status column says.
      prisma.grant.count({ where: { status: "OPEN", deadline: { gt: now } } }),
      prisma.donation.aggregate({
        where: { status: "SUCCEEDED" },
        _sum: { amountMinor: true },
      }),
      /*
       * `state` is free text, so DISTINCT alone would count "Karnataka" and
       * "karnataka " as two. Trimmed and lower-cased before counting; empty
       * strings are excluded alongside NULLs, which a bare `not: null` misses.
       */
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(DISTINCT LOWER(TRIM("state"))) AS count
        FROM "Organization"
        WHERE "status" = 'ACTIVE'
          AND "state" IS NOT NULL
          AND TRIM("state") <> ''
      `,
    ]);

  const value: PublicStats = {
    organizations,
    verifiedOrganizations,
    openGrants,
    totalRaisedMinor: raised._sum.amountMinor ?? 0,
    // Raw aggregates come back as BigInt on Postgres; JSON cannot serialise it.
    states: Number(stateRows[0]?.count ?? 0),
    currency: env.CURRENCY,
  };

  cache = { value, expiresAt: Date.now() + TTL_MS };
  return value;
}
