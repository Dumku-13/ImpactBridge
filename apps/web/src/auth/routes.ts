import type { Role } from "@impactbridge/shared";

/**
 * Where each role lands after signing in.
 * Single source of truth — used by the login redirect AND by the route guard
 * when it bounces someone away from a page they aren't allowed to see.
 */
export const ROLE_HOME: Record<Role, string> = {
  DONOR: "/donor",
  NGO_ADMIN: "/ngo",
  FUNDER: "/funder",
  PLATFORM_ADMIN: "/admin",
};

export function homeForRole(role: Role): string {
  return ROLE_HOME[role];
}
