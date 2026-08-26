import { paymentProvider as configuredProvider } from "../config/env.js";
import { createMockProvider } from "./mock.js";
import { createRazorpayProvider } from "./razorpay.js";
import type { PaymentProvider } from "./types.js";

export * from "./types.js";

/**
 * The single payment provider for this process, chosen once at boot.
 *
 * Everything else imports `payments` and never learns which gateway it is —
 * that is what keeps the donation logic gateway-agnostic.
 */
export const payments: PaymentProvider =
  configuredProvider === "razorpay"
    ? createRazorpayProvider()
    : createMockProvider();
