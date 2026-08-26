import express, { Router } from "express";
import { payments } from "../payments/index.js";
import { handleWebhookEvent } from "../services/donationService.js";

export const webhookRouter: Router = Router();

/**
 * POST /api/webhooks/payments
 *
 * ── Two things here are easy to get wrong and break payments silently ────────
 *
 * 1. RAW BODY. Both Razorpay and our mock gateway sign the exact bytes they
 *    sent. `express.json()` parses and discards them, and re-serialising
 *    produces different bytes (key order, whitespace), so signature
 *    verification fails every time. This route therefore uses `express.raw()`
 *    and is mounted BEFORE the global JSON parser in app.ts. If someone later
 *    moves it below, every webhook 400s.
 *
 * 2. SIGNATURE VERIFICATION. This endpoint is public — anyone can POST to it.
 *    `payments.parseWebhook` verifies the signature before returning anything,
 *    so a forged "payment.captured" can never reach the donation logic.
 *
 * This is a SECOND, independent confirmation path alongside the browser
 * callback at POST /api/donations/verify — either can complete a donation
 * first, and `handleWebhookEvent` is idempotent so the other becomes a no-op.
 */
webhookRouter.post(
  "/payments",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["x-signature"] ?? req.headers["x-razorpay-signature"];

    if (!signature || typeof signature !== "string") {
      return res.status(400).json({ error: { message: "Missing signature" } });
    }

    if (!payments.supportsWebhooks) {
      console.warn(
        "[payments] webhook received but no signing secret is configured",
      );
      return res
        .status(503)
        .json({ error: { message: "Webhooks not configured" } });
    }

    let event;

    try {
      event = payments.parseWebhook(req.body as Buffer, signature);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`[payments] signature verification failed: ${message}`);
      // 400 tells the gateway not to bother retrying — the payload is not ours.
      return res
        .status(400)
        .json({ error: { message: `Webhook signature failed: ${message}` } });
    }

    try {
      await handleWebhookEvent(event);

      // 2xx acknowledges receipt. Gateways retry with backoff for a few days on
      // anything else, which is our safety net if the database is briefly down.
      return res.json({ received: true });
    } catch (err) {
      console.error(
        `[payments] failed handling ${event.rawType} ${event.id}:`,
        err,
      );
      // Deliberately 500 so the gateway RETRIES. Swallowing the error with a
      // 200 would permanently lose the donation — the exact failure mode we're
      // designing against.
      return res
        .status(500)
        .json({ error: { message: "Webhook handler failed" } });
    }
  },
);
