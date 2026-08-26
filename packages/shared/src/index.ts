import { z } from "zod";

/**
 * The shared package is the single source of truth for data shapes that BOTH
 * the API (server-side validation) and the web app (form validation + TS types)
 * rely on. Define a Zod schema once here, infer the TS type from it, and import
 * it on both sides. If the shape ever changes, both ends fail to typecheck —
 * that is the safety net we want.
 */

export * from "./schemas/auth.js";
export * from "./schemas/organization.js";
export * from "./schemas/donation.js";
export * from "./schemas/grant.js";
export * from "./schemas/stats.js";
export * from "./schemas/application.js";
export * from "./schemas/ngo.js";
export * from "./money.js";

/** Response shape for the API health check. */
export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  db: z.enum(["up", "down"]),
  timestamp: z.string(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const APP_NAME = "ImpactBridge";
