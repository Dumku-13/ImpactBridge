import { PrismaClient } from "@prisma/client";
import { isProduction } from "../config/env.js";

/**
 * A single shared PrismaClient for the whole app.
 *
 * Why the globalThis dance: `tsx watch` reloads modules on every file save. A
 * plain `new PrismaClient()` would create a brand-new connection pool each
 * reload and eventually exhaust Postgres connections. Caching it on globalThis
 * in development keeps exactly one client alive across reloads.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProduction ? ["error"] : ["warn", "error"],
  });

if (!isProduction) globalForPrisma.prisma = prisma;
