import { env } from "../config/env.js";

/**
 * Development mailer.
 *
 * Instead of wiring a real email provider now, we print the message — and
 * critically the clickable link — to the API console. That keeps the whole
 * verify-email / reset-password flow fully testable with zero external
 * accounts.
 *
 * In Phase 8 this file gains a Resend implementation and the call sites below
 * do not change at all — that is the point of routing every email through one
 * `sendMail` function.
 */
interface MailMessage {
  to: string;
  subject: string;
  body: string;
  /** Rendered prominently in the console so it's easy to click. */
  actionUrl?: string;
}

export async function sendMail(message: MailMessage): Promise<void> {
  const line = "─".repeat(72);
  console.log(`\n${line}`);
  console.log(`📧  EMAIL (dev — not actually sent)`);
  console.log(`    To:      ${message.to}`);
  console.log(`    Subject: ${message.subject}`);
  console.log(`\n    ${message.body}`);
  if (message.actionUrl) {
    console.log(`\n    🔗 ${message.actionUrl}`);
  }
  console.log(`${line}\n`);
}

export function sendVerificationEmail(to: string, name: string, token: string) {
  const actionUrl = `${env.WEB_APP_URL}/verify-email?token=${token}`;
  return sendMail({
    to,
    subject: "Verify your ImpactBridge email",
    body: `Hi ${name}, confirm your email address to activate your account. This link expires in 24 hours.`,
    actionUrl,
  });
}

export function sendPasswordResetEmail(to: string, name: string, token: string) {
  const actionUrl = `${env.WEB_APP_URL}/reset-password?token=${token}`;
  return sendMail({
    to,
    subject: "Reset your ImpactBridge password",
    body: `Hi ${name}, use the link below to choose a new password. This link expires in 1 hour. If you didn't request this, you can safely ignore this email.`,
    actionUrl,
  });
}
