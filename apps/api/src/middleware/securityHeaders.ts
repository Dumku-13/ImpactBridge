import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { isProduction } from "../config/env.js";

/**
 * Security response headers, written by hand instead of pulled from helmet.
 *
 * Why not helmet: this service answers JSON and nothing else, so the policy it
 * needs is both much TIGHTER and much simpler than helmet's defaults, which are
 * tuned for a server that renders pages. helmet's out-of-the-box CSP allows
 * `default-src 'self'` — sensible for a site, far too generous for an API that
 * should never be a script, style or frame source for anything. Writing the six
 * headers out is a dozen lines, it says exactly what we mean, and it is one
 * fewer dependency in the audit surface of a platform that moves money.
 *
 * Mounted first in createApp so every response carries these — including 404s
 * and error responses, which are exactly the ones a scanner probes.
 */

/**
 * Content-Security-Policy for a pure JSON endpoint.
 *
 * `default-src 'none'` is the whole point: there is no legitimate reason for a
 * JSON response to load a script, a font, an image or a frame, so nothing is
 * allowed at all. If an attacker ever gets HTML reflected out of this API, the
 * browser has been told in advance to run none of it.
 *
 * `frame-ancestors 'none'` is the modern half of clickjacking defence (the
 * X-Frame-Options below is the half old browsers still understand), and
 * `base-uri 'none'` stops an injected <base> tag from re-pointing every
 * relative URL on a page at an attacker's host.
 */
const JSON_API_CSP =
  "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

/**
 * Two years, the minimum the browser preload lists accept, and long enough that
 * a returning visitor is never downgraded to http in between.
 */
const HSTS_MAX_AGE_SECONDS = 63_072_000; // 2 years

export function securityHeaders(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  // Stops a browser from second-guessing our Content-Type. Without it, a JSON
  // response containing attacker-chosen text can be sniffed as HTML and run.
  res.set("X-Content-Type-Options", "nosniff");

  // No page on this origin should ever be framed. Belt and braces with the
  // frame-ancestors directive above, for browsers that predate CSP Level 2.
  res.set("X-Frame-Options", "DENY");

  // Never leak the URL a request came from. API paths carry ids (donation,
  // application, organisation) that have no business appearing in a third
  // party's logs because someone clicked a link.
  res.set("Referrer-Policy", "no-referrer");

  // This API needs none of these, so it gives up its right to ask for them.
  // `interest-cohort=()` opts out of FLoC-style topic profiling.
  res.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  );

  // Isolates our browsing-context group from anything that opens us via
  // window.open, so a hostile opener cannot reach into our window object.
  res.set("Cross-Origin-Opener-Policy", "same-origin");

  // Only our own site may embed these responses as a subresource. The web app
  // is served same-site (Render proxies /api/* through the static site), so
  // "same-site" is correct and does not need to be "cross-origin".
  res.set("Cross-Origin-Resource-Policy", "same-site");

  res.set("Content-Security-Policy", JSON_API_CSP);

  /*
   * HSTS is PRODUCTION ONLY, and that is not a stylistic choice.
   *
   * The header is remembered per HOST, not per port or scheme. Sending it from
   * http://localhost:4000 pins `localhost` to https in the developer's browser
   * for the full max-age — and localhost has no certificate, so every local
   * project on that machine, not just this one, becomes unreachable. Undoing it
   * means hunting through chrome://net-internals/#hsts by hand. It is a genuinely
   * painful, entirely self-inflicted outage, so the header never leaves
   * production.
   */
  if (isProduction) {
    res.set(
      "Strict-Transport-Security",
      `max-age=${HSTS_MAX_AGE_SECONDS}; includeSubDomains`,
    );
  }

  next();
}

/**
 * Relax the CSP for the two routes that genuinely serve HTML, and return a
 * nonce to put on their <style> and <script> tags.
 *
 * This API is "JSON only" with exactly two documented exceptions — the donation
 * receipt (GET /api/donations/:id/receipt) and the mock gateway's payment page
 * (GET /api/mock-checkout/:orderId). Both are self-contained pages with inline
 * CSS and, in the mock's case, inline JS. Under the `default-src 'none'` policy
 * above they render as unstyled text with dead buttons — which for the mock
 * gateway means the DONATION FLOW SILENTLY STOPS WORKING, since that page is
 * how a payment is completed when no real gateway is configured.
 *
 * A per-response nonce rather than 'unsafe-inline': the nonce is fresh random
 * bytes each time, so only the exact tags we emitted run. That keeps the
 * exception narrow instead of turning these two pages into a general hole.
 */
export function htmlPageCsp(res: Response): string {
  const nonce = crypto.randomBytes(16).toString("base64");

  res.set(
    "Content-Security-Policy",
    [
      "default-src 'none'",
      `style-src 'nonce-${nonce}'`,
      `script-src 'nonce-${nonce}'`,
      // The mock checkout page POSTs back to its own /settle endpoint.
      "connect-src 'self'",
      "img-src 'self' data:",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join("; "),
  );

  return nonce;
}
