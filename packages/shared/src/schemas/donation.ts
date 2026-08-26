import { z } from "zod";

/**
 * Donation contracts.
 *
 * Amounts cross the wire in MINOR units (paise for INR) as integers, matching
 * both the database and the payment gateway. Converting to a display string happens
 * only at the very edge, in the UI.
 */

export const donationStatusSchema = z.enum([
  "PENDING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "REFUNDED",
]);
export type DonationStatus = z.infer<typeof donationStatusSchema>;

/** Preset amounts (in rupees) offered as one-tap buttons. */
export const DONATION_PRESETS_MAJOR = [500, 1000, 2500, 5000] as const;

export const MIN_DONATION_MINOR = 5000; // ₹50
export const MAX_DONATION_MINOR = 100_000_000; // ₹10,00,000

/**
 * What the client sends to start a donation.
 *
 * Note the amount is validated server-side too — a hostile client could POST
 * any number, so the API must never trust this value just because the form
 * checked it.
 */
export const createDonationSchema = z.object({
  organizationId: z.string().min(1, "Organisation is required"),
  amountMinor: z
    .number({ invalid_type_error: "Enter a donation amount" })
    .int("Amount must be a whole number")
    .min(MIN_DONATION_MINOR, "Minimum donation is ₹50")
    .max(MAX_DONATION_MINOR, "Maximum donation is ₹10,00,000"),
  message: z.string().trim().max(280).optional(),
  anonymous: z.boolean().default(false),
});
export type CreateDonationInput = z.infer<typeof createDonationSchema>;

/**
 * How the browser should collect payment. Two shapes because the gateway
 * changes how checkout actually happens:
 *  - `razorpay_modal`: open Razorpay Checkout.js in-page with these params.
 *  - `redirect`: navigate to a URL (the mock gateway's local bank-page stand-in).
 */
export const checkoutInstructionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("razorpay_modal"),
    keyId: z.string(),
    orderId: z.string(),
    amountMinor: z.number(),
    currency: z.string(),
    organizationName: z.string(),
    donorName: z.string(),
    donorEmail: z.string(),
  }),
  z.object({
    kind: z.literal("redirect"),
    url: z.string().url(),
  }),
]);
export type CheckoutInstruction = z.infer<typeof checkoutInstructionSchema>;

export const createOrderResponseSchema = z.object({
  donationId: z.string(),
  checkout: checkoutInstructionSchema,
});
export type CreateOrderResponse = z.infer<typeof createOrderResponseSchema>;

/** What the browser sends back after the gateway reports a result. */
export const verifyPaymentSchema = z.object({
  providerOrderId: z.string(),
  providerPaymentId: z.string(),
  signature: z.string(),
});
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;

export const verifyPaymentResponseSchema = z.object({
  status: z.enum(["SUCCEEDED", "FAILED"]),
  donationId: z.string(),
});
export type VerifyPaymentResponse = z.infer<typeof verifyPaymentResponseSchema>;

export const donationSchema = z.object({
  id: z.string(),
  amountMinor: z.number(),
  currency: z.string(),
  status: donationStatusSchema,
  message: z.string().nullable(),
  anonymous: z.boolean(),
  receiptNumber: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  organization: z.object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    logoUrl: z.string().nullable(),
    coverUrl: z.string().nullable(),
  }),
});
export type Donation = z.infer<typeof donationSchema>;

export const donationListResponseSchema = z.object({
  items: z.array(donationSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  totalPages: z.number(),
});
export type DonationListResponse = z.infer<typeof donationListResponseSchema>;

/** Headline numbers on the donor dashboard. */
export const donorStatsSchema = z.object({
  totalDonatedMinor: z.number(),
  currency: z.string(),
  donationCount: z.number(),
  organizationsSupported: z.number(),
  bookmarkCount: z.number(),
  followingCount: z.number(),
});
export type DonorStats = z.infer<typeof donorStatsSchema>;
