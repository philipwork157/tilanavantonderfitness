import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { processPaystackEvent } from '../../services/paystack';

export default defineEventHandler(async (event) => {
  const secretKey = String(useRuntimeConfig(event).paystackSecretKey || '').trim();
  const signature = getHeader(event, 'x-paystack-signature') || '';
  const rawBody = await readRawBody(event, 'utf8');

  if (!secretKey || !rawBody || !/^[a-f0-9]{128}$/i.test(signature)) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid webhook signature.' });
  }

  const expected = createHmac('sha512', secretKey).update(rawBody).digest('hex');
  if (!timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid webhook signature.' });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid webhook body.' });
  }

  const providerEventKey = createHash('sha256').update(rawBody).digest('hex');
  await processPaystackEvent(payload, providerEventKey);
  return { ok: true };
});
