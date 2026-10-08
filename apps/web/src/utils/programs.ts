import { publicProgramsResponseSchema, type PublicProgram } from '@tilana/contracts/public-programs';
import { toSitePrograms, type Program } from '@web/site/programs';
import { createLiveLoader } from './live-api';

/**
 * Published programs from the admin API, read live when a page is opened
 * (five-minute shared cache, last good copy while the API is down).
 */
export const getPublishedPrograms: () => Promise<PublicProgram[]> = createLiveLoader({
  path: '/api/public/programs',
  label: 'Programs',
  parse: (body) => publicProgramsResponseSchema.parse(body).programs,
});

/**
 * Programs ready for the pages. Never throws: if the admin API cannot be
 * reached and there is no saved copy, the page renders without programs and
 * shows a short "please try again" note instead (`ok: false`).
 */
export async function loadSitePrograms(): Promise<{ programs: Program[]; ok: boolean }> {
  try {
    return { programs: toSitePrograms(await getPublishedPrograms()), ok: true };
  } catch {
    // live-api.ts has already logged the failure with its request ID.
    return { programs: [], ok: false };
  }
}

/** Browsers may reuse a program page for a minute; the programs are cached on Cloudflare. */
export function setProgramCacheHeaders(headers: Headers): void {
  headers.set('cache-control', 'public, max-age=60');
}
