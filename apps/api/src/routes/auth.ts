import { Router } from "express";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "@impactbridge/shared";
import * as authService from "../services/authService.js";
import {
  REFRESH_COOKIE_NAME,
  clearRefreshCookie,
  setRefreshCookie,
} from "../lib/auth/cookies.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { loginAccountRateLimit, rateLimit } from "../middleware/rateLimit.js";
import { botGuard } from "../middleware/botGuard.js";
import { HttpError } from "../middleware/errorHandler.js";

export const authRouter: Router = Router();

/*
 * An EXTRA throttle on the one endpoint that makes our server send mail to an
 * address the requester chose.
 *
 * `/api/auth` as a whole already carries `authRateLimit` (20 per 15 minutes per
 * IP per path, wired in app.ts). That is the right ceiling for guessing a
 * password — it is far too generous for an endpoint whose cost is borne by a
 * stranger's inbox, so this one is five.
 *
 * `name` matters: bucket keys are `ip:path:name`, and without a distinct name
 * this limiter would share a bucket with the router-level one, count the same
 * request twice, and silently halve both limits.
 */
const passwordResetLimit = rateLimit({
  name: "forgot-password",
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many reset requests. Wait a few minutes and try again.",
});

/**
 * Every handler validates its body with a schema from @impactbridge/shared —
 * the exact same schema the web form uses. Anything that fails validation is
 * thrown as a ZodError and formatted into per-field messages by errorHandler.
 *
 * Never trust the client's validation: the browser check is UX, this one is
 * the actual security boundary.
 */

/*
 * `botGuard` runs on the three endpoints a spam script targets: the two that
 * make us send mail to an address the sender chose (register, forgot-password)
 * and the one worth guessing at (login). It reads `_hp` and `_ts` off the raw
 * body BEFORE the schema parse strips them as unknown keys, which is why it is
 * middleware here rather than a check inside each handler.
 */

/** POST /api/auth/register — create account, email a verification link. */
authRouter.post("/register", botGuard, async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const user = await authService.register(input);

    res.status(201).json({
      user,
      message:
        "Account created. Check your email for a verification link to activate it.",
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/login — returns an access token + sets the refresh cookie.
 *
 * Two limiters, on purpose: the router-level per-IP one from app.ts stops a
 * single machine grinding through passwords, and `loginAccountRateLimit` stops
 * a distributed attack concentrating on ONE account from many addresses.
 * Neither covers the other's case.
 */
authRouter.post("/login", botGuard, loginAccountRateLimit, async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const { user, accessToken, refreshToken } = await authService.login(
      input,
      req.headers["user-agent"],
    );

    setRefreshCookie(res, refreshToken);
    res.json({ user, accessToken });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/refresh — silently renew the access token.
 *
 * The browser sends the refresh cookie automatically; there is no request body.
 * This is what keeps a user logged in for 30 days while access tokens expire
 * every 15 minutes.
 */
authRouter.post("/refresh", async (req, res, next) => {
  try {
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!rawToken) {
      throw new HttpError(401, "No active session");
    }

    const { user, accessToken, refreshToken } =
      await authService.refreshSession(rawToken, req.headers["user-agent"]);

    // Rotation: the cookie is replaced with the newly issued token.
    setRefreshCookie(res, refreshToken);
    res.json({ user, accessToken });
  } catch (err) {
    // A bad/expired refresh token should also clear the stale cookie.
    clearRefreshCookie(res);
    next(err);
  }
});

/** POST /api/auth/logout — revoke this session server-side and drop the cookie. */
authRouter.post("/logout", async (req, res, next) => {
  try {
    await authService.logout(req.cookies?.[REFRESH_COOKIE_NAME]);
    clearRefreshCookie(res);
    res.json({ message: "Signed out successfully" });
  } catch (err) {
    next(err);
  }
});

/** POST /api/auth/verify-email — activate an account from the emailed link. */
authRouter.post("/verify-email", async (req, res, next) => {
  try {
    const { token } = verifyEmailSchema.parse(req.body);
    const user = await authService.verifyEmail(token);
    res.json({ user, message: "Email verified. You can now sign in." });
  } catch (err) {
    next(err);
  }
});

/** POST /api/auth/forgot-password — always returns the same generic message. */
authRouter.post("/forgot-password", botGuard, passwordResetLimit, async (req, res, next) => {
  try {
    const input = forgotPasswordSchema.parse(req.body);
    await authService.forgotPassword(input);

    // Deliberately identical whether or not the account exists.
    res.json({
      message:
        "If an account exists for that email, we've sent a password reset link.",
    });
  } catch (err) {
    next(err);
  }
});

/** POST /api/auth/reset-password — set a new password and kill all sessions. */
authRouter.post("/reset-password", async (req, res, next) => {
  try {
    const input = resetPasswordSchema.parse(req.body);
    await authService.resetPassword(input);
    res.json({
      message:
        "Password updated. You've been signed out everywhere — sign in with your new password.",
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/auth/me — the current user, used to rehydrate the client on load. */
authRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await authService.getCurrentUser(req.user!.id);
    res.json({ user });
  } catch (err) {
    next(err);
  }
});
