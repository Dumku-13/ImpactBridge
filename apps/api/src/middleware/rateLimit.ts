import type { NextFunction, Request, Response } from "express";
import { HttpError } from "./errorHandler.js";

/**
 * A minimal in-memory rate limiter for auth endpoints.
 *
 * Without this, /login is an open door for credential-stuffing: an attacker can
 * try millions of passwords. Throttling by IP makes that impractical.
 *
 * Scope note: state lives in this process's memory, so it resets on restart and
 * doesn't coordinate across instances. That's fine for now — when we add Redis
 * in Phase 6 we swap the Map for a Redis counter and it works cluster-wide.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Drop expired buckets periodically so the Map can't grow without bound.
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, CLEANUP_INTERVAL_MS);
// Don't hold the event loop open just for the cleaner.
cleanupTimer.unref();

export function rateLimit(options: {
  windowMs: number;
  max: number;
  message?: string;
}) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      return next();
    }

    bucket.count += 1;

    if (bucket.count > options.max) {
      const retryInSeconds = Math.ceil((bucket.resetAt - now) / 1000);
      return next(
        new HttpError(
          429,
          options.message ??
            `Too many requests. Please try again in ${retryInSeconds} seconds.`,
        ),
      );
    }

    next();
  };
}

/** Tight limit for endpoints an attacker would brute-force. */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many attempts. Please wait a few minutes and try again.",
});
