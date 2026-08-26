import { Router } from "express";
import { z } from "zod";
import {
  createDonationSchema,
  verifyPaymentSchema,
  formatMoney,
} from "@impactbridge/shared";
import * as donationService from "../services/donationService.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";
import { rateLimit } from "../middleware/rateLimit.js";

export const donationRouter: Router = Router();

/** Every route here requires a signed-in donor. */
donationRouter.use(requireAuth, requireRole("DONOR"));

/**
 * `?page=abc` becomes `skip: NaN` and `?page=0`/negative values corrupt
 * Prisma's pagination silently instead of erroring — coerce and clamp at the
 * boundary so bad input becomes a sane default, not a 500.
 */
const pageSchema = z.coerce.number().int().min(1).catch(1);
const pageSizeSchema = (max: number, fallback: number) =>
  z.coerce.number().int().min(1).max(max).catch(fallback);

/**
 * POST /api/donations/checkout — start a donation.
 *
 * Returns a CheckoutInstruction: either params to open Razorpay's in-page
 * Checkout modal, or a redirect URL for the mock gateway. Card details are
 * entered at the gateway, never on our domain and never through our servers,
 * which keeps us out of PCI scope entirely.
 */
donationRouter.post(
  "/checkout",
  // Creating orders is a paid API call (on Razorpay); throttle abuse.
  rateLimit({ windowMs: 60_000, max: 10 }),
  async (req, res, next) => {
    try {
      // The amount is re-validated here. The browser's check is UX only — a
      // hostile client can POST any number it likes.
      const input = createDonationSchema.parse(req.body);
      const result = await donationService.createDonationOrder(
        req.user!.id,
        input,
      );
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/donations/verify — confirm a payment the browser just completed.
 *
 * Razorpay Checkout.js calls back into the page with these three fields on
 * success. We treat them as a CLAIM, not a fact: verifyAndCompletePayment
 * checks the signature and re-fetches the payment from Razorpay before
 * crediting anything. This is what lets the donation confirm instantly even
 * though we have no public webhook URL on localhost — the webhook (when
 * configured) is a second, independent path to the same result.
 */
donationRouter.post("/verify", async (req, res, next) => {
  try {
    const input = verifyPaymentSchema.parse(req.body);
    const result = await donationService.verifyAndCompletePayment(
      req.user!.id,
      input,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/donations — the signed-in donor's history.
 *
 * listDonations reconciles up to 5 stuck PENDING rows against the gateway on
 * every call, so an unthrottled request rate here is really an unbounded rate
 * of outbound Razorpay calls. Throttled the same way checkout is.
 */
donationRouter.get(
  "/",
  rateLimit({ windowMs: 60_000, max: 30 }),
  async (req, res, next) => {
    try {
      const page = pageSchema.parse(req.query.page);
      const pageSize = pageSizeSchema(50, 10).parse(req.query.pageSize);
      res.json(
        await donationService.listDonations(req.user!.id, page, pageSize),
      );
    } catch (err) {
      next(err);
    }
  },
);

/** GET /api/donations/stats — headline totals for the donor dashboard. */
donationRouter.get("/stats", async (req, res, next) => {
  try {
    res.json(await donationService.getDonorStats(req.user!.id));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/donations/by-order/:orderId — used by the post-payment page.
 *
 * The webhook (if configured) may land a moment before or after the browser
 * callback, so the success page polls this until the status flips to
 * SUCCEEDED.
 */
donationRouter.get("/by-order/:orderId", async (req, res, next) => {
  try {
    res.json(
      await donationService.getDonationByOrderId(
        req.params.orderId,
        req.user!.id,
      ),
    );
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/donations/:id/receipt — a printable HTML receipt.
 *
 * Served as HTML rather than a generated PDF so it opens instantly in a tab and
 * the browser's own "Save as PDF" handles the conversion — no extra dependency,
 * and it prints correctly on any device.
 */
donationRouter.get("/:id/receipt", async (req, res, next) => {
  try {
    const donation = await donationService.getDonationForReceipt(
      req.params.id,
      req.user!.id,
    );

    res.type("html").send(renderReceipt(donation));
  } catch (err) {
    next(err);
  }
});

type ReceiptDonation = Awaited<
  ReturnType<typeof donationService.getDonationForReceipt>
>;

/** Escape user-supplied text before interpolating it into HTML (XSS guard). */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderReceipt(donation: ReceiptDonation): string {
  const date = (donation.completedAt ?? donation.createdAt).toLocaleDateString(
    "en-IN",
    { day: "numeric", month: "long", year: "numeric" },
  );

  const location = [donation.organization.city, donation.organization.state]
    .filter(Boolean)
    .join(", ");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Receipt ${escapeHtml(donation.receiptNumber ?? donation.id)} · ImpactBridge</title>
<style>
  /*
   * Self-contained and offline-safe: no webfont request, no external asset.
   * A receipt is a document someone may open months later, print, or save —
   * it must render identically with no network at all. The site's Fraunces /
   * Manrope pairing is approximated with system stacks for the same reason.
   */
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    margin: 0; padding: 56px 24px; background: #f6f4ef; color: #14212a;
    -webkit-font-smoothing: antialiased;
  }
  .sheet {
    max-width: 660px; margin: 0 auto; background: #fff;
    border: 1px solid #e5e0d6; padding: 56px 52px;
  }
  .brand {
    font-size: 13px; font-weight: 800; letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .brand span { color: #0b6b60; }
  .eyebrow {
    margin: 44px 0 0; font-size: 11px; font-weight: 700; letter-spacing: 0.16em;
    text-transform: uppercase; color: #6b7a82;
  }
  h1 {
    font-family: ui-serif, Georgia, "Times New Roman", serif;
    font-size: 40px; line-height: 1.05; letter-spacing: -0.02em;
    margin: 14px 0 0; font-weight: 600;
  }
  /* Tabular figures so the reference and the amount align like a ledger. */
  .ref {
    margin: 14px 0 0; font-size: 14px; color: #6b7a82;
    font-variant-numeric: tabular-nums; letter-spacing: 0.04em;
  }
  .rule { height: 1px; background: #e5e0d6; margin: 40px 0 0; }
  .row {
    display: flex; justify-content: space-between; gap: 24px;
    padding: 16px 0; border-bottom: 1px solid #f0ece4;
  }
  .row:last-child { border-bottom: 0; }
  .label {
    color: #6b7a82; font-size: 11px; font-weight: 700;
    letter-spacing: 0.12em; text-transform: uppercase; padding-top: 3px;
  }
  .value { text-align: right; font-size: 15px; font-weight: 600; }
  .value .sub { display: block; font-weight: 400; font-size: 13px; color: #6b7a82; margin-top: 3px; }
  .quote { font-weight: 400; font-style: italic; color: #37474f; }
  .total {
    margin-top: 36px; padding-top: 24px; border-top: 2px solid #14212a;
    display: flex; justify-content: space-between; align-items: baseline; gap: 16px;
  }
  .total .amount {
    font-size: 42px; font-weight: 800; letter-spacing: -0.03em;
    font-variant-numeric: tabular-nums;
  }
  .note {
    margin-top: 40px; padding-top: 20px; border-top: 1px solid #f0ece4;
    font-size: 12px; line-height: 1.7; color: #6b7a82;
  }
  .actions { margin-top: 28px; }
  button {
    height: 44px; padding: 0 22px; border: 0; border-radius: 8px;
    background: #0b6b60; color: #fff; font-size: 14px; font-weight: 600;
    cursor: pointer; font-family: inherit;
  }
  @media print {
    body { padding: 0; background: #fff; }
    .sheet { border: 0; padding: 24px; max-width: none; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
  <div class="sheet">
    <div class="brand">Impact<span>Bridge</span></div>

    <p class="eyebrow">Donation receipt</p>
    <h1>Thank you.</h1>
    <p class="ref">${escapeHtml(donation.receiptNumber ?? donation.id)}</p>

    <div class="rule"></div>

    <div>
      <div class="row">
        <span class="label">From</span>
        <span class="value">${escapeHtml(donation.donor.name)}
          <span class="sub">${escapeHtml(donation.donor.email)}</span>
        </span>
      </div>
      <div class="row">
        <span class="label">To</span>
        <span class="value">${escapeHtml(donation.organization.name)}${
          location
            ? `<span class="sub">${escapeHtml(location)}</span>`
            : ""
        }</span>
      </div>
      <div class="row">
        <span class="label">Date</span>
        <span class="value">${escapeHtml(date)}</span>
      </div>
      <div class="row">
        <span class="label">Status</span>
        <span class="value">Paid</span>
      </div>
      ${
        donation.message
          ? `<div class="row"><span class="label">Message</span><span class="value quote">&ldquo;${escapeHtml(donation.message)}&rdquo;</span></div>`
          : ""
      }
    </div>

    <div class="total">
      <span class="label" style="padding-top:0;">Total given</span>
      <span class="amount">${escapeHtml(
        formatMoney(donation.amountMinor, donation.currency, {
          showDecimals: true,
        }),
      )}</span>
    </div>

    <p class="note">
      Issued by ImpactBridge, a demonstration platform. Payments are processed
      in <strong>test mode</strong> and no real funds were transferred. This
      document is not valid for tax purposes.
    </p>

    <div class="actions no-print">
      <button onclick="window.print()">Print or save as PDF</button>
    </div>
  </div>
</body>
</html>`;
}
