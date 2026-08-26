import { Router } from "express";
import { organizationQuerySchema } from "@impactbridge/shared";
import * as orgService from "../services/organizationService.js";
import { optionalAuth, requireAuth } from "../middleware/requireAuth.js";

export const organizationRouter: Router = Router();

/**
 * GET /api/organizations — browse with search, filters, sorting, pagination.
 *
 * Public, but `optionalAuth` means a signed-in donor also gets isBookmarked /
 * isFollowing on each card.
 */
organizationRouter.get("/", optionalAuth, async (req, res, next) => {
  try {
    // Parsing req.query through the shared schema coerces the string values a
    // URL always produces ("true", "12") into real booleans and numbers, and
    // rejects anything malformed before it reaches the database layer.
    const query = organizationQuerySchema.parse(req.query);
    const result = await orgService.listOrganizations(query, req.user?.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/** GET /api/organizations/categories — the cause taxonomy for filter chips. */
organizationRouter.get("/categories", async (_req, res, next) => {
  try {
    res.json({ items: await orgService.listCategories() });
  } catch (err) {
    next(err);
  }
});

/** GET /api/organizations/cities — distinct cities, for the location filter. */
organizationRouter.get("/cities", async (_req, res, next) => {
  try {
    res.json({ items: await orgService.listCities() });
  } catch (err) {
    next(err);
  }
});

/** GET /api/organizations/bookmarks — the signed-in donor's saved list. */
organizationRouter.get("/bookmarks", requireAuth, async (req, res, next) => {
  try {
    const items = await orgService.listBookmarkedOrganizations(req.user!.id);
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

/*
 * NOTE ON ROUTE ORDER: the three literal paths above MUST come before the
 * `/:slug` route below. Express matches top-down, so if /:slug were declared
 * first it would greedily capture "categories" as a slug and the real handlers
 * would be unreachable.
 */

/** GET /api/organizations/:slug — full public profile. */
organizationRouter.get("/:slug", optionalAuth, async (req, res, next) => {
  try {
    const org = await orgService.getOrganizationBySlug(
      req.params.slug,
      req.user?.id,
    );
    res.json(org);
  } catch (err) {
    next(err);
  }
});

/** POST /api/organizations/:id/bookmark — toggle saved state. */
organizationRouter.post(
  "/:id/bookmark",
  requireAuth,
  async (req, res, next) => {
    try {
      const result = await orgService.toggleBookmark(
        req.user!.id,
        req.params.id,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

/** POST /api/organizations/:id/follow — toggle following state. */
organizationRouter.post("/:id/follow", requireAuth, async (req, res, next) => {
  try {
    const result = await orgService.toggleFollow(req.user!.id, req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
