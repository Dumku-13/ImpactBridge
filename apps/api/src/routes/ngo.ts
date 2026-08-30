import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import {
  MAX_UPLOAD_BYTES,
  organizationImageKindSchema,
  updateOrganizationSchema,
  uploadDocumentSchema,
  upsertImpactMetricSchema,
  upsertTeamMemberSchema,
} from "@impactbridge/shared";
import * as ngoService from "../services/ngoService.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";
import {
  DOCUMENT_MIME_TYPES,
  IMAGE_MIME_TYPES,
  assertDeclaredTypeMatchesBytes,
} from "../lib/fileType.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { HttpError } from "../middleware/errorHandler.js";

export const ngoRouter: Router = Router();

/** Every route here requires a signed-in NGO admin. */
ngoRouter.use(requireAuth, requireRole("NGO_ADMIN"));

/**
 * `?page=abc` becomes `skip: NaN` and `?page=0`/negative values reverse or
 * corrupt Prisma's pagination silently instead of erroring — coerce and clamp
 * at the boundary so bad input becomes a sane default, not a 500.
 */
const pageSchema = z.coerce.number().int().min(1).catch(1);
const pageSizeSchema = (max: number) =>
  z.coerce.number().int().min(1).max(max).catch(20);

/** Uploads go straight to Cloudinary; throttle so one account can't burn the shared quota. */
const uploadRateLimit = rateLimit({ windowMs: 60_000, max: 20 });

/**
 * Files are buffered in memory rather than written to disk: they go straight
 * back out to Cloudinary, so a temp file would only add cleanup work and a
 * place for uploads to pile up. The size limit is enforced here, before the
 * body is fully read, so an oversized file is rejected without being buffered.
 *
 * ── Two stages, because a declared type proves nothing ───────────────────────
 *
 * `fileFilter` below screens on `file.mimetype`, which is copied from the
 * multipart part header — chosen entirely by whoever is uploading. It is a
 * cheap first pass that rejects the honest mistake (someone picks a .zip) before
 * a single byte is buffered, and that is ALL it is: a script can label a shell
 * script `image/png` and sail through it.
 *
 * The real check is `assertDeclaredTypeMatchesBytes` in each handler, which
 * reads the magic number off the buffer and refuses anything whose contents
 * disagree with its label. Both stages are needed — the filter for the cheap
 * early exit, the sniff for the actual guarantee — and the sniff cannot run
 * here because multer streams parts before the body is complete.
 */
function fileFilterFor(allowed: readonly string[]) {
  return (
    _req: Express.Request,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback,
  ) => {
    if (allowed.includes(file.mimetype.toLowerCase())) return cb(null, true);

    /*
     * Reject with an error rather than `cb(null, false)`. Passing `false`
     * silently drops the file and lets the handler run with `req.file`
     * undefined, which surfaces to the user as the misleading "No file was
     * uploaded." — they uploaded one; we refused it, and they deserve to know
     * which part was wrong.
     */
    cb(new HttpError(400, "That file type is not accepted. Upload a PNG, JPEG, WebP or PDF."));
  };
}

const uploadLimits = { fileSize: MAX_UPLOAD_BYTES, files: 1 };

/** Logos, covers, gallery pictures, team photos — a picture or nothing. */
const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: uploadLimits,
  fileFilter: fileFilterFor(IMAGE_MIME_TYPES),
});

/** Registration certificates and the like: a PDF, or a photo of the paperwork. */
const uploadDoc = multer({
  storage: multer.memoryStorage(),
  limits: uploadLimits,
  fileFilter: fileFilterFor(DOCUMENT_MIME_TYPES),
});

/** GET /api/ngo/organization — the signed-in NGO's own profile. */
ngoRouter.get("/organization", async (req, res, next) => {
  try {
    res.json(await ngoService.getMyOrganization(req.user!.id));
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/ngo/organization — save profile edits. */
ngoRouter.patch("/organization", async (req, res, next) => {
  try {
    const input = updateOrganizationSchema.parse(req.body);
    res.json(await ngoService.updateMyOrganization(req.user!.id, input));
  } catch (err) {
    next(err);
  }
});

/** POST /api/ngo/organization/image/:kind — replace the logo or cover. */
ngoRouter.post(
  "/organization/image/:kind",
  uploadRateLimit,
  uploadImage.single("file"),
  async (req, res, next) => {
    try {
      const kind = organizationImageKindSchema.parse(req.params.kind);

      if (!req.file) throw new HttpError(400, "No file was uploaded.");

      // Last gate before the bytes leave for Cloudinary. See fileType.ts.
      assertDeclaredTypeMatchesBytes(req.file);

      res.json(
        await ngoService.updateOrganizationImage(req.user!.id, kind, req.file),
      );
    } catch (err) {
      next(err);
    }
  },
);

/** GET /api/ngo/documents — everything this NGO has uploaded. */
ngoRouter.get("/documents", async (req, res, next) => {
  try {
    res.json({ items: await ngoService.listMyDocuments(req.user!.id) });
  } catch (err) {
    next(err);
  }
});

/** POST /api/ngo/documents — upload one document or gallery image. */
ngoRouter.post(
  "/documents",
  uploadRateLimit,
  uploadDoc.single("file"),
  async (req, res, next) => {
    try {
      // Multipart text fields arrive as strings alongside the file.
      const input = uploadDocumentSchema.parse(req.body);

      if (!req.file) throw new HttpError(400, "No file was uploaded.");

      // Last gate before the bytes leave for Cloudinary. See fileType.ts.
      assertDeclaredTypeMatchesBytes(req.file);

      res
        .status(201)
        .json(await ngoService.uploadDocument(req.user!.id, input, req.file));
    } catch (err) {
      next(err);
    }
  },
);

/** DELETE /api/ngo/documents/:id */
ngoRouter.delete("/documents/:id", async (req, res, next) => {
  try {
    res.json(await ngoService.deleteDocument(req.user!.id, req.params.id));
  } catch (err) {
    next(err);
  }
});

/* ── Impact metrics ───────────────────────────────────────────────────────── */

/** GET /api/ngo/metrics */
ngoRouter.get("/metrics", async (req, res, next) => {
  try {
    res.json({ items: await ngoService.listImpactMetrics(req.user!.id) });
  } catch (err) {
    next(err);
  }
});

/** POST /api/ngo/metrics */
ngoRouter.post("/metrics", async (req, res, next) => {
  try {
    const input = upsertImpactMetricSchema.parse(req.body);
    res.status(201).json(await ngoService.createImpactMetric(req.user!.id, input));
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/ngo/metrics/:id */
ngoRouter.patch("/metrics/:id", async (req, res, next) => {
  try {
    const input = upsertImpactMetricSchema.parse(req.body);
    res.json(
      await ngoService.updateImpactMetric(req.user!.id, req.params.id, input),
    );
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/ngo/metrics/:id */
ngoRouter.delete("/metrics/:id", async (req, res, next) => {
  try {
    res.json(await ngoService.deleteImpactMetric(req.user!.id, req.params.id));
  } catch (err) {
    next(err);
  }
});

/* ── Team members ─────────────────────────────────────────────────────────── */

/** GET /api/ngo/team */
ngoRouter.get("/team", async (req, res, next) => {
  try {
    res.json({ items: await ngoService.listTeamMembers(req.user!.id) });
  } catch (err) {
    next(err);
  }
});

/** POST /api/ngo/team */
ngoRouter.post("/team", async (req, res, next) => {
  try {
    const input = upsertTeamMemberSchema.parse(req.body);
    res.status(201).json(await ngoService.createTeamMember(req.user!.id, input));
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/ngo/team/:id */
ngoRouter.patch("/team/:id", async (req, res, next) => {
  try {
    const input = upsertTeamMemberSchema.parse(req.body);
    res.json(
      await ngoService.updateTeamMember(req.user!.id, req.params.id, input),
    );
  } catch (err) {
    next(err);
  }
});

/** POST /api/ngo/team/:id/photo — upload or replace a member's photo. */
ngoRouter.post(
  "/team/:id/photo",
  uploadRateLimit,
  uploadImage.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file) throw new HttpError(400, "No file was uploaded.");

      // Last gate before the bytes leave for Cloudinary. See fileType.ts.
      assertDeclaredTypeMatchesBytes(req.file);

      res.json(
        await ngoService.updateTeamMemberPhoto(
          req.user!.id,
          req.params.id,
          req.file,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

/** DELETE /api/ngo/team/:id */
ngoRouter.delete("/team/:id", async (req, res, next) => {
  try {
    res.json(await ngoService.deleteTeamMember(req.user!.id, req.params.id));
  } catch (err) {
    next(err);
  }
});

/* ── Donations received & analytics ───────────────────────────────────────── */

/** GET /api/ngo/donations — money that actually arrived, newest first. */
ngoRouter.get("/donations", async (req, res, next) => {
  try {
    const page = pageSchema.parse(req.query.page);
    const pageSize = pageSizeSchema(50).parse(req.query.pageSize);
    res.json(
      await ngoService.listOrganizationDonations(req.user!.id, page, pageSize),
    );
  } catch (err) {
    next(err);
  }
});

/** GET /api/ngo/analytics — headline figures, 12-month series, top donors. */
ngoRouter.get("/analytics", async (req, res, next) => {
  try {
    res.json(await ngoService.getOrganizationAnalytics(req.user!.id));
  } catch (err) {
    next(err);
  }
});
