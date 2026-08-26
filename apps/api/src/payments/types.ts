/**
 * ── The payment provider port ────────────────────────────────────────────────
 *
 * Everything above this file (donationService, routes) talks ONLY to this
 * interface, never to a gateway SDK. Swapping Razorpay for something else means
 * writing one new file that satisfies `PaymentProvider` and changing an env var
 * — no business logic moves.
 *
 * That matters here for a concrete reason: this project originally integrated
 * Stripe, which turned out to be unavailable (Stripe India is invite-only and
 * needs a registered business). Being coupled to a single gateway is what made
 * that a rewrite instead of a config change.
 */

/** How the browser should actually collect the payment. */
export type CheckoutInstruction =
  /**
   * Razorpay Checkout is a JavaScript modal that opens ON our page, rather than
   * a redirect to a hosted URL. The browser needs the public key id and the
   * order id to open it. No card data ever touches our server.
   */
  | {
      kind: "razorpay_modal";
      keyId: string;
      orderId: string;
      amountMinor: number;
      currency: string;
      organizationName: string;
      donorName: string;
      donorEmail: string;
    }
  /** The mock provider redirects to a local page that mimics a bank screen. */
  | { kind: "redirect"; url: string };

export interface CreateOrderParams {
  /** Our own donation row id — travels with the order and comes back to us. */
  donationId: string;
  amountMinor: number;
  currency: string;
  organizationName: string;
  donorName: string;
  donorEmail: string;
}

export interface CreatedOrder {
  /** The gateway's order identifier, stored on the donation row. */
  providerOrderId: string;
  checkout: CheckoutInstruction;
}

/**
 * What the browser hands back after the customer pays. The field names differ
 * per gateway, so routes normalise into this shape before calling the provider.
 */
export interface VerifyPaymentParams {
  providerOrderId: string;
  providerPaymentId: string;
  /** HMAC the gateway computed over the order+payment ids. */
  signature: string;
}

export interface VerifiedPayment {
  providerPaymentId: string;
  /** Authoritative status, re-fetched from the gateway — never client-supplied. */
  status: "captured" | "failed";
  /** Authoritative amount, so a tampered client can't under-pay. */
  amountMinor: number;
  currency: string;
}

/** A gateway webhook, reduced to the few cases our domain cares about. */
export interface NormalizedWebhookEvent {
  /** Provider event id — the idempotency key we store. */
  id: string;
  type: "payment.captured" | "payment.failed" | "order.expired" | "ignored";
  /** Our donation id, recovered from the notes/metadata we attached. */
  donationId?: string;
  providerPaymentId?: string;
  amountMinor?: number;
  /** The provider's original event name, for logging. */
  rawType: string;
}

export interface PaymentProvider {
  readonly name: "razorpay" | "mock";

  /** Whether incoming webhooks can be signature-verified (secret present). */
  readonly supportsWebhooks: boolean;

  createOrder(params: CreateOrderParams): Promise<CreatedOrder>;

  /**
   * Verify a payment the browser reported.
   *
   * Implementations MUST do two things: check the signature (proves the gateway
   * produced these ids) and re-fetch the payment from the gateway (proves it was
   * actually captured, and for how much). A signature alone only proves the ids
   * are authentic — not that money moved.
   */
  verifyPayment(params: VerifyPaymentParams): Promise<VerifiedPayment>;

  /**
   * Verify a webhook's signature against the RAW request bytes and normalise it.
   * Throws if the signature does not match.
   */
  parseWebhook(rawBody: Buffer, signature: string): NormalizedWebhookEvent;

  /**
   * Ask the gateway whether any payment on this order was captured.
   *
   * The safety net. Both other confirmation paths depend on something outside
   * our control reaching us — the donor's browser, or an inbound webhook. If
   * the tab closes, the network drops, or webhooks aren't configured (no public
   * URL in local dev), a captured payment would otherwise sit PENDING forever
   * while the donor has genuinely been charged. This asks the gateway directly,
   * needs no signature and no client involvement, and makes confirmation
   * self-healing.
   */
  findCapturedPayment(
    providerOrderId: string,
  ): Promise<VerifiedPayment | null>;
}
