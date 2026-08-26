import { z } from "zod";

/**
 * Auth contracts shared by the API and the web app.
 *
 * The SAME schema validates the request on the server and drives the form
 * (via React Hook Form's zodResolver) in the browser. One definition means the
 * two can never disagree about what a valid password is.
 */

/** The four platform roles. Mirrors the Prisma `Role` enum exactly. */
export const roleSchema = z.enum([
  "NGO_ADMIN",
  "DONOR",
  "FUNDER",
  "PLATFORM_ADMIN",
]);
export type Role = z.infer<typeof roleSchema>;

/** Roles a visitor may pick at signup. PLATFORM_ADMIN is seeded, never self-assigned. */
export const signupRoleSchema = roleSchema.exclude(["PLATFORM_ADMIN"]);
export type SignupRole = z.infer<typeof signupRoleSchema>;

/** Human-friendly labels + descriptions, used by the signup role picker. */
export const ROLE_LABELS: Record<Role, string> = {
  NGO_ADMIN: "Nonprofit",
  DONOR: "Donor",
  FUNDER: "Funding organisation",
  PLATFORM_ADMIN: "Platform admin",
};

export const ROLE_DESCRIPTIONS: Record<SignupRole, string> = {
  NGO_ADMIN: "Raise funds, apply for grants, and share your impact.",
  DONOR: "Discover causes you believe in and support them.",
  FUNDER: "Run grant programmes and fund vetted nonprofits.",
};

export const emailSchema = z
  .string()
  .min(1, "Email is required")
  .email("Enter a valid email address")
  .toLowerCase()
  .trim();

/**
 * Password policy. Deliberately strict enough to be credible, but not so fussy
 * that it becomes hostile — length is what actually matters for entropy.
 */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters")
  .regex(/[a-z]/, "Include at least one lowercase letter")
  .regex(/[A-Z]/, "Include at least one uppercase letter")
  .regex(/[0-9]/, "Include at least one number");

export const registerSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(80, "Name must be at most 80 characters")
    .trim(),
  email: emailSchema,
  password: passwordSchema,
  role: signupRoleSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().min(1, "Verification token is required"),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

/**
 * The public shape of a user. Note what is absent: passwordHash never appears
 * here, so it cannot accidentally be serialised to a client.
 */
export const publicUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: roleSchema,
  avatarUrl: z.string().nullable(),
  emailVerified: z.boolean(),
  createdAt: z.string(),
});
export type PublicUser = z.infer<typeof publicUserSchema>;

/** Returned by login and refresh. The refresh token itself rides in an httpOnly cookie. */
export const authResponseSchema = z.object({
  user: publicUserSchema,
  accessToken: z.string(),
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

export const messageResponseSchema = z.object({ message: z.string() });
export type MessageResponse = z.infer<typeof messageResponseSchema>;
