import { MAX_PROGRAM_PDF_BYTES } from '@tilana/contracts/admin-programs';
import { programs } from '@tilana/db';
import { and, eq } from 'drizzle-orm';
import { requireAdmin, requireRole } from '@/server/auth/admin';
import { isSameOrigin } from '@/server/auth/admin-access';
import { getDatabase } from '@/server/db';
import { handle, HttpError, routeId, sameOriginOnly, type IdContext } from '@/server/http';
import { logger } from '@/server/logger';
import { makeProgramPreview } from '@/server/services/program-previews';
import { findProgram, programLabel, toAdminProgram } from '@/server/services/programs';
import { downloadProgramFile, inspectPdf, PdfRejectedError, programFileName, uploadProgramFile } from '@/server/utils/program-files';

/** Upload or replace the program's PDF (multipart field "file"). Admins only: it is what buyers receive. */
export const POST = handle(async (request: Request, context: IdContext) => {
  sameOriginOnly(request, isSameOrigin);
  const admin = await requireRole(['admin']);
  const id = await routeId(context);
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_PROGRAM_PDF_BYTES + 64 * 1024) throw new HttpError(413, 'PDFs must be 15 MB or smaller.');

  const db = getDatabase();
  const program = await findProgram(db, id);
  if (!program) throw new HttpError(404, 'Program not found.');

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File) || file.size === 0) throw new HttpError(400, 'Choose a PDF to upload.');
  const data = Buffer.from(await file.arrayBuffer());
  let sha256: string;
  try {
    ({ sha256 } = inspectPdf(data));
  } catch (error) {
    if (error instanceof PdfRejectedError) throw new HttpError(400, error.message);
    throw error;
  }

  const version = program.fileVersion + 1;
  const path = await uploadProgramFile(id, version, sha256, data);
  const updated = await db.update(programs).set({
    filePath: path,
    fileName: programFileName(programLabel(program.name, program.volume)),
    fileSizeBytes: data.length,
    fileSha256: sha256,
    fileVersion: version,
    fileUploadedAt: new Date(),
    fileUploadedBy: admin.id,
  }).where(and(eq(programs.id, id), eq(programs.fileVersion, program.fileVersion))).returning({ id: programs.id });
  if (!updated.length) throw new HttpError(409, 'The PDF was changed at the same time. Please reload and try again.');

  // The website's sneak peek is made from the new PDF. The PDF is saved either
  // way; if the pictures fail, the admin offers to make them again.
  const stored = (await findProgram(db, id))!;
  try {
    await makeProgramPreview(db, stored, data);
  }
  catch (error) {
    logger.error({ err: error, programId: id }, 'Program preview could not be made');
  }
  return Response.json({ program: toAdminProgram((await findProgram(db, id))!) });
});

/** Download the current PDF (admins only; customers receive it by email). */
export const GET = handle(async (_request: Request, context: IdContext) => {
  await requireAdmin();
  const program = await findProgram(getDatabase(), await routeId(context));
  if (!program?.filePath || !program.fileName) throw new HttpError(404, 'This program has no PDF yet.');
  const data = await downloadProgramFile(program.filePath);
  return new Response(new Uint8Array(data), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${program.fileName.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
