import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { isProduction } from "../config/env.js";

/**
 * An error we intentionally threw, with an HTTP status attached.
 * Use: `throw new HttpError(404, "Organization not found")`
 */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** 404 handler — runs when no route matched. */
export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: { message: `Route not found: ${req.method} ${req.originalUrl}` },
  });
}

/**
 * Central error handler. Express recognises it as an error middleware because
 * it takes FOUR arguments — that signature is load-bearing, don't trim it.
 *
 * Every error in the app funnels through here so the client always receives a
 * consistent `{ error: { message, details? } }` shape.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
) {
  // Zod validation failures → 400 with per-field messages
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        message: "Validation failed",
        details: err.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      },
    });
  }

  if (err instanceof HttpError) {
    return res.status(err.status).json({
      error: { message: err.message, details: err.details },
    });
  }

  /*
   * Multer rejects oversized or unexpected uploads with a MulterError. Without
   * this branch those surface as an opaque 500, so a user uploading a 20 MB
   * scan would be told "internal server error" instead of what to do about it.
   * Matched structurally to avoid importing multer into the error handler.
   */
  if (
    err instanceof Error &&
    err.name === "MulterError" &&
    "code" in err &&
    typeof err.code === "string"
  ) {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "That file is too large — the limit is 10 MB."
        : err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE"
          ? "Upload one file at a time."
          : "That upload could not be processed.";

    return res.status(400).json({ error: { message } });
  }

  // Anything unexpected: log the real error, but never leak internals to clients.
  console.error("Unhandled error:", err);
  return res.status(500).json({
    error: {
      message: isProduction
        ? "Internal server error"
        : err instanceof Error
          ? err.message
          : "Internal server error",
    },
  });
}
