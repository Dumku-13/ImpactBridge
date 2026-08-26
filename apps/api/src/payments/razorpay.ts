import crypto from "node:crypto";
import { z } from "zod";
import { env } from "../config/env.js";
import { HttpError } from "../middleware/errorHandler.js";
import type {
  CreateOrderParams,
  CreatedOrder,
  NormalizedWebhookEvent,
  PaymentProvider,
  VerifiedPayment,
  VerifyPaymentParams,
} from "./types.js";

/**
 * Razorpay adapter — TEST MODE ONLY.
 *
 * Talks to Razorpay's REST API with `fetch` rather than their SDK. Two endpoints
 * and one HMAC is the whole integration, so a dependency would buy us little,
 * and going direct lets us validate every response with Zod exactly like the
 * rest of this codebase. An unexpected payload shape fails loudly here instead
 * of becoming `undefined` three call-frames later.
 */

const API = "https://api.razorpay.com/v1";

/** Razorpay uses HTTP Basic auth: key_id as user, key_secret as password. */
function authHeader(): string {
  const token = Buffer.from(
    `${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`,
  ).toString("base64");
  return `Basic ${token}`;
}

/**
 * Compare two hex digests without leaking timing information.
 *
 * A plain `===` on secrets returns faster the earlier it finds a mismatched
 * byte, which over many attempts reveals the expected value one character at a
 * time. `timingSafeEqual` always compares the full buffer.
 */
function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  // timingSafeEqual throws on length mismatch, so check that first.
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function hmacHex(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

const orderResponseSchema = z.object({
  id: z.string(),
  amount: z.number().int(),
  currency: z.string(),
  status: z.string(),
});

const paymentResponseSchema = z.object({
  id: z.string(),
  amount: z.number().int(),
  currency: z.string(),
  status: z.enum([
    "created",
    "authorized",
    "captured",
    "refunded",
    "failed",
  ]),
  order_id: z.string().nullable().optional(),
  notes: z.record(z.string()).optional(),
});

/** GET /orders/:id/payments — every attempt made against one order. */
const orderPaymentsSchema = z.object({
  count: z.number().int(),
  items: z.array(paymentResponseSchema),
});

/** Shape of the webhook envelope we rely on. */
const webhookSchema = z.object({
  event: z.string(),
  payload: z.object({
    payment: z
      .object({
        entity: z.object({
          id: z.string(),
          amount: z.number().int(),
          order_id: z.string().nullable().optional(),
          notes: z.record(z.string()).optional(),
        }),
      })
      .optional(),
    order: z
      .object({
        entity: z.object({
          id: z.string(),
          notes: z.record(z.string()).optional(),
        }),
      })
      .optional(),
  }),
});

async function razorpayFetch(
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  let response: Response;

  try {
    response = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
  } catch (err) {
    // Network failure — surface as 502 so the caller knows it's upstream.
    const message = err instanceof Error ? err.message : "unknown";
    throw new HttpError(502, `Could not reach Razorpay: ${message}`);
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    // Razorpay errors look like { error: { code, description, ... } }.
    const description =
      (body as { error?: { description?: string } } | null)?.error
        ?.description ?? `HTTP ${response.status}`;
    throw new HttpError(502, `Razorpay: ${description}`);
  }

  return body;
}

export function createRazorpayProvider(): PaymentProvider {
  return {
    name: "razorpay",

    supportsWebhooks: Boolean(env.RAZORPAY_WEBHOOK_SECRET),

    async createOrder(params: CreateOrderParams): Promise<CreatedOrder> {
      const body = await razorpayFetch("/orders", {
        method: "POST",
        body: JSON.stringify({
          amount: params.amountMinor,
          // Razorpay expects an uppercase ISO code.
          currency: params.currency.toUpperCase(),
          /*
           * `receipt` is our reference on their side, and `notes` is arbitrary
           * metadata that comes back on both the payment and the webhook. This
           * is how we recover which donation a payment belongs to WITHOUT
           * trusting anything the browser tells us.
           */
          receipt: params.donationId,
          notes: { donationId: params.donationId },
        }),
      });

      const order = orderResponseSchema.parse(body);

      return {
        providerOrderId: order.id,
        checkout: {
          kind: "razorpay_modal",
          keyId: env.RAZORPAY_KEY_ID!,
          orderId: order.id,
          amountMinor: order.amount,
          currency: order.currency,
          organizationName: params.organizationName,
          donorName: params.donorName,
          donorEmail: params.donorEmail,
        },
      };
    },

    async verifyPayment(
      params: VerifyPaymentParams,
    ): Promise<VerifiedPayment> {
      /*
       * Step 1 — signature. Razorpay signs "<order_id>|<payment_id>" with our
       * key secret. A matching HMAC proves these ids really came from Razorpay
       * and were not invented by the browser.
       */
      const expected = hmacHex(
        `${params.providerOrderId}|${params.providerPaymentId}`,
        env.RAZORPAY_KEY_SECRET!,
      );

      if (!safeEqualHex(expected, params.signature)) {
        throw new HttpError(400, "Payment signature verification failed");
      }

      /*
       * Step 2 — ask Razorpay directly. The signature proves the ids are
       * authentic, but NOT that the payment succeeded or how much was paid.
       * Only this server-to-server fetch is authoritative. Skipping it is how
       * integrations end up crediting unpaid or under-paid donations.
       */
      const body = await razorpayFetch(
        `/payments/${encodeURIComponent(params.providerPaymentId)}`,
      );

      const payment = paymentResponseSchema.parse(body);

      // Guard against a payment id that belongs to a different order.
      if (payment.order_id && payment.order_id !== params.providerOrderId) {
        throw new HttpError(400, "Payment does not belong to this order");
      }

      return {
        providerPaymentId: payment.id,
        // `authorized` means funds are held but not yet captured. We treat only
        // `captured` as money received.
        status: payment.status === "captured" ? "captured" : "failed",
        amountMinor: payment.amount,
        currency: payment.currency.toLowerCase(),
      };
    },

    async findCapturedPayment(
      providerOrderId: string,
    ): Promise<VerifiedPayment | null> {
      const body = await razorpayFetch(
        `/orders/${encodeURIComponent(providerOrderId)}/payments`,
      );

      const list = orderPaymentsSchema.parse(body);

      /*
       * An order can hold several payment attempts — a donor may be declined
       * and retry within the same modal. Only a captured one counts.
       */
      const captured = list.items.find((p) => p.status === "captured");

      if (!captured) return null;

      return {
        providerPaymentId: captured.id,
        status: "captured",
        amountMinor: captured.amount,
        currency: captured.currency.toLowerCase(),
      };
    },

    parseWebhook(rawBody: Buffer, signature: string): NormalizedWebhookEvent {
      const secret = env.RAZORPAY_WEBHOOK_SECRET;

      if (!secret) {
        throw new HttpError(503, "Webhooks are not configured");
      }

      // Razorpay signs the exact raw bytes with the WEBHOOK secret (which is
      // different from the API key secret used for payment signatures).
      const expected = hmacHex(rawBody.toString("utf8"), secret);

      if (!safeEqualHex(expected, signature)) {
        throw new HttpError(400, "Webhook signature verification failed");
      }

      const parsed = webhookSchema.parse(JSON.parse(rawBody.toString("utf8")));

      const paymentEntity = parsed.payload.payment?.entity;
      const orderEntity = parsed.payload.order?.entity;
      const entity = paymentEntity ?? orderEntity;

      const donationId =
        paymentEntity?.notes?.donationId ?? orderEntity?.notes?.donationId;

      /*
       * Razorpay puts its event id in a header, not the body — and our port
       * only receives the body. Using "<event>:<entity id>" as the idempotency
       * key is actually stronger: it is stable across redeliveries AND across
       * two different event ids describing the same state change.
       */
      const id = `${parsed.event}:${entity?.id ?? "unknown"}`;

      const type: NormalizedWebhookEvent["type"] =
        parsed.event === "payment.captured"
          ? "payment.captured"
          : parsed.event === "payment.failed"
            ? "payment.failed"
            : "ignored";

      return {
        id,
        type,
        donationId,
        providerPaymentId: paymentEntity?.id,
        amountMinor: paymentEntity?.amount,
        rawType: parsed.event,
      };
    },
  };
}
