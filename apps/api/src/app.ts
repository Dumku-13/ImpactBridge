import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { corsOrigins } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { authRateLimit } from "./middleware/rateLimit.js";
import { securityHeaders } from "./middleware/securityHeaders.js";
import { forceHttps } from "./middleware/forceHttps.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { organizationRouter } from "./routes/organizations.js";
import { statsRouter } from "./routes/stats.js";
import { donationRouter } from "./routes/donations.js";
import { grantRouter } from "./routes/grants.js";
import { applicationRouter } from "./routes/applications.js";
import { adminRouter } from "./routes/admin.js";
import { notificationRouter } from "./routes/notifications.js";
import { aiRouter } from "./routes/ai.js";
import { webhookRouter } from "./routes/webhooks.js";
import { mockCheckoutRouter } from "./routes/mockCheckout.js";
import { ngoRouter } from "./routes/ngo.js";

/**
 * Builds the Express app. Kept separate from index.ts (which starts the
 * listener) so tests can import the app without binding a port.
 */
export function createApp(): Express {
  const app = express();

  // Trust the proxy so req.ip is the real client address behind Vercel/Railway.
  // Without this the rate limiter would see one shared IP for every user.
  app.set("trust proxy", 1);

  /*
   * Announcing the framework and its version tells a scanner exactly which CVE
   * list to work through. It buys us nothing, so it goes.
   */
  app.disable("x-powered-by");

  /*
   * Headers first, before anything can return a response.
   *
   * Mounted above the router stack rather than beside it so that EVERY reply
   * carries them — including the 404, the error handler's output, and the
   * webhook route below, none of which would be covered by a middleware placed
   * after them. A security header that is present on the happy path and missing
   * on the error path is the same as not having it.
   */
  app.use(securityHeaders);

  /*
   * Then the protocol check, before CORS and before any body is parsed: if the
   * request is going to be refused for arriving over plain http, there is no
   * reason to have spent work parsing it first. In development this is a
   * no-op — see the isProduction guard inside.
   */
  app.use(forceHttps);

  // `credentials: true` lets the browser send our httpOnly refresh cookie.
  app.use(cors({ origin: corsOrigins, credentials: true }));

  /*
   * ⚠️  ORDER IS LOAD-BEARING ⚠️
   *
   * The payment webhook must be mounted BEFORE express.json(). Gateways sign
   * the raw request bytes, and the JSON parser consumes and discards them —
   * re-serialising produces different bytes, so signature verification would
   * fail on every single webhook. The route supplies its own express.raw()
   * parser; moving this line below the JSON parser silently breaks all
   * donations.
   */
  app.use("/api/webhooks", webhookRouter);

  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.use("/api", healthRouter);
  app.use("/api/auth", authRateLimit, authRouter);
  app.use("/api/stats", statsRouter);
  app.use("/api/organizations", organizationRouter);
  app.use("/api/donations", donationRouter);
  app.use("/api/grants", grantRouter);
  app.use("/api/applications", applicationRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/notifications", notificationRouter);
  app.use("/api/ai", aiRouter);
  app.use("/api/ngo", ngoRouter);
  // Only active when the mock payment provider is selected.
  app.use("/api/mock-checkout", mockCheckoutRouter);

  // Order matters: 404 first, then the error handler last.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
