const PUBLIC_CATALOGUE_CACHE_CONTROL = 'public, max-age=60, s-maxage=300, stale-while-revalidate=600';

function allowedOrigins(): Set<string> {
  const config = useRuntimeConfig();
  return new Set(
    String(config.contactAllowedOrigins || '')
      .split(',')
      .map(value => value.trim().replace(/\/$/, ''))
      .filter(Boolean),
  );
}

export function applyPublicCatalogueHeaders(event: Parameters<typeof getHeader>[0]) {
  const origin = getHeader(event, 'origin')?.replace(/\/$/, '');
  if (origin && !allowedOrigins().has(origin)) {
    throw createError({ statusCode: 403, statusMessage: 'Origin not allowed.' });
  }

  setResponseHeaders(event, {
    ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': PUBLIC_CATALOGUE_CACHE_CONTROL,
    Vary: 'Origin',
  });
}
