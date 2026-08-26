import { Router } from "express";
import { z } from "zod";
import { grantQuerySchema, upsertGrantSchema } from "@impactbridge/shared";
import * as grantService from "../services/grantService.js";
import { prisma } from "../lib/prisma.js";
import { optionalAuth, requireAuth, requireRole } from "../middleware/requireAuth.js";

export const grantRouter: Router = Router();

/**
 * Resolve the signed-in NGO admin's organisation id, if they have one.
 *
 * Grants are discovered by anyone, but an NGO viewing one should also learn
 * whether their organisation has already applied.
 */
async function viewerOrganizationId(
  userId?: string,
  role?: string,
): Promise<string | undefined> {
  if (!userId || role !== "NGO_ADMIN") return undefined;

  const organization = await prisma.organization.findUnique({
    where: { ownerId: userId },
    select: { id: true },
  });

  return organization?.id;
}

/** GET /api/grants — public browse with search, filters and sorting. */
grantRouter.get("/", optionalAuth, async (req, res, next) => {
  try {
    const query = grantQuerySchema.parse(req.query);
    res.json(await grantService.listGrants(query));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/grants/mine — the signed-in funder's own grants, drafts included.
 *
 * Declared BEFORE /:slug: Express matches top-down, so a later literal path
 * would be swallowed by the slug parameter.
 */
grantRouter.get(
  "/mine",
  requireAuth,
  requireRole("FUNDER"),
  async (req, res, next) => {
    try {
      res.json({ items: await grantService.listMyGrants(req.user!.id) });
    } catch (err) {
      next(err);
    }
  },
);

/** POST /api/grants — create a grant (starts as DRAFT). */
grantRouter.post(
  "/",
  requireAuth,
  requireRole("FUNDER"),
  async (req, res, next) => {
    try {
      const input = upsertGrantSchema.parse(req.body);
      res.status(201).json(await grantService.createGrant(req.user!.id, input));
    } catch (err) {
      next(err);
    }
  },
);

/** PATCH /api/grants/:id — edit terms (blocked once applications exist). */
grantRouter.patch(
  "/:id",
  requireAuth,
  requireRole("FUNDER"),
  async (req, res, next) => {
    try {
      const input = upsertGrantSchema.parse(req.body);
      res.json(
        await grantService.updateGrant(req.user!.id, req.params.id, input),
      );
    } catch (err) {
      next(err);
    }
  },
);

const statusBodySchema = z.object({
  status: z.enum(["OPEN", "CLOSED", "DRAFT", "COMPLETED"]),
});

/** POST /api/grants/:id/status — publish, close, unpublish, or complete. */
grantRouter.post(
  "/:id/status",
  requireAuth,
  requireRole("FUNDER"),
  async (req, res, next) => {
    try {
      const { status } = statusBodySchema.parse(req.body);
      res.json(
        await grantService.setGrantStatus(req.user!.id, req.params.id, status),
      );
    } catch (err) {
      next(err);
    }
  },
);

/** DELETE /api/grants/:id — only while it has no applications. */
grantRouter.delete(
  "/:id",
  requireAuth,
  requireRole("FUNDER"),
  async (req, res, next) => {
    try {
      res.json(await grantService.deleteGrant(req.user!.id, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

/** GET /api/grants/:slug — full detail. Must stay last. */
grantRouter.get("/:slug", optionalAuth, async (req, res, next) => {
  try {
    const organizationId = await viewerOrganizationId(
      req.user?.id,
      req.user?.role,
    );

    res.json(
      await grantService.getGrantBySlug(
        req.params.slug,
        organizationId,
        req.user?.id,
      ),
    );
  } catch (err) {
    next(err);
  }
});
