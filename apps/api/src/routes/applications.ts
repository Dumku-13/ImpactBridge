import { Router } from "express";
import {
  createCommentSchema,
  createReportSchema,
  transitionSchema,
  upsertApplicationSchema,
  upsertReviewSchema,
} from "@impactbridge/shared";
import * as applicationService from "../services/applicationService.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";

export const applicationRouter: Router = Router();

/** Everything here needs a signed-in user; per-route roles are stricter. */
applicationRouter.use(requireAuth);

/** GET /api/applications/mine — the NGO's own applications. */
applicationRouter.get(
  "/mine",
  requireRole("NGO_ADMIN"),
  async (req, res, next) => {
    try {
      res.json({
        items: await applicationService.listMyApplications(req.user!.id),
      });
    } catch (err) {
      next(err);
    }
  },
);

/** GET /api/applications/for-grant/:grantId — a funder's applicant queue. */
applicationRouter.get(
  "/for-grant/:grantId",
  requireRole("FUNDER"),
  async (req, res, next) => {
    try {
      res.json({
        items: await applicationService.listGrantApplications(
          req.user!.id,
          req.params.grantId,
        ),
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/applications/reviewers — people a funder may assign a review to.
 *
 * Funder-only, and it returns ids and names ONLY. It is still a directory of
 * users, so it is deliberately narrow: no email, no organisation, and nobody
 * outside the roles that are allowed to hold a review.
 */
applicationRouter.get(
  "/reviewers",
  requireRole("FUNDER"),
  async (_req, res, next) => {
    try {
      res.json({ items: await applicationService.listReviewers() });
    } catch (err) {
      next(err);
    }
  },
);

/** POST /api/applications/grant/:grantId — apply (creates a DRAFT). */
applicationRouter.post(
  "/grant/:grantId",
  requireRole("NGO_ADMIN"),
  async (req, res, next) => {
    try {
      const input = upsertApplicationSchema.parse(req.body);
      res.status(201).json(
        await applicationService.createApplication(
          req.user!.id,
          req.params.grantId,
          input,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

/** PATCH /api/applications/:id — edit a draft. */
applicationRouter.patch(
  "/:id",
  requireRole("NGO_ADMIN"),
  async (req, res, next) => {
    try {
      const input = upsertApplicationSchema.parse(req.body);
      res.json(
        await applicationService.updateApplication(
          req.user!.id,
          req.params.id,
          input,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/applications/:id/transition — the ONLY way a status changes.
 *
 * Open to both NGO admins and funders: which moves each may make is decided by
 * the state machine, not by route-level role checks, so the rules live in one
 * place rather than being duplicated here.
 */
applicationRouter.post("/:id/transition", async (req, res, next) => {
  try {
    const input = transitionSchema.parse(req.body);
    res.json(
      await applicationService.transitionApplication(
        req.user!.id,
        req.user!.role,
        req.params.id,
        input,
      ),
    );
  } catch (err) {
    next(err);
  }
});

/** POST /api/applications/:id/review — funder scores an application. */
applicationRouter.post(
  "/:id/review",
  requireRole("FUNDER"),
  async (req, res, next) => {
    try {
      const input = upsertReviewSchema.parse(req.body);
      res.json(
        await applicationService.upsertReview(
          req.user!.id,
          req.params.id,
          input,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

/** POST /api/applications/:id/comments — discussion thread. */
applicationRouter.post("/:id/comments", async (req, res, next) => {
  try {
    const input = createCommentSchema.parse(req.body);
    res.status(201).json(
      await applicationService.addComment(req.user!.id, req.params.id, input),
    );
  } catch (err) {
    next(err);
  }
});

/** POST /api/applications/projects/:projectId/reports — NGO progress update. */
applicationRouter.post(
  "/projects/:projectId/reports",
  requireRole("NGO_ADMIN"),
  async (req, res, next) => {
    try {
      const input = createReportSchema.parse(req.body);
      res.status(201).json(
        await applicationService.createReport(
          req.user!.id,
          req.params.projectId,
          input,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

/** GET /api/applications/:id — detail, scoped to what the viewer may see. */
applicationRouter.get("/:id", async (req, res, next) => {
  try {
    res.json(
      await applicationService.getApplication(
        req.user!.id,
        req.user!.role,
        req.params.id,
      ),
    );
  } catch (err) {
    next(err);
  }
});
