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

function sweepExpired(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

// Drop expired buckets periodically so the Map can't grow without bound.
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const cleanupTimer = setInterval(() => {
  sweepExpired(Date.now());
}, CLEANUP_INTERVAL_MS);
// Don't hold the event loop open just for the cleaner.
cleanupTimer.unref();

/**
 * Hard ceiling on how many buckets may exist between sweeps.
 *
 * The periodic sweep is enough when keys are IPs, but a limiter keyed on
 * something from the REQUEST BODY (see loginAccountRateLimit) can be handed a
 * fresh key on every request — a script posting a million distinct addresses
 * would pin a million buckets in memory for the full window and exhaust the
 * process long before the five-minute cleaner next ran.
 *
 * On hitting the cap we sweep early, and if that doesn't help we stop creating
 * NEW buckets and let those requests through. Failing open is deliberate: the
 * alternative is that flooding the map with junk keys locks every legitimate
 * user out of signing in, which converts a memory problem into a total outage.
 * Existing buckets keep counting, so an attack already in progress against one
 * account stays throttled.
 */
const MAX_BUCKETS = 50_000;

export function rateLimit(options: {
  windowMs: number;
  max: number;
  message?: string;
  /**
   * What to count per. Returns the identity to throttle, or undefined to skip
   * this request entirely.
   *
   * Defaults to the client IP, which is the right unit for "one machine is
   * hammering us". It is the wrong unit for "ten thousand machines are each
   * trying three passwords against one account" — for that, see
   * loginAccountRateLimit, which counts per account instead.
   */
  key?: (req: Request) => string | undefined;
  /**
   * Distinguishes this limiter's buckets from any other limiter's.
   *
   * Every limiter shares the Map above, and the key was `ip:path` alone — so
   * two limiters covering the same request (a router-level one plus a
   * route-level one, which is the obvious way to give a sensitive endpoint a
   * tighter cap) counted into the SAME bucket. Each request incremented it
   * twice, so both limits silently became half of what they said, and a user
   * hit "too many attempts" at five when the code claimed ten.
   *
   * Defaults to "default", which preserves the behaviour of a single limiter.
   */
  name?: string;
}) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const identity = options.key ? options.key(req) : req.ip;

    // No identity to count against (e.g. a login POST with no email in it, which
    // validation is about to reject anyway) — nothing to throttle.
    if (!identity) return next();

    const key = `${identity}:${req.path}:${options.name ?? "default"}`;
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      if (buckets.size >= MAX_BUCKETS) {
        sweepExpired(now);
        // Still full of live buckets: let it through rather than lock everyone
        // out. See the note on MAX_BUCKETS.
        if (buckets.size >= MAX_BUCKETS) return next();
      }

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

/**
 * A SECOND login bucket, counted per account instead of per IP.
 *
 * ── The gap this closes ──────────────────────────────────────────────────────
 *
 * `authRateLimit` above counts per IP, which stops one machine working through
 * a password list. It does nothing about the shape of attack that actually
 * succeeds: a credential-stuffing run spread over a botnet or a residential
 * proxy pool, where every request comes from a different address and each one
 * is comfortably inside the per-IP limit — while the ACCOUNT under attack
 * absorbs thousands of guesses. Counting per IP and counting per account are
 * answers to different questions, so both buckets exist.
 *
 * ── Not an enumeration oracle ────────────────────────────────────────────────
 *
 * The bucket is keyed on the address that was SUBMITTED, and this middleware
 * never looks in the database. An address with no account is throttled exactly
 * like one with an account: same threshold, same 429, same wording, same
 * timing. So "did I get rate limited?" tells an attacker nothing about who
 * banks here — which would otherwise undo the care taken in authService.login
 * to make wrong-password and no-such-user indistinguishable.
 *
 * ── The cost, stated plainly ─────────────────────────────────────────────────
 *
 * Anyone who knows your address can burn your ten attempts and keep you from
 * signing in for the rest of the window. That is a real, deliberate trade: a
 * fifteen-minute nuisance that resets by itself, accepted in exchange for
 * making a distributed guessing attack on one account infeasible. The account
 * is never disabled and nothing is emailed, so the lockout cannot be escalated
 * into anything more than the delay itself.
 */
export const loginAccountRateLimit = rateLimit({
  name: "login-account",
  windowMs: 15 * 60 * 1000,
  max: 10,
  // Word-for-word the per-IP message, so which limiter tripped is not itself a
  // signal an attacker can read.
  message: "Too many attempts. Please wait a few minutes and try again.",
  key: (req) => {
    const email = (req.body as { email?: unknown } | undefined)?.email;

    if (typeof email !== "string") return undefined;

    /*
     * Normalised the same way emailSchema does (trim + lowercase) so that
     * "Bob@Example.com " and "bob@example.com" land in ONE bucket. Without
     * this, case alone would hand an attacker unlimited fresh buckets for the
     * same account and the limit would be decorative.
     */
    const normalised = email.trim().toLowerCase();

    return normalised === "" ? undefined : `email:${normalised}`;
  },
});
