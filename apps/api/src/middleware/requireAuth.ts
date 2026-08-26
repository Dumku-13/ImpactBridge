import type { NextFunction, Request, Response } from "express";
import type { Role } from "@impactbridge/shared";
import { verifyAccessToken } from "../lib/auth/tokens.js";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "./errorHandler.js";

/**
 * Attach the authenticated user to the request object.
 * Declaring it on Express's own interface means `req.user` is fully typed in
 * every downstream handler, with no casting.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; role: Role; email: string };
    }
  }
}

/**
 * Load the fields that can change after the access token was issued.
 * Shared by requireAuth and optionalAuth so the two never drift apart on what
 * "fresh" means.
 */
function loadLiveUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, status: true },
  });
}

/**
 * Gate: the caller must present a valid access token.
 *
 * The JWT signature alone only proves the token was minted by us at issue
 * time — it says nothing about whether the account has since been suspended
 * or had its role changed. So after verifying the signature we also load the
 * user by primary key and use the DB's role/status rather than the token's.
 * Deliberate tradeoff: every authenticated request now costs one indexed
 * primary-key read, in exchange for a suspension (or role change) taking
 * effect on the very next request instead of up to 15 minutes later, whenever
 * the old access token happened to expire.
 */
export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return next(new HttpError(401, "Authentication required"));
  }

  const payload = verifyAccessToken(header.slice("Bearer ".length));
  if (!payload) {
    // The client's interceptor watches for this to trigger a token refresh.
    return next(new HttpError(401, "Invalid or expired access token"));
  }

  try {
    const user = await loadLiveUser(payload.sub);

    if (!user) {
      // Account no longer exists (e.g. deleted since the token was issued).
      return next(new HttpError(401, "Invalid or expired access token"));
    }

    if (user.status === "SUSPENDED") {
      return next(new HttpError(403, "This account has been suspended."));
    }

    req.user = { id: user.id, role: user.role, email: payload.email };
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Attach the user if a valid token is present, but never reject.
 *
 * Used for public endpoints that personalise when signed in — browsing
 * organisations works logged out, and additionally reports bookmark/follow
 * state when we know who is asking. A suspended (or deleted) account, or any
 * DB error while checking, simply falls back to anonymous rather than
 * failing the request — this middleware never blocks a page that would
 * otherwise work fine signed out.
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization;

  if (header?.startsWith("Bearer ")) {
    const payload = verifyAccessToken(header.slice("Bearer ".length));
    if (payload) {
      try {
        const user = await loadLiveUser(payload.sub);
        if (user && user.status !== "SUSPENDED") {
          req.user = { id: user.id, role: user.role, email: payload.email };
        }
      } catch {
        // Best-effort personalisation only — swallow and stay anonymous.
      }
    }
  }

  next();
}

/**
 * Gate: the caller's role must be in the allowed list.
 * Always used AFTER requireAuth, e.g.
 *   router.post("/grants", requireAuth, requireRole("FUNDER"), handler)
 *
 * 403 (not 401) is deliberate: the user proved who they are, they just aren't
 * permitted — so the client should show "not allowed", not a login prompt.
 */
export function requireRole(...allowed: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new HttpError(401, "Authentication required"));
    }
    if (!allowed.includes(req.user.role)) {
      return next(
        new HttpError(403, "You do not have permission to perform this action"),
      );
    }
    next();
  };
}
