import type { Prisma } from "@prisma/client";
import type {
  CreateDonationInput,
  DonationListResponse,
  DonorStats,
} from "@impactbridge/shared";
import { prisma } from "../lib/prisma.js";
import { payments } from "../payments/index.js";
import type {
  CheckoutInstruction,
  NormalizedWebhookEvent,
} from "../payments/types.js";
import { env } from "../config/env.js";
import { HttpError } from "../middleware/errorHandler.js";
import { notify } from "./notificationService.js";

/**
 * ── How a donation actually completes ────────────────────────────────────────
 *
 *  1. Donor submits the form → we create a PENDING Donation row and ask the
 *     gateway for an order, then hand the browser a CheckoutInstruction.
 *  2. Donor pays at the gateway (we never see their card details).
 *  3. Confirmation arrives by EITHER of two independent paths:
 *       a. the browser posts the signed result to /api/donations/verify, or
 *       b. the gateway posts a signed webhook to /api/webhooks/payments.
 *     Both funnel into `confirmDonation`, which is idempotent — whichever
 *     arrives first does the work and the other becomes a no-op.
 *
 * Having two paths is deliberate. A webhook alone can't reach localhost without
 * a tunnel; a browser callback alone is lost if the donor closes the tab.
 * Neither path is ever *trusted*: both re-check with the gateway before
 * crediting anything. Treating an unverified redirect as confirmation is the
 * single most common way payment integrations silently lose money.
 */

/**
 * Claim the next receipt number for `year` — e.g. "IB-2026-000042".
 *
 * `ON CONFLICT … DO UPDATE` makes read-modify-write a single atomic statement:
 * the first caller inserts the year's row, every later one takes a row lock,
 * adds one, and gets its own number back. A concurrent donation blocks on that
 * lock until we commit, so two of them can never build the same string.
 *
 * It MUST be called with the `tx` of the transaction that marks the donation
 * SUCCEEDED. That is the whole point: the number is issued and the donation is
 * recorded in the same atomic unit, so a rollback returns the number to the
 * pool rather than burning it. Passing the plain `prisma` client would compile
 * fine and quietly reintroduce both bugs this replaced.
 */
async function nextReceiptNumber(
  tx: Prisma.TransactionClient,
  year: number,
): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ lastValue: number }>>`
    INSERT INTO "ReceiptCounter" ("year", "lastValue", "updatedAt")
    VALUES (${year}::int, 1, CURRENT_TIMESTAMP)
    ON CONFLICT ("year") DO UPDATE
      SET "lastValue" = "ReceiptCounter"."lastValue" + 1,
          "updatedAt" = CURRENT_TIMESTAMP
    RETURNING "lastValue"
  `;

  const lastValue = rows[0]?.lastValue;

  if (lastValue === undefined) {
    // Unreachable: INSERT … RETURNING always yields a row on either branch.
    // Throwing rather than emitting "IB-2026-undefined" keeps a malformed
    // receipt number out of the database if that ever stops being true.
    throw new Error(`Failed to allocate a receipt number for ${year}`);
  }

  return `IB-${year}-${String(lastValue).padStart(6, "0")}`;
}

export async function createDonationOrder(
  donorId: string,
  input: CreateDonationInput,
): Promise<{ donationId: string; checkout: CheckoutInstruction }> {
  const organization = await prisma.organization.findUnique({
    where: { id: input.organizationId },
    select: { id: true, name: true, slug: true, status: true },
  });

  if (!organization || organization.status !== "ACTIVE") {
    throw new HttpError(404, "Organisation not found");
  }

  const donor = await prisma.user.findUniqueOrThrow({
    where: { id: donorId },
    select: { name: true, email: true },
  });

  /*
   * Create the PENDING donation FIRST, so the row exists before the gateway can
   * possibly call us back. If we created the order first, a very fast webhook
   * could arrive before the donation was written and find nothing to update.
   */
  const donation = await prisma.donation.create({
    data: {
      donorId,
      organizationId: organization.id,
      amountMinor: input.amountMinor,
      currency: env.CURRENCY,
      status: "PENDING",
      provider: payments.name,
      message: input.message ?? null,
      anonymous: input.anonymous,
    },
  });

  try {
    const order = await payments.createOrder({
      donationId: donation.id,
      amountMinor: input.amountMinor,
      currency: env.CURRENCY,
      organizationName: organization.name,
      donorName: donor.name,
      donorEmail: donor.email,
    });

    await prisma.donation.update({
      where: { id: donation.id },
      data: { providerOrderId: order.providerOrderId },
    });

    return { donationId: donation.id, checkout: order.checkout };
  } catch (err) {
    // Don't leave an orphaned PENDING row if the gateway rejected the request.
    await prisma.donation.update({
      where: { id: donation.id },
      data: { status: "FAILED" },
    });
    throw err;
  }
}

/**
 * The browser-callback confirmation path.
 *
 * `verifyPayment` checks the signature AND re-fetches the payment from the
 * gateway, so nothing here trusts the client beyond the ids it supplied.
 */
export async function verifyAndCompletePayment(
  donorId: string,
  params: {
    providerOrderId: string;
    providerPaymentId: string;
    signature: string;
  },
): Promise<{ status: "SUCCEEDED" | "FAILED"; donationId: string }> {
  const donation = await prisma.donation.findUnique({
    where: { providerOrderId: params.providerOrderId },
  });

  if (!donation || donation.donorId !== donorId) {
    throw new HttpError(404, "Donation not found");
  }

  const verified = await payments.verifyPayment(params);

  if (verified.status !== "captured") {
    await prisma.donation.updateMany({
      where: { id: donation.id, status: "PENDING" },
      data: { status: "FAILED", providerPaymentId: verified.providerPaymentId },
    });
    return { status: "FAILED", donationId: donation.id };
  }

  /*
   * Never credit more than was actually paid. The gateway's amount is
   * authoritative; a mismatch means the order was tampered with.
   */
  if (verified.amountMinor !== donation.amountMinor) {
    throw new HttpError(400, "Paid amount does not match the donation");
  }

  /*
   * Amount alone is not enough — 1000 of one currency is not 1000 of another.
   * A mismatch means the order was created against a different currency than
   * the one recorded, and crediting it would silently overstate the
   * organisation's total.
   */
  if (verified.currency !== donation.currency) {
    throw new HttpError(400, "Paid currency does not match the donation");
  }

  await confirmDonation(donation.id, verified.providerPaymentId);

  return { status: "SUCCEEDED", donationId: donation.id };
}

/**
 * Handle a webhook whose signature the route has ALREADY verified.
 * This function must never be reachable with unverified input.
 */
export async function handleWebhookEvent(
  event: NormalizedWebhookEvent,
): Promise<void> {
  /*
   * Idempotency. Gateways guarantee at-least-once delivery: they retry on any
   * non-2xx response and can legitimately send the same event twice. Recording
   * the event id lets us skip work already done, so a retry can never double an
   * organisation's totals.
   */
  const alreadyProcessed = await prisma.processedWebhookEvent.findUnique({
    where: { id: event.id },
  });

  if (alreadyProcessed) {
    console.log(`[payments] event ${event.id} already processed — skipping`);
    return;
  }

  if (event.type === "payment.captured" && event.donationId) {
    const donation = await prisma.donation.findUnique({
      where: { id: event.donationId },
    });

    if (donation && donation.amountMinor === event.amountMinor) {
      await confirmDonation(donation.id, event.providerPaymentId, event.id);
      return;
    }

    console.error(
      `[payments] webhook ${event.id}: donation ${event.donationId} missing or amount mismatch`,
    );
  } else if (event.type === "payment.failed" && event.donationId) {
    await prisma.donation.updateMany({
      // Only move a still-pending donation — never overwrite a SUCCEEDED row
      // because a late "failed" event arrived out of order.
      where: { id: event.donationId, status: "PENDING" },
      data: { status: "FAILED" },
    });
  }

  // Record every event we've seen, including ones we deliberately ignore, so
  // the gateway stops retrying them.
  await prisma.processedWebhookEvent.upsert({
    where: { id: event.id },
    create: { id: event.id, type: event.rawType },
    update: {},
  });
}

/**
 * Mark a donation paid and update every derived figure — atomically.
 *
 * Safe to call twice: the first call flips the status, and any later call sees
 * SUCCEEDED and returns without touching the totals. That is what lets the
 * webhook and the browser callback race without double-counting.
 */
async function confirmDonation(
  donationId: string,
  providerPaymentId?: string,
  eventId?: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    /*
     * Re-read INSIDE the transaction. A status checked before the transaction
     * opened could already be stale by the time we write.
     */
    const donation = await tx.donation.findUnique({
      where: { id: donationId },
    });

    if (!donation || donation.status === "SUCCEEDED") {
      if (eventId) {
        await tx.processedWebhookEvent.upsert({
          where: { id: eventId },
          create: { id: eventId, type: "payment.captured" },
          update: {},
        });
      }
      return;
    }

    /*
     * One timestamp for both the number and the row. Two separate `new Date()`
     * calls either side of midnight on 31 December would stamp an IB-2026-
     * receipt on a donation whose completedAt says 2027 — and send that number
     * from the wrong year's counter.
     */
    const completedAt = new Date();
    const receiptNumber = await nextReceiptNumber(tx, completedAt.getFullYear());

    await tx.donation.update({
      where: { id: donation.id },
      data: {
        status: "SUCCEEDED",
        providerPaymentId: providerPaymentId ?? donation.providerPaymentId,
        receiptNumber,
        completedAt,
      },
    });

    await tx.transaction.create({
      data: {
        type: "DONATION",
        amountMinor: donation.amountMinor,
        currency: donation.currency,
        organizationId: donation.organizationId,
        donationId: donation.id,
        description: `Donation ${receiptNumber}`,
      },
    });

    /*
     * Has this donor given to this organisation before? If not, they're a new
     * supporter and donorCount goes up. Counting inside the transaction keeps
     * the denormalised figure exact.
     */
    const priorDonations = await tx.donation.count({
      where: {
        donorId: donation.donorId,
        organizationId: donation.organizationId,
        status: "SUCCEEDED",
        id: { not: donation.id },
      },
    });

    await tx.organization.update({
      where: { id: donation.organizationId },
      data: {
        // `increment` is an atomic SQL UPDATE … SET x = x + n, so two
        // simultaneous donations can't read the same value and overwrite each
        // other's write (a lost update).
        totalRaisedMinor: { increment: donation.amountMinor },
        ...(priorDonations === 0 ? { donorCount: { increment: 1 } } : {}),
      },
    });

    if (eventId) {
      await tx.processedWebhookEvent.upsert({
        where: { id: eventId },
        create: { id: eventId, type: "payment.captured" },
        update: {},
      });
    }

    /*
     * Tell the NGO inside the same transaction as the donation. If the
     * transaction rolls back the notification goes with it, so an NGO is never
     * told about money that wasn't actually recorded.
     */
    const organization = await tx.organization.findUnique({
      where: { id: donation.organizationId },
      select: { name: true, slug: true, ownerId: true },
    });

    if (organization) {
      await notify(
        {
          userId: organization.ownerId,
          type: "DONATION_RECEIVED",
          title: "You received a donation",
          body: `${donation.anonymous ? "An anonymous donor" : "A donor"} gave to ${organization.name}.`,
          link: "/ngo",
        },
        tx,
      );
    }

    console.log(
      `[payments] ✅ donation ${donation.id} confirmed — ${receiptNumber}`,
    );
  });
}

/** A donor's own donation history. */
/**
 * How long the donation list will wait on gateway reconciliation before
 * answering anyway. Long enough for a healthy gateway to reply and heal in
 * time; short enough that a slow or unreachable one can't stall the page.
 */
const RECONCILE_WAIT_MS = 250;

export async function listDonations(
  donorId: string,
  page = 1,
  pageSize = 10,
): Promise<DonationListResponse> {
  const where = { donorId };

  /*
   * Heal any stuck rows before listing. A donation left PENDING because its
   * confirmation was lost would otherwise sit on the dashboard forever, telling
   * a donor who HAS been charged that their gift never went through.
   *
   * Deliberately NOT time-limited. An earlier version only swept the last 24
   * hours, on the theory that an old pending row was abandoned rather than
   * lost — but the gateway is the authority on that, not the clock. A donor who
   * paid, lost the tab, and checked back a week later would have been told
   * their money never arrived, permanently. Oldest first, so a long-lost
   * payment is reached ahead of recent noise, and capped so one page load can't
   * fan out into an unbounded number of gateway calls.
   */
  const stale = await prisma.donation.findMany({
    where: {
      donorId,
      status: "PENDING",
      providerOrderId: { not: null },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      status: true,
      amountMinor: true,
      currency: true,
      providerOrderId: true,
    },
    take: 5,
  });

  /*
   * Bound how long the donor waits on the gateway, without ever dropping the
   * heal. Measured: with one stuck row this call took ~600ms against Razorpay
   * while every other endpoint on the page answered in 8–40ms, so the dashboard
   * paid a gateway round trip on EVERY load — and a row the gateway will never
   * confirm makes that permanent.
   *
   * Reconciliation still runs to completion in the background; we simply stop
   * blocking the response on it. Anything that lands after the deadline shows on
   * the next refetch a few seconds later, which is exactly how the donor would
   * have seen it anyway.
   */
  const healing = Promise.all(stale.map(reconcilePendingDonation)).catch(
    (err) => {
      // Best-effort by design — must not surface as an unhandled rejection.
      console.error("[payments] background reconcile failed:", err);
    },
  );

  await Promise.race([
    healing,
    new Promise((resolve) => setTimeout(resolve, RECONCILE_WAIT_MS)),
  ]);

  const [rows, total] = await prisma.$transaction([
    prisma.donation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        amountMinor: true,
        currency: true,
        status: true,
        message: true,
        anonymous: true,
        receiptNumber: true,
        createdAt: true,
        completedAt: true,
        organization: {
          select: {
            id: true,
            slug: true,
            name: true,
            logoUrl: true,
            coverUrl: true,
          },
        },
      },
    }),
    prisma.donation.count({ where }),
  ]);

  return {
    items: rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getDonorStats(donorId: string): Promise<DonorStats> {
  const [aggregate, distinctOrgs, bookmarkCount, followingCount] =
    await prisma.$transaction([
      // Only SUCCEEDED donations count toward the total — pending or failed
      // attempts must never inflate what a donor believes they've given.
      prisma.donation.aggregate({
        where: { donorId, status: "SUCCEEDED" },
        _sum: { amountMinor: true },
        _count: true,
      }),
      prisma.donation.findMany({
        where: { donorId, status: "SUCCEEDED" },
        distinct: ["organizationId"],
        select: { organizationId: true },
      }),
      prisma.bookmark.count({ where: { userId: donorId } }),
      prisma.follow.count({ where: { userId: donorId } }),
    ]);

  return {
    totalDonatedMinor: aggregate._sum.amountMinor ?? 0,
    currency: env.CURRENCY,
    donationCount: aggregate._count,
    organizationsSupported: distinctOrgs.length,
    bookmarkCount,
    followingCount,
  };
}

/**
 * Reconcile a still-PENDING donation against the gateway.
 *
 * The safety net for a captured payment whose confirmation never reached us —
 * the donor closed the tab, the network dropped, or webhooks aren't configured.
 * Asking the gateway directly needs no signature and trusts no client input, so
 * it is always safe to run. Called on every poll of the success page, which is
 * what makes a lost confirmation self-heal instead of silently costing the
 * donor money.
 */
async function reconcilePendingDonation(donation: {
  id: string;
  status: string;
  amountMinor: number;
  currency: string;
  providerOrderId: string | null;
}): Promise<void> {
  if (donation.status !== "PENDING" || !donation.providerOrderId) return;

  let captured;

  try {
    captured = await payments.findCapturedPayment(donation.providerOrderId);
  } catch (err) {
    // Never let a reconciliation failure break simply viewing the donation.
    console.error(`[payments] reconcile ${donation.id} failed:`, err);
    return;
  }

  if (!captured) return;

  if (
    captured.amountMinor !== donation.amountMinor ||
    captured.currency !== donation.currency
  ) {
    console.error(
      `[payments] reconcile ${donation.id}: gateway/donation mismatch ` +
        `(gateway ${captured.amountMinor} ${captured.currency} vs ` +
        `donation ${donation.amountMinor} ${donation.currency})`,
    );
    return;
  }

  console.log(
    `[payments] reconciled ${donation.id} — gateway reports captured payment ` +
      `${captured.providerPaymentId}`,
  );

  await confirmDonation(donation.id, captured.providerPaymentId);
}

/** Look up a donation by its gateway order id — powers the success page. */
export async function getDonationByOrderId(orderId: string, donorId: string) {
  /*
   * Check with the gateway BEFORE reading, so a payment that completed without
   * us hearing about it is confirmed by the time we return.
   */
  const pending = await prisma.donation.findUnique({
    where: { providerOrderId: orderId },
    select: {
      id: true,
      status: true,
      amountMinor: true,
      currency: true,
      providerOrderId: true,
      donorId: true,
    },
  });

  if (pending && pending.donorId === donorId) {
    await reconcilePendingDonation(pending);
  }

  const donation = await prisma.donation.findUnique({
    where: { providerOrderId: orderId },
    select: {
      id: true,
      amountMinor: true,
      currency: true,
      status: true,
      message: true,
      anonymous: true,
      receiptNumber: true,
      createdAt: true,
      completedAt: true,
      donorId: true,
      organization: {
        select: {
          id: true,
          slug: true,
          name: true,
          logoUrl: true,
          coverUrl: true,
        },
      },
    },
  });

  // A donation is only ever visible to the donor who made it.
  if (!donation || donation.donorId !== donorId) {
    throw new HttpError(404, "Donation not found");
  }

  const { donorId: _omit, ...rest } = donation;

  return {
    ...rest,
    createdAt: donation.createdAt.toISOString(),
    completedAt: donation.completedAt?.toISOString() ?? null,
  };
}

/** Fetch a single donation for receipt rendering. */
export async function getDonationForReceipt(
  donationId: string,
  donorId: string,
) {
  const donation = await prisma.donation.findUnique({
    where: { id: donationId },
    include: {
      organization: {
        select: { name: true, city: true, state: true, contactEmail: true },
      },
      donor: { select: { name: true, email: true } },
    },
  });

  if (!donation || donation.donorId !== donorId) {
    throw new HttpError(404, "Donation not found");
  }

  if (donation.status !== "SUCCEEDED") {
    throw new HttpError(
      400,
      "A receipt is only available once the payment has completed.",
    );
  }

  return donation;
}
