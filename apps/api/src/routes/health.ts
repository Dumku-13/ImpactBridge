import { Router } from "express";
import { healthResponseSchema } from "@impactbridge/shared";
import { prisma } from "../lib/prisma.js";

export const healthRouter: Router = Router();

/**
 * GET /health — liveness + database connectivity.
 *
 * We validate our OWN response with the shared schema before sending it. That
 * guarantees the API can never drift from the contract the web app relies on:
 * if we break the shape, this throws in development immediately.
 */
healthRouter.get("/health", async (_req, res, next) => {
  try {
    let db: "up" | "down" = "down";
    try {
      await prisma.$queryRaw`SELECT 1`;
      db = "up";
    } catch {
      db = "down";
    }

    const body = healthResponseSchema.parse({
      status: "ok",
      db,
      timestamp: new Date().toISOString(),
    });

    res.json(body);
  } catch (err) {
    next(err);
  }
});
