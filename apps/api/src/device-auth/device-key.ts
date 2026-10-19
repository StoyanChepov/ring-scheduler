import { createHash, randomBytes } from 'crypto';

// The prefix tells device keys apart from user JWTs at a glance (and in logs).
const PREFIX = 'dk_';

/** A new random device key. Only its hash is stored. */
export function generateDeviceKey(): string {
  return PREFIX + randomBytes(32).toString('base64url');
}

/**
 * Keys are 256 random bits, so a plain SHA-256 is enough: unlike passwords
 * they can't be guessed, and a fast hash keeps the per-request lookup cheap.
 */
export function hashDeviceKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function looksLikeDeviceKey(value: string): boolean {
  return value.startsWith(PREFIX);
}
