import type {
  ForgotPasswordInput,
  LoginInput,
  PublicUser,
  RegisterInput,
  ResetPasswordInput,
} from "@impactbridge/shared";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../lib/auth/password.js";
import {
  generateSecureToken,
  hashToken,
  refreshTokenExpiry,
  shortTokenExpiry,
  signAccessToken,
} from "../lib/auth/tokens.js";
import { toPublicUser } from "../lib/auth/serialize.js";
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "../lib/mailer.js";
import { HttpError } from "../middleware/errorHandler.js";

interface SessionResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

/**
 * How long a just-rotated refresh token stays acceptable.
 *
 * Rotation + concurrency is a classic race: two tabs refreshing at the same
 * instant both send the same cookie, one wins, and the loser would otherwise be
 * logged out despite doing nothing wrong. A short grace window absorbs that
 * while still treating a much-later replay as theft.
 */
const ROTATION_GRACE_MS = 15_000;

/** Issue a fresh access token + a new persisted refresh session. */
async function createSession(
  user: { id: string; role: PublicUser["role"]; email: string },
  userAgent?: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    email: user.email,
  });

  const { token: refreshToken, tokenHash } = generateSecureToken();

  await prisma.refreshToken.create({
    data: {
      tokenHash,
      userId: user.id,
      expiresAt: refreshTokenExpiry(),
      userAgent: userAgent?.slice(0, 255),
    },
  });

  return { accessToken, refreshToken };
}

/**
 * Register a new account and email a verification link.
 *
 * Registration does NOT log the user in — they must verify their email first.
 * That's what makes the verification step meaningful rather than decorative.
 */
export async function register(input: RegisterInput): Promise<PublicUser> {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (existing) {
    // 409 Conflict. We're intentionally explicit here: this is a signup form,
    // so "email already registered" is the genuinely useful message, and the
    // address is discoverable anyway by attempting to sign up.
    throw new HttpError(409, "An account with this email already exists");
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      name: input.name,
      role: input.role,
    },
  });

  const { token, tokenHash } = generateSecureToken();
  await prisma.emailVerificationToken.create({
    data: {
      tokenHash,
      userId: user.id,
      expiresAt: shortTokenExpiry(24),
    },
  });

  await sendVerificationEmail(user.email, user.name, token);

  return toPublicUser(user);
}

export async function login(
  input: LoginInput,
  userAgent?: string,
): Promise<SessionResult> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  /*
   * Both "no such user" and "wrong password" return the SAME error. If they
   * differed, an attacker could enumerate which emails have accounts.
   *
   * We also run a dummy hash comparison when the user doesn't exist, so the
   * response takes roughly the same time either way — otherwise a fast reply
   * would itself reveal that the account is missing (a timing side-channel).
   */
  if (!user || !user.passwordHash) {
    await verifyPassword(
      "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      input.password,
    );
    throw new HttpError(401, "Incorrect email or password");
  }

  const valid = await verifyPassword(user.passwordHash, input.password);
  if (!valid) {
    throw new HttpError(401, "Incorrect email or password");
  }

  if (user.status === "SUSPENDED") {
    throw new HttpError(
      403,
      "This account has been suspended. Contact support for help.",
    );
  }

  if (!user.emailVerifiedAt) {
    throw new HttpError(
      403,
      "Please verify your email address before signing in. Check your inbox for the link.",
    );
  }

  const { accessToken, refreshToken } = await createSession(user, userAgent);
  return { user: toPublicUser(user), accessToken, refreshToken };
}

/**
 * Exchange a refresh token for a new access token, with ROTATION: the old
 * refresh token is revoked and a new one issued on every use.
 *
 * Why rotate: if a refresh token is ever stolen and used, the legitimate user's
 * next refresh will present an already-revoked token — which we can detect as a
 * compromise signal rather than silently letting both parties stay logged in.
 */
export async function refreshSession(
  rawToken: string,
  userAgent?: string,
): Promise<SessionResult> {
  const tokenHash = hashToken(rawToken);

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!stored || stored.expiresAt < new Date()) {
    throw new HttpError(401, "Session expired. Please sign in again.");
  }

  if (stored.revokedAt) {
    const revokedMsAgo = Date.now() - stored.revokedAt.getTime();

    /*
     * The grace window applies ONLY to rotation. A token revoked by a logout,
     * a password reset, or an earlier theft detection is dead immediately —
     * otherwise "sign out everywhere" would leave a 15-second hole during
     * which the very sessions we just killed still work.
     */
    const isRotationRace =
      stored.revokeReason === "ROTATED" && revokedMsAgo <= ROTATION_GRACE_MS;

    if (!isRotationRace) {
      /*
       * A refresh token reused long after rotation means the token leaked:
       * the legitimate client already swapped it for a new one, so whoever is
       * presenting this is replaying a stolen copy.
       *
       * The standard response is to revoke the ENTIRE token family — we can't
       * tell the attacker from the victim, so we log both out and force a
       * fresh sign-in.
       */
      await prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: "THEFT_DETECTED" },
      });

      console.warn(
        `[security] Refresh token replay detected for user ${stored.userId}; all sessions revoked.`,
      );

      throw new HttpError(401, "Session expired. Please sign in again.");
    }

    /*
     * Inside the grace window this is almost certainly a benign race: two tabs
     * (or two concurrent 401s) refreshed at the same moment and both sent the
     * same cookie. Rejecting here would log out a perfectly valid user, so we
     * issue a fresh session instead. Auth0 and friends do the same thing.
     */
  }

  if (stored.user.status === "SUSPENDED") {
    throw new HttpError(403, "This account has been suspended.");
  }

  /*
   * Revoke the token being used, then issue a replacement.
   *
   * `revokedAt: null` in the WHERE clause matters: without it, replaying an
   * already-revoked token would keep pushing its revokedAt forward and slide
   * the grace window indefinitely, turning a 15-second allowance into an
   * unlimited one.
   */
  await prisma.refreshToken.updateMany({
    where: { id: stored.id, revokedAt: null },
    data: { revokedAt: new Date(), revokeReason: "ROTATED" },
  });

  const { accessToken, refreshToken } = await createSession(
    stored.user,
    userAgent,
  );

  return { user: toPublicUser(stored.user), accessToken, refreshToken };
}

/** Revoke a single session (this browser's login). */
export async function logout(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;

  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(rawToken), revokedAt: null },
    data: { revokedAt: new Date(), revokeReason: "LOGOUT" },
  });
}

export async function verifyEmail(rawToken: string): Promise<PublicUser> {
  const stored = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { user: true },
  });

  if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
    throw new HttpError(
      400,
      "This verification link is invalid or has expired. Request a new one.",
    );
  }

  /*
   * A transaction so the two writes succeed or fail together — we can never end
   * up with a token marked used but the account still unverified.
   */
  const [, user] = await prisma.$transaction([
    prisma.emailVerificationToken.update({
      where: { id: stored.id },
      data: { usedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: stored.userId },
      data: { emailVerifiedAt: new Date() },
    }),
  ]);

  return toPublicUser(user);
}

/**
 * Start a password reset.
 *
 * Always resolves successfully, even when the email is unknown — otherwise the
 * endpoint becomes an account-enumeration oracle. The caller returns a generic
 * "if an account exists, we've sent a link" message either way.
 */
export async function forgotPassword(
  input: ForgotPasswordInput,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) return;

  /*
   * Invalidate any earlier unused tokens before issuing a new one. Without
   * this, requesting a reset link twice (a very normal thing to do — "did
   * that email arrive?") leaves several valid 1-hour tokens live at once,
   * any of which can still be used even after the user resets via the latest
   * link.
   */
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const { token, tokenHash } = generateSecureToken();

  await prisma.passwordResetToken.create({
    data: { tokenHash, userId: user.id, expiresAt: shortTokenExpiry(1) },
  });

  await sendPasswordResetEmail(user.email, user.name, token);
}

export async function resetPassword(
  input: ResetPasswordInput,
): Promise<void> {
  const stored = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(input.token) },
  });

  if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
    throw new HttpError(
      400,
      "This reset link is invalid or has expired. Request a new one.",
    );
  }

  const passwordHash = await hashPassword(input.password);

  /*
   * Changing a password must also revoke every existing session. If the reset
   * was triggered because the account was compromised, leaving old sessions
   * alive would defeat the entire point.
   */
  await prisma.$transaction([
    prisma.passwordResetToken.update({
      where: { id: stored.id },
      data: { usedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: stored.userId },
      data: { passwordHash },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: "PASSWORD_RESET" },
    }),
  ]);
}

export async function getCurrentUser(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(404, "User not found");
  return toPublicUser(user);
}
