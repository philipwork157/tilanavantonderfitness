import { defineMiddleware } from 'astro:middleware';
import { SECURITY_HEADERS } from '@web/utils/security-headers';

/** Adds the security headers to pages rendered on request (prebuilt pages use public/_headers). */
export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!response.headers.has(name)) response.headers.set(name, value);
  }
  return response;
});
