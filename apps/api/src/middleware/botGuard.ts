import type { NextFunction, Request, Response } from "express";
import { HttpError } from "./errorHandler.js";

/**
 * Two cheap, no-dependency checks against automated form submission.
 *
 * ── Be honest about what this is ─────────────────────────────────────────────
 *
 * This stops NAIVE bots: the scripted form-fillers that crawl a page, populate
 * every input they can see, and POST immediately. That is the overwhelming
 * majority of signup and password-reset spam, and it costs us nothing to
 * refuse.
 *
 * It stops a targeted attacker for roughly the length of time it takes them to
 * read the page source once. Both signals are client-supplied and both are
 * trivially defeated on purpose — omit `_hp`, send a `_ts` from two seconds
 * ago, done. So this is a spam filter, NOT an access control, and nothing
 * downstream may assume a request that got past it is human. The real defences
 * remain the rate limiters, email verification, and Argon2 on the password.
 *
 * ── The contract with the web app ────────────────────────────────────────────
 *
 * `_hp`  A honeypot text input the form renders but hides from human eyes. A
 *        real user cannot fill a field they cannot see; a bot filling every
 *        input will.
 * `_ts`  `Date.now()` captured when the form mounted. The gap to arrival is how
 *        long the user spent on the form.
 *
 * BOTH ARE OPTIONAL. curl, the workflow tests, and any future mobile client
 * send neither and must keep working — a missing signal is "unknown", never
 * "suspicious". Only a signal that is present AND fails is rejected.
 *
 * The Zod schemas these routes parse with are non-strict, so both fields are
 * stripped as unknown keys before validation ever sees them (verified against
 * zod 3.25: `z.object().parse()` drops unrecognised keys rather than erroring).
 * They therefore need no schema change on either side.
 */

/**
 * The floor for a human filling in a form.
 *
 * Deliberately low. A fast returning user with a password manager can submit a
 * login in well under two seconds, and rejecting them would be far worse than
 * letting a slow bot through — so this only catches submissions that are
 * physically impossible, not merely quick.
 *
 * This was 1200ms, which did not honour the paragraph above it. A password
 * manager fills both fields the instant the form mounts, and a returning user
 * pressing Enter lands somewhere around 700-900ms — inside the window. The
 * failure mode is the worst one available here: correct credentials rejected
 * with a message that reads like a validation error, intermittently, only for
 * the users who move fastest, and never reproducibly for whoever is debugging
 * it. That is a login that "sometimes doesn't work" with nothing in the logs
 * to explain why.
 *
 * 400ms is the floor a human cannot beat: it still takes a real pointer or a
 * keystroke to reach the submit control after paint. Scripted submissions post
 * within a few milliseconds of mount and are still caught.
 */
const MIN_FILL_MS = 400;

/**
 * One message for every rejection, matching what a validation failure looks
 * like. Naming the honeypot ("you filled the hidden field") would hand a bot
 * author the exact feedback they need to fix their script on the first try.
 */
const REJECTION = "That submission looked automated. Please try again.";

export function botGuard(req: Request, _res: Response, next: NextFunction) {
  const body = req.body as Record<string, unknown> | undefined;

  if (!body || typeof body !== "object") return next();

  // ── Honeypot ──
  const honeypot = body._hp;

  if (typeof honeypot === "string" && honeypot.trim() !== "") {
    return next(new HttpError(400, REJECTION));
  }

  // ── Time-to-fill ──
  const timestamp = body._ts;

  /*
   * Accept a number or a numeric string: multipart and some form libraries
   * stringify everything, and silently ignoring a valid-but-stringy `_ts` would
   * turn this check off without anyone noticing.
   */
  const startedAt =
    typeof timestamp === "number"
      ? timestamp
      : typeof timestamp === "string" && timestamp.trim() !== ""
        ? Number(timestamp)
        : Number.NaN;

  if (!Number.isFinite(startedAt)) return next();

  const elapsed = Date.now() - startedAt;

  /*
   * Only a too-FAST submission is rejected. A negative elapsed time means the
   * client's clock is ahead of ours — which is common, entirely innocent, and
   * must not lock someone out of their own account — and a large one just means
   * they left the tab open over lunch. Neither is evidence of anything.
   */
  if (elapsed >= 0 && elapsed < MIN_FILL_MS) {
    return next(new HttpError(400, REJECTION));
  }

  next();
}
