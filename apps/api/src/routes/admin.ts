import { Router } from "express";
import { z } from "zod";
import { roleSchema } from "@impactbridge/shared";
import * as adminService from "../services/adminService.js";
import { listAuditLogs } from "../services/auditService.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";

export const adminRouter: Router = Router();

/** Platform admins only — enforced once, for every route below. */
adminRouter.use(requireAuth, requireRole("PLATFORM_ADMIN"));

/**
 * `?page=abc` becomes `skip: NaN` and `?page=0`/negative values corrupt
 * Prisma's pagination silently instead of erroring — coerce and clamp at the
 * boundary so bad input becomes a sane default, not a 500.
 */
const pageSchema = z.coerce.number().int().min(1).catch(1);

/** GET /api/admin/stats — platform-wide figures. */
adminRouter.get("/stats", async (_req, res, next) => {
  try {
    res.json(await adminService.getPlatformStats());
  } catch (err) {
    next(err);
  }
});

const orgFilterSchema = z.enum(["all", "unverified", "suspended"]);

/** GET /api/admin/organizations — moderation queue. */
adminRouter.get("/organizations", async (req, res, next) => {
  try {
    const filter = orgFilterSchema.catch("all").parse(req.query.filter);
    const page = pageSchema.parse(req.query.page);
    res.json(await adminService.listOrganizationsForAdmin(filter, page));
  } catch (err) {
    next(err);
  }
});

const verifySchema = z.object({
  verified: z.boolean(),
  reason: z.string().trim().max(400).optional(),
});

/** POST /api/admin/organizations/:id/verify */
adminRouter.post("/organizations/:id/verify", async (req, res, next) => {
  try {
    const { verified, reason } = verifySchema.parse(req.body);
    res.json(
      await adminService.setOrganizationVerified(
        req.user!.id,
        req.params.id,
        verified,
        reason,
      ),
    );
  } catch (err) {
    next(err);
  }
});

const suspendSchema = z.object({
  suspended: z.boolean(),
  reason: z.string().trim().max(400).optional(),
});

/** POST /api/admin/organizations/:id/suspend */
adminRouter.post("/organizations/:id/suspend", async (req, res, next) => {
  try {
    const { suspended, reason } = suspendSchema.parse(req.body);
    res.json(
      await adminService.setOrganizationSuspended(
        req.user!.id,
        req.params.id,
        suspended,
        reason,
      ),
    );
  } catch (err) {
    next(err);
  }
});

/** GET /api/admin/users */
adminRouter.get("/users", async (req, res, next) => {
  try {
    const search =
      typeof req.query.search === "string" ? req.query.search : undefined;
    // An invalid role (e.g. "?role=SUPERUSER") must not reach Prisma at all —
    // it would throw a raw driver error there and surface as an opaque 500.
    const role = roleSchema.optional().catch(undefined).parse(req.query.role);
    const page = pageSchema.parse(req.query.page);
    res.json(await adminService.listUsers(search, role, page));
  } catch (err) {
    next(err);
  }
});

/** POST /api/admin/users/:id/suspend */
adminRouter.post("/users/:id/suspend", async (req, res, next) => {
  try {
    const { suspended, reason } = suspendSchema.parse(req.body);
    res.json(
      await adminService.setUserSuspended(
        req.user!.id,
        req.params.id,
        suspended,
        reason,
      ),
    );
  } catch (err) {
    next(err);
  }
});

/** GET /api/admin/audit — the compliance trail. */
adminRouter.get("/audit", async (req, res, next) => {
  try {
    const page = pageSchema.parse(req.query.page);
    res.json(await listAuditLogs(page));
  } catch (err) {
    next(err);
  }
});
