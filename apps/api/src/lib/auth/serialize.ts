import type { User } from "@prisma/client";
import type { PublicUser } from "@impactbridge/shared";

/**
 * Convert a database User row into the public shape sent to clients.
 *
 * Every response that includes a user MUST go through this function. It is the
 * one chokepoint that guarantees `passwordHash` never leaves the server — far
 * safer than remembering to omit it at each call site.
 */
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatarUrl: user.avatarUrl,
    emailVerified: user.emailVerifiedAt !== null,
    createdAt: user.createdAt.toISOString(),
  };
}
