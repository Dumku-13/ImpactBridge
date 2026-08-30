import type { NextFunction, Request, Response } from "express";
import { isProduction } from "../config/env.js";
import { HttpError } from "./errorHandler.js";

/**
 * Refuse to serve production traffic over plain http.
 *
 * TLS terminates at Render's edge, so by the time a request reaches this
 * process it is always http on the wire — `req.protocol` alone would say "http"
 * for everyone and this middleware would redirect in a loop. The only honest
 * signal is `x-forwarded-proto`, which the edge sets to whatever the BROWSER
 * used. The app already runs with `trust proxy`, so Express derives `req.secure`
 * from the same header; we read it directly to keep the logic legible.
 */
export function forceHttps(req: Request, res: Response, next: NextFunction) {
  if (!isProduction) return next();

  /*
   * Never touch the health check.
   *
   * Render polls `/api/health` to decide whether a deploy is live. That probe
   * comes from inside the private network, not through the TLS edge, so it
   * carries no `x-forwarded-proto` at all. Answering it with a redirect (or a
   * 403) means the health check never sees a 200, Render marks the deploy
   * unhealthy, and it rolls back — a self-inflicted outage caused entirely by
   * the middleware that was meant to harden the service. The `header is absent`
   * branch below would already let it through; this is the explicit belt to
   * that braces, so nobody has to rediscover why by watching a deploy fail.
   */
  if (req.path === "/health" || req.path === "/api/health") return next();

  const forwarded = req.headers["x-forwarded-proto"];

  /*
   * Absent header = not a request that came through the TLS edge (internal
   * health checks, container-to-container calls). Fail OPEN here: there is no
   * public listener on plain http to protect, and failing closed would break
   * exactly the internal traffic that keeps the service alive.
   *
   * A chain of proxies appends rather than replaces, so this can arrive as
   * "https,http" — the FIRST value is the one the browser actually used.
   */
  if (typeof forwarded !== "string" || forwarded.length === 0) return next();

  const clientProtocol = forwarded.split(",")[0]!.trim().toLowerCase();

  if (clientProtocol === "https") return next();

  /*
   * ── Only SAFE methods get redirected ────────────────────────────────────────
   *
   * A 301/302 tells the browser to re-issue the request at the new URL, and for
   * anything other than GET/HEAD it is allowed to drop the body doing so (most
   * clients downgrade the method to GET outright). So "helpfully" redirecting a
   * POST would deliver an empty, method-mangled request to the https endpoint:
   * a donation form that silently submits nothing, and — far worse — a payment
   * webhook whose signed body vanishes, so the signature check fails and the
   * donation is never recorded. The failure would look like a gateway problem,
   * not like a redirect.
   *
   * A non-safe method over plain http is therefore refused outright. The client
   * is told to use https and can retry with its body intact, which is the only
   * outcome that cannot lose data.
   */
  if (req.method !== "GET" && req.method !== "HEAD") {
    return next(
      new HttpError(403, "This API is only available over HTTPS. Retry using https://."),
    );
  }

  /*
   * `Host` is client-supplied, and blindly interpolating it builds an open
   * redirect. A legitimate authority is host[:port] and nothing else, so
   * anything carrying a path, a scheme or credentials is refused rather than
   * bounced to whatever domain the sender named.
   */
  const host = req.headers.host;

  if (!host || !/^[a-zA-Z0-9.\-]+(:\d+)?$/.test(host)) {
    return next(new HttpError(400, "Invalid Host header"));
  }

  return res.redirect(301, `https://${host}${req.originalUrl}`);
}
