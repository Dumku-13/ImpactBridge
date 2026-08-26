import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import type { Role } from "@impactbridge/shared";
import { env } from "../../config/env.js";

/**
 * ── The two-token model ──────────────────────────────────────────────────────
 *
 * ACCESS TOKEN  — a short-lived (15 min) signed JWT sent on every request in the
 *   `Authorization: Bearer` header. It is stateless: we verify the signature and
 *   trust the claims, no database hit. Kept in memory on the client only, never
 *   in localStorage (which is readable by any injected script → XSS risk).
 *
 * REFRESH TOKEN — a long-lived (30 day) random string stored in an httpOnly,
 *   sameSite cookie. JavaScript cannot read it, so XSS cannot steal it. It is
 *   ALSO stored server-side (hashed) as a RefreshToken row, which is what lets
 *   us revoke sessions — something a pure stateless JWT can never do.
 *
 * The trade-off: a stolen access token is only useful for 15 minutes, while the
 * thing that lasts 30 days is unreadable by scripts and revocable by us.
 */

export const ACCESS_TOKEN_TTL = "15m";
export const REFRESH_TOKEN_TTL_DAYS = 30;

/** Claims we embed in the access token. Keep it small — it travels on every request. */
export interface AccessTokenPayload {
  sub: string; // user id
  role: Role;
  email: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL,
    issuer: "impactbridge",
  });
}

/** Returns the decoded payload, or null if the token is invalid/expired/forged. */
export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: "impactbridge",
    });
    if (typeof decoded === "string") return null;
    return decoded as unknown as AccessTokenPayload;
  } catch {
    return null;
  }
}

/**
 * Generate an opaque, cryptographically-random token plus its hash.
 *
 * We hand the RAW value to the user (in a cookie or an email link) and persist
 * only the HASH. Consequence: a database leak exposes no usable tokens, exactly
 * like password hashes. SHA-256 is the right tool here (unlike for passwords)
 * because the input is already 256 bits of entropy — it cannot be brute-forced,
 * so a slow hash would only cost us performance.
 */
export function generateSecureToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString("hex");
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function refreshTokenExpiry(): Date {
  return new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/** Email verification and password reset links expire much faster. */
export function shortTokenExpiry(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}
