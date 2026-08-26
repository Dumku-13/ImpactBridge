import type { Response } from "express";
import { isProduction } from "../../config/env.js";
import { REFRESH_TOKEN_TTL_DAYS } from "./tokens.js";

export const REFRESH_COOKIE_NAME = "ib_refresh";

/**
 * Cookie flags, and why each one matters:
 *
 *   httpOnly — JavaScript cannot read it. This is the single most important
 *              flag: it means an XSS bug cannot exfiltrate the refresh token.
 *   secure   — only sent over HTTPS. Off in dev because localhost is http.
 *   sameSite — 'lax' blocks the cookie on cross-site POSTs, which is our CSRF
 *              defence. In production the API and web app share a site, so we
 *              keep 'lax'; if they were on different domains we'd need 'none'
 *              plus an explicit CSRF token.
 *   path     — scoped to /api/auth so the cookie is only sent to the endpoints
 *              that actually need it, not on every API call.
 */
export function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/api/auth",
    maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/api/auth",
  });
}
