import { processPaystackEvent } from '../../services/paystack';
import {
  createPaystackEventKey,
  isValidPaystackWebhookSignature,
} from '../../utils/paystack-webhook';

export default defineEventHandler(async (event) => {
  const secretKey = String(useRuntimeConfig(event).paystackSecretKey || '').trim();
  const signature = getHeader(event, 'x-paystack-signature') || '';
  const rawBody = await readRawBody(event, 'utf8');

  if (!rawBody || !isValidPaystackWebhookSignature(secretKey, rawBody, signature)) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid webhook signature.' });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid webhook body.' });
  }

  const providerEventKey = createPaystackEventKey(rawBody);
  await processPaystackEvent(payload, providerEventKey);
  return { ok: true };
});
