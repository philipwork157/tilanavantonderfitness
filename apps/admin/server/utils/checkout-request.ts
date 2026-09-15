import type { H3Event } from 'h3';
import {
  applyContactCors,
  enforceContactRateLimit,
  getContactRequestIp,
  verifyContactTurnstile,
} from './contact-security';
import { readZodBody, type RequestSchema } from './route-validation';

interface PublicCheckoutFields {
  website: string;
  turnstileToken: string;
}

export async function prepareCheckoutRequest<T extends PublicCheckoutFields>(
  event: H3Event,
  schema: RequestSchema<T>,
  invalidMessage: string,
): Promise<T> {
  applyContactCors(event);
  const body = await readZodBody(event, schema, invalidMessage);
  if (body.website) {
    throw createError({ statusCode: 400, statusMessage: 'Checkout could not be started.' });
  }

  const ip = getContactRequestIp(event);
  await enforceContactRateLimit(ip, 'checkout');
  await verifyContactTurnstile(body.turnstileToken, ip, 'checkout');
  return body;
}
