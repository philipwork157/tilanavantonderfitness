import { createHash, randomBytes } from 'node:crypto';

/** 256-bit random token, safe to put in a link. */
export function createNewsletterToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Confirmation tokens are stored only as this hash. */
export function hashNewsletterToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
