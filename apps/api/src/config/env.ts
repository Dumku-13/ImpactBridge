import "dotenv/config";
import { z } from "zod";

/**
 * Validate environment variables ONCE at boot.
 *
 * Why: if DATABASE_URL is missing, we want a clear error the moment the server
 * starts — not a confusing crash deep inside a request handler an hour later.
 * Everything downstream imports `env` and gets fully-typed, guaranteed-present
 * values.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid connection URL"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),

  // Auth. Enforcing a minimum length here stops anyone shipping a weak secret.
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
  WEB_APP_URL: z.string().url().default("http://localhost:5173"),

  /** This API's own externally-reachable base URL, used to build gateway
   *  redirect targets (the mock checkout page lives here, not on the web app). */
  API_PUBLIC_URL: z.string().url().default("http://localhost:4000"),

  /*
   * Payments.
   *
   * `PAYMENT_PROVIDER` selects the gateway. Leave it unset and the server picks
   * automatically: Razorpay when credentials are present, otherwise the built-in
   * mock. That means donations ALWAYS work, even with no credentials and no
   * internet — the demo can never be dead on arrival.
   */
  PAYMENT_PROVIDER: z.enum(["razorpay", "mock"]).optional(),

  /*
   * Razorpay — TEST MODE ONLY. Optional so the app boots without them.
   * Key id is public (it ships to the browser to open Checkout); the secret and
   * webhook secret never leave the server.
   */
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  /*
   * Cloudinary — media hosting for NGO logos, cover images, gallery and legal
   * documents. Optional so the app still boots without it; upload endpoints
   * report a clear 503 rather than crashing at startup.
   */
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  /*
   * AI assistance (Phase 7). Optional: without a key the app runs normally and
   * every AI endpoint answers 503 with a clear message, rather than the feature
   * half-working or the server refusing to boot.
   *
   * Google Gemini rather than a paid provider because its free tier needs no
   * card, which keeps the whole project runnable at zero cost.
   */
  GEMINI_API_KEY: z.string().optional(),
  /**
   * Deliberately an alias rather than a pinned version.
   *
   * Free-tier quota is granted per model and Google retires specific versions
   * fairly aggressively — pinned ids here failed two different ways on the same
   * valid key: `gemini-2.5-flash` returned "no longer available", and
   * `gemini-2.0-flash` returned quota "limit: 0". The `-latest` alias tracks
   * whichever flash model is currently free, so the app doesn't break every
   * time Google rotates them. Override it if a specific version is needed.
   */
  GEMINI_MODEL: z.string().default("gemini-flash-latest"),

  CURRENCY: z.string().default("inr"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("\n❌ Invalid environment variables:\n");
  for (const issue of parsed.error.issues) {
    console.error(`  • ${issue.path.join(".")}: ${issue.message}`);
  }
  console.error("\nDid you copy apps/api/.env.example to apps/api/.env ?\n");
  process.exit(1);
}

export const env = parsed.data;

/** Origins allowed to call this API from a browser. */
export const corsOrigins = env.CORS_ORIGIN.split(",").map((o) => o.trim());

export const isProduction = env.NODE_ENV === "production";

/**
 * Guard against ever charging a real card from this codebase.
 * Razorpay live keys start with `rzp_live_`; we refuse to start if one appears.
 */
if (env.RAZORPAY_KEY_ID?.startsWith("rzp_live_")) {
  console.error(
    "\n❌ A LIVE Razorpay key was provided. ImpactBridge is a demo platform " +
      "and must only ever run against test keys (rzp_test_…).\n",
  );
  process.exit(1);
}

/** Uploads need all three Cloudinary values. */
export const isCloudinaryConfigured = Boolean(
  env.CLOUDINARY_CLOUD_NAME &&
    env.CLOUDINARY_API_KEY &&
    env.CLOUDINARY_API_SECRET,
);

/** AI features are offered only when a key is present. */
export const isAiConfigured = Boolean(env.GEMINI_API_KEY);

if (!isAiConfigured) {
  console.warn(
    "\n🤖 AI assistance is not configured — those features are disabled.\n" +
      "   Add GEMINI_API_KEY to apps/api/.env\n" +
      "   (free, no card: https://aistudio.google.com/apikey)\n",
  );
}

if (!isCloudinaryConfigured) {
  console.warn(
    "\n📷 Cloudinary is not configured — file uploads are disabled.\n" +
      "   Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and\n" +
      "   CLOUDINARY_API_SECRET to apps/api/.env\n",
  );
}

/** Razorpay can only be used once both the id and the secret are present. */
export const isRazorpayConfigured = Boolean(
  env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET,
);

/**
 * The provider actually in use. An explicit PAYMENT_PROVIDER always wins, so
 * you can force the mock even with real keys configured (handy for demos and
 * for running tests offline).
 */
export const paymentProvider: "razorpay" | "mock" =
  env.PAYMENT_PROVIDER ?? (isRazorpayConfigured ? "razorpay" : "mock");

if (env.PAYMENT_PROVIDER === "razorpay" && !isRazorpayConfigured) {
  console.error(
    "\n❌ PAYMENT_PROVIDER=razorpay but RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET " +
      "are missing from apps/api/.env\n",
  );
  process.exit(1);
}

if (paymentProvider === "mock") {
  console.warn(
    "\n🧪 Payments are using the MOCK provider — no real gateway is involved.\n" +
      "   Donations still complete end to end (order → payment → signed\n" +
      "   webhook → receipt), so the full flow is demoable offline.\n" +
      "   To use real Razorpay test mode, add RAZORPAY_KEY_ID and\n" +
      "   RAZORPAY_KEY_SECRET to apps/api/.env\n" +
      "   (test keys only: https://dashboard.razorpay.com/app/keys)\n",
  );
} else {
  console.log(
    `\n💳 Payments: Razorpay TEST mode (${env.RAZORPAY_KEY_ID?.slice(0, 12)}…)` +
      (env.RAZORPAY_WEBHOOK_SECRET
        ? " with webhook verification\n"
        : "\n   ⚠️  RAZORPAY_WEBHOOK_SECRET not set — the webhook endpoint is\n" +
          "      disabled. Payments still confirm via server-side verification.\n"),
  );
}
