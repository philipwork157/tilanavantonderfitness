import { requireAdmin } from '@/server/auth/admin';
import { isSameOrigin } from '@/server/auth/admin-access';
import { getDatabase } from '@/server/db';
import { handle, HttpError, routeId, sameOriginOnly, type IdContext } from '@/server/http';
import { logger } from '@/server/logger';
import { makeProgramPreview } from '@/server/services/program-previews';
import { findProgram, toAdminProgram } from '@/server/services/programs';

/**
 * (Re)makes the website's sneak peek from the current PDF. The admin calls it
 * by itself for PDFs uploaded before peeks existed, and from "Make again".
 */
export const POST = handle(async (request: Request, context: IdContext) => {
  sameOriginOnly(request, isSameOrigin);
  await requireAdmin();
  const id = await routeId(context);
  const db = getDatabase();
  const program = await findProgram(db, id);
  if (!program) throw new HttpError(404, 'Program not found.');
  if (!program.filePath) throw new HttpError(409, 'Upload the PDF first.');
  try {
    await makeProgramPreview(db, program);
  }
  catch (error) {
    if (error instanceof HttpError) throw error;
    logger.error({ err: error, programId: id }, 'Program preview could not be made');
    throw new HttpError(502, 'The sneak peek could not be made from this PDF. Please try again.');
  }
  return Response.json({ program: toAdminProgram((await findProgram(db, id))!) });
});
