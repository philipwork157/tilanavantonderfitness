/** Positive integer id from the route, or a 400. */
export function routeId(event: Parameters<typeof getRouterParam>[0], name = 'id'): number {
  const id = Number(getRouterParam(event, name));
  if (!Number.isSafeInteger(id) || id < 1) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown item.' });
  }
  return id;
}
