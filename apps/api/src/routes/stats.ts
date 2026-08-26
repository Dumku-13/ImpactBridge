import { Router } from "express";
import { publicStatsSchema } from "@impactbridge/shared";
import { getPublicStats } from "../services/statsService.js";

export const statsRouter: Router = Router();

/**
 * GET /stats/public — platform totals for the landing page.
 *
 * Deliberately unauthenticated: these are the numbers shown to a visitor who
 * has never signed in. It is NOT a public alias of `/admin/stats`, which is
 * PLATFORM_ADMIN-gated and exposes user counts, suspension counts and grant
 * commitments — none of which belong on a marketing page.
 *
 * Validated against the shared schema before sending, matching the pattern in
 * `health.ts`: if the shape ever drifts from what the web app expects, this
 * throws in development rather than shipping a silently broken contract.
 */
statsRouter.get("/public", async (_req, res, next) => {
  try {
    const stats = await getPublicStats();
    res.json(publicStatsSchema.parse(stats));
  } catch (error) {
    next(error);
  }
});
