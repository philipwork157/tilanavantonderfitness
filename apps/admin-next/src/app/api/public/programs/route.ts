import { publicReadRoute } from '@/server/cors';
import { getDatabase } from '@/server/db';
import { listWebsitePrograms, toPublicProgram } from '@/server/services/programs';

/**
 * The programs on the website: every program with a PDF in an active volume,
 * in website order. Cached for a minute (see next.config.ts headers).
 */
export const GET = publicReadRoute(async () => {
  const programs = await listWebsitePrograms(getDatabase());
  return Response.json({ programs: programs.map(toPublicProgram) });
});
