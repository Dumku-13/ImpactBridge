import { Router } from "express";
import * as aiService from "../services/aiService.js";
import { ai } from "../ai/index.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";
import { rateLimit } from "../middleware/rateLimit.js";

export const aiRouter: Router = Router();

aiRouter.use(requireAuth);

/**
 * Generation is slow and the free tier is quota-limited, so these are throttled
 * harder than ordinary reads. Caching means a normal user rarely reaches this
 * — the limit is here for the case where someone hammers regenerate.
 */
const generationLimit = rateLimit({ windowMs: 60_000, max: 10 });

/**
 * GET /api/ai/status — whether AI features should be offered at all.
 *
 * Lets the UI hide the buttons entirely when no key is configured, instead of
 * showing controls that always fail.
 */
aiRouter.get("/status", (_req, res) => {
  res.json({ available: ai.isAvailable, provider: ai.name });
});

/** POST /api/ai/applications/:id/summary — funder-side reviewer summary. */
aiRouter.post(
  "/applications/:id/summary",
  requireRole("FUNDER"),
  generationLimit,
  async (req, res, next) => {
    try {
      res.json(
        await aiService.summariseApplication(req.user!.id, req.params.id),
      );
    } catch (err) {
      next(err);
    }
  },
);

/** POST /api/ai/applications/:id/review — NGO's own pre-submission check. */
aiRouter.post(
  "/applications/:id/review",
  requireRole("NGO_ADMIN"),
  generationLimit,
  async (req, res, next) => {
    try {
      res.json(
        await aiService.reviewOwnApplication(req.user!.id, req.params.id),
      );
    } catch (err) {
      next(err);
    }
  },
);

/** POST /api/ai/grant-matches — grants suited to the signed-in NGO. */
aiRouter.post(
  "/grant-matches",
  requireRole("NGO_ADMIN"),
  generationLimit,
  async (req, res, next) => {
    try {
      res.json(await aiService.matchGrantsForOrganization(req.user!.id));
    } catch (err) {
      next(err);
    }
  },
);
