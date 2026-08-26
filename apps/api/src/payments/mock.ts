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
 * Mock payment gateway — a real implementation of the port, not a stub.
 *
 * It performs the same handshake a live gateway does: issues an order, hosts a
 * page where the payer chooses success or failure, signs the result with HMAC,
 * and posts a signed webhook back. So the code paths under test — signature
 * verification, authoritative status lookup, idempotency, the atomic
 * donation+ledger transaction — are exactly the ones Razorpay drives.
 *
 * Why it exists: it removes every external dependency from the demo. No
 * account, no keys, no internet, no gateway outage can stop a donation from
 * completing end to end.
 *
 * The signing secret is derived from JWT_ACCESS_SECRET so there is nothing
 * extra to configure. It is not a security boundary — this provider must never
 * be enabled in production, which is why real money is impossible here.
 */

const MOCK_SECRET = crypto
  .createHash("sha256")
  .update(`mock-gateway:${env.JWT_ACCESS_SECRET}`)
  .digest("hex");

function hmacHex(payload: string, secret = MOCK_SECRET): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * In-memory record of orders this process created.
 *
 * `verifyPayment` reads status from HERE rather than from the request body,
 * mirroring the server-to-server fetch the Razorpay adapter performs. The
 * browser can never talk its way into a captured payment.
 */
interface MockOrder {
  donationId: string;
  amountMinor: number;
  currency: string;
  status: "created" | "captured" | "failed";
  paymentId?: string;
}

const orders = new Map<string, MockOrder>();

/** Exposed to the mock checkout route so it can render and settle an order. */
export function getMockOrder(orderId: string): MockOrder | undefined {
  return orders.get(orderId);
}

/**
 * Settle an order the way a bank page would. Returns the ids and signature the
 * browser then submits to /api/donations/verify — the same round trip Razorpay
 * Checkout performs.
 */
export function settleMockOrder(
  orderId: string,
  outcome: "success" | "failure",
): { paymentId: string; signature: string } {
  const order = orders.get(orderId);

  if (!order) {
    throw new HttpError(404, "Unknown mock order");
  }

  const paymentId = `pay_mock_${crypto.randomBytes(8).toString("hex")}`;

  order.status = outcome === "success" ? "captured" : "failed";
  order.paymentId = paymentId;

  return {
    paymentId,
    signature: hmacHex(`${orderId}|${paymentId}`),
  };
}

/** Build the signed webhook body the mock gateway posts back to us. */
export function buildMockWebhook(
  orderId: string,
): { body: string; signature: string } | null {
  const order = orders.get(orderId);

  if (!order || !order.paymentId || order.status === "created") return null;

  const body = JSON.stringify({
    event: order.status === "captured" ? "payment.captured" : "payment.failed",
    payload: {
      payment: {
        entity: {
          id: order.paymentId,
          amount: order.amountMinor,
          order_id: orderId,
          notes: { donationId: order.donationId },
        },
      },
    },
  });

  return { body, signature: hmacHex(body) };
}

const webhookSchema = z.object({
  event: z.string(),
  payload: z.object({
    payment: z.object({
      entity: z.object({
        id: z.string(),
        amount: z.number().int(),
        order_id: z.string().nullable().optional(),
        notes: z.record(z.string()).optional(),
      }),
    }),
  }),
});

export function createMockProvider(): PaymentProvider {
  return {
    name: "mock",

    supportsWebhooks: true,

    async createOrder(params: CreateOrderParams): Promise<CreatedOrder> {
      const orderId = `order_mock_${crypto.randomBytes(8).toString("hex")}`;

      orders.set(orderId, {
        donationId: params.donationId,
        amountMinor: params.amountMinor,
        currency: params.currency,
        status: "created",
      });

      return {
        providerOrderId: orderId,
        checkout: {
          kind: "redirect",
          // Served by the API itself — see routes/mockCheckout.ts.
          url: `${env.API_PUBLIC_URL.replace(/\/$/, "")}/api/mock-checkout/${orderId}`,
        },
      };
    },

    async verifyPayment(
      params: VerifyPaymentParams,
    ): Promise<VerifiedPayment> {
      const expected = hmacHex(
        `${params.providerOrderId}|${params.providerPaymentId}`,
      );

      if (!safeEqualHex(expected, params.signature)) {
        throw new HttpError(400, "Payment signature verification failed");
      }

      const order = orders.get(params.providerOrderId);

      if (!order) {
        // The process restarted and lost the in-memory order. Fail closed —
        // never assume a payment succeeded just because it was signed.
        throw new HttpError(
          400,
          "Mock order is no longer available (server restarted). Please donate again.",
        );
      }

      if (order.paymentId !== params.providerPaymentId) {
        throw new HttpError(400, "Payment does not belong to this order");
      }

      return {
        providerPaymentId: params.providerPaymentId,
        status: order.status === "captured" ? "captured" : "failed",
        amountMinor: order.amountMinor,
        currency: order.currency,
      };
    },

    async findCapturedPayment(
      providerOrderId: string,
    ): Promise<VerifiedPayment | null> {
      const order = orders.get(providerOrderId);

      if (!order || order.status !== "captured" || !order.paymentId) {
        return null;
      }

      return {
        providerPaymentId: order.paymentId,
        status: "captured",
        amountMinor: order.amountMinor,
        currency: order.currency,
      };
    },

    parseWebhook(rawBody: Buffer, signature: string): NormalizedWebhookEvent {
      const expected = hmacHex(rawBody.toString("utf8"));

      if (!safeEqualHex(expected, signature)) {
        throw new HttpError(400, "Webhook signature verification failed");
      }

      const parsed = webhookSchema.parse(JSON.parse(rawBody.toString("utf8")));
      const entity = parsed.payload.payment.entity;

      return {
        id: `${parsed.event}:${entity.id}`,
        type:
          parsed.event === "payment.captured"
            ? "payment.captured"
            : parsed.event === "payment.failed"
              ? "payment.failed"
              : "ignored",
        donationId: entity.notes?.donationId,
        providerPaymentId: entity.id,
        amountMinor: entity.amount,
        rawType: parsed.event,
      };
    },
  };
}
