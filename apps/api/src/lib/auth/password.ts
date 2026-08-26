import argon2 from "argon2";

/**
 * Password hashing with Argon2id.
 *
 * Why argon2id over bcrypt: it's the current OWASP recommendation and the
 * winner of the Password Hashing Competition. It's deliberately *memory*-hard,
 * which makes GPU/ASIC cracking far more expensive than bcrypt's CPU-bound work.
 *
 * These parameters follow the OWASP cheat-sheet minimum (19 MiB, 2 iterations).
 * The salt is generated and embedded in the output hash automatically — we
 * never manage salts ourselves.
 */
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
  // `raw: false` selects the overload returning the encoded string form
  // ("$argon2id$v=19$m=...$salt$hash"), which carries its own parameters — so
  // hashes stay verifiable even if we tune the settings later.
  raw: false as const,
} satisfies argon2.HashOptions & { raw: false };

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

/**
 * Verify a password against a stored hash.
 * Returns false (rather than throwing) on malformed hashes so a corrupt row
 * can never crash a login request.
 */
export async function verifyPassword(
  hash: string,
  plain: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}
