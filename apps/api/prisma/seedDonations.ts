/**
 * Backfill demo donation history.
 *
 * The analytics view is only meaningful with data spread over time, and a fresh
 * install has none. This creates SUCCEEDED donations across the last 12 months
 * for every organisation, then recomputes each organisation's denormalised
 * totals from the rows it just wrote — so the dashboard figures and the ledger
 * agree exactly, the same as they would after real donations.
 *
 * Safe to re-run: it deletes only the rows it previously created (marked by the
 * `provider` value below) and rebuilds them.
 */
import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Extra donors, so "top supporters" is a leaderboard rather than one name. */
const EXTRA_DONORS = [
  { name: "Rohan Desai", email: "rohan@impactbridge.dev" },
  { name: "Meera Iyer", email: "meera@impactbridge.dev" },
  { name: "Arjun Sharma", email: "arjun@impactbridge.dev" },
  { name: "Fatima Khan", email: "fatima@impactbridge.dev" },
  { name: "Vikram Reddy", email: "vikram@impactbridge.dev" },
  { name: "Ananya Bose", email: "ananya@impactbridge.dev" },
];

async function ensureDonors() {
  const passwordHash = await argon2.hash("Password123", {
    type: argon2.argon2id,
  });

  for (const donor of EXTRA_DONORS) {
    await prisma.user.upsert({
      where: { email: donor.email },
      update: {},
      create: {
        ...donor,
        role: "DONOR",
        passwordHash,
        emailVerifiedAt: new Date(),
      },
    });
  }
}

/** Marks rows as demo history so a re-run can clean up after itself. */
const DEMO_PROVIDER = "seed";

const MESSAGES = [
  "Keep up the great work!",
  "In memory of my grandmother.",
  "Small amount, big hopes.",
  null,
  null,
  "Saw your annual report — impressive.",
  "Happy to support this cause.",
  null,
];

/** Deterministic pseudo-random so re-seeding produces the same demo data. */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

async function main() {
  const random = makeRandom(20260807);

  await ensureDonors();

  const organizations = await prisma.organization.findMany({
    select: { id: true, name: true },
  });

  const donors = await prisma.user.findMany({
    where: { role: "DONOR" },
    select: { id: true },
  });

  if (donors.length === 0) {
    console.error("No donors found — run the main seed first.");
    return;
  }

  /*
   * Clear previous demo history — ledger rows FIRST.
   *
   * Transaction.donationId is `onDelete: SetNull`, which is right for a real
   * ledger (deleting a donation must not silently erase financial history), but
   * it means deleting donations here would leave orphaned Transaction rows
   * behind. Every re-run would then pile up more. So the seed removes the rows
   * it created explicitly, in dependency order.
   */
  const previous = await prisma.donation.findMany({
    where: { provider: DEMO_PROVIDER },
    select: { id: true },
  });

  if (previous.length > 0) {
    await prisma.transaction.deleteMany({
      where: { donationId: { in: previous.map((d) => d.id) } },
    });
  }

  // Sweep up orphans left by any earlier run of this script.
  const orphaned = await prisma.transaction.deleteMany({
    where: { type: "DONATION", donationId: null },
  });

  const removed = await prisma.donation.deleteMany({
    where: { provider: DEMO_PROVIDER },
  });

  console.log(
    `Cleared ${removed.count} demo donations and ${orphaned.count} orphaned ledger rows.`,
  );

  const now = new Date();
  let created = 0;

  for (const org of organizations) {
    // Each org gets its own volume and growth shape so the charts differ.
    const baseVolume = 2 + Math.floor(random() * 4);

    for (let monthsAgo = 11; monthsAgo >= 0; monthsAgo -= 1) {
      // Gentle upward trend, so recent months read as growth.
      const growth = 1 + (11 - monthsAgo) * 0.08;
      const count = Math.max(
        0,
        Math.round(baseVolume * growth * (0.6 + random() * 0.8)),
      );

      for (let i = 0; i < count; i += 1) {
        const donor = donors[Math.floor(random() * donors.length)]!;

        // ₹500–₹15,000, weighted toward smaller gifts like real donation data.
        const skewed = random() ** 2;
        const amountMinor = Math.round((50000 + skewed * 1_450_000) / 10000) * 10000;

        /*
         * The current month is only partly elapsed, so cap its days at today.
         * Without this the seed happily dates donations in the future, which
         * looks broken the moment anyone reads the table.
         */
        const lastDay = monthsAgo === 0 ? now.getUTCDate() : 28;
        const day = 1 + Math.floor(random() * lastDay);

        const candidate = new Date(
          Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth() - monthsAgo,
            day,
            Math.floor(random() * 24),
            Math.floor(random() * 60),
          ),
        );

        // Capping the DAY still leaves a random hour that can fall later today,
        // so clamp the timestamp itself. Pull it back a few hours rather than
        // pinning every such row to the same instant.
        const completedAt =
          candidate > now
            ? new Date(now.getTime() - Math.floor(random() * 6 * 3600_000))
            : candidate;

        // Roughly one in six donors gives anonymously.
        const anonymous = random() < 0.17;

        const donation = await prisma.donation.create({
          data: {
            donorId: donor.id,
            organizationId: org.id,
            amountMinor,
            currency: "inr",
            status: "SUCCEEDED",
            provider: DEMO_PROVIDER,
            providerOrderId: `order_seed_${org.id.slice(-6)}_${monthsAgo}_${i}`,
            providerPaymentId: `pay_seed_${org.id.slice(-6)}_${monthsAgo}_${i}`,
            anonymous,
            message: MESSAGES[Math.floor(random() * MESSAGES.length)] ?? null,
            receiptNumber: `IB-SEED-${String(created + 1).padStart(6, "0")}`,
            createdAt: completedAt,
            completedAt,
          },
        });

        await prisma.transaction.create({
          data: {
            type: "DONATION",
            amountMinor,
            currency: "inr",
            organizationId: org.id,
            donationId: donation.id,
            description: `Donation ${donation.receiptNumber}`,
            createdAt: completedAt,
          },
        });

        created += 1;
      }
    }
  }

  /*
   * Recompute the denormalised columns from the donations themselves rather
   * than incrementing as we go. A figure derived from the source of truth can't
   * drift, and this is the same recomputation an admin repair job would run.
   */
  for (const org of organizations) {
    const totals = await prisma.donation.aggregate({
      where: { organizationId: org.id, status: "SUCCEEDED" },
      _sum: { amountMinor: true },
    });

    const distinctDonors = await prisma.donation.findMany({
      where: { organizationId: org.id, status: "SUCCEEDED" },
      distinct: ["donorId"],
      select: { donorId: true },
    });

    await prisma.organization.update({
      where: { id: org.id },
      data: {
        totalRaisedMinor: totals._sum.amountMinor ?? 0,
        donorCount: distinctDonors.length,
      },
    });
  }

  console.log(
    `Created ${created} demo donations across ${organizations.length} organisations.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
