import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export function isValidPaystackWebhookSignature(
  secretKey: string,
  rawBody: string,
  signature: string,
): boolean {
  if (!secretKey || !rawBody || !/^[a-f0-9]{128}$/i.test(signature)) return false;
  const expected = createHmac('sha512', secretKey).update(rawBody).digest('hex');
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
}

export function createPaystackEventKey(rawBody: string): string {
  return createHash('sha256').update(rawBody).digest('hex');
}
