import { PUBLIC_WEBSITE_PATHS, parseOrigins } from '../utils/website-origins';

/**
 * Only the public website endpoints accept cross-origin requests, and only
 * from the website origins in NUXT_WEBSITE_ORIGINS. Admin APIs stay same-origin.
 */
export default defineEventHandler((event) => {
  if (!PUBLIC_WEBSITE_PATHS.has(getRequestURL(event).pathname)) return;

  const origins = parseOrigins(useRuntimeConfig(event).websiteOrigins);
  const origin = getHeader(event, 'origin');
  if (!origin || !origins.includes(origin.replace(/\/+$/, ''))) {
    throw createError({ statusCode: 403, statusMessage: 'This website is not allowed to send to this address.' });
  }

  // Answers the browser's preflight (OPTIONS) request and sets CORS headers.
  if (handleCors(event, {
    origin: origins,
    methods: ['POST', 'OPTIONS'],
    allowHeaders: ['content-type'],
    maxAge: '600',
  })) {
    return;
  }
});
