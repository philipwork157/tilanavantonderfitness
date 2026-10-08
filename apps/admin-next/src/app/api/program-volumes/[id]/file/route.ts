import { MAX_PROGRAM_PDF_BYTES } from '@tilana/contracts/admin-programs';
import { programVolumes } from '@tilana/db';
import { and, eq } from 'drizzle-orm';
import { requireAdmin } from '@/server/auth/admin';
import { isSameOrigin } from '@/server/auth/admin-access';
import { getDatabase } from '@/server/db';
import { handle, HttpError, routeId, sameOriginOnly, type IdContext } from '@/server/http';
import { findProgram, findVolume, toAdminProgram } from '@/server/services/programs';
import { downloadProgramFile, inspectPdf, PdfRejectedError, programFileName, uploadProgramFile } from '@/server/utils/program-files';

/** Upload or replace the volume's PDF (multipart field "file"). */
export const POST = handle(async (request: Request, context: IdContext) => {
  sameOriginOnly(request, isSameOrigin);
  const admin = await requireAdmin();
  const id = await routeId(context);
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_PROGRAM_PDF_BYTES + 64 * 1024) throw new HttpError(413, 'PDFs must be 15 MB or smaller.');

  const db = getDatabase();
  const volume = await findVolume(db, id);
  if (!volume) throw new HttpError(404, 'Volume not found.');

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

  const version = volume.fileVersion + 1;
  const path = await uploadProgramFile(id, version, sha256, data);
  const updated = await db.update(programVolumes).set({
    filePath: path,
    fileName: programFileName(volume.name),
    fileSizeBytes: data.length,
    fileSha256: sha256,
    fileVersion: version,
    fileUploadedAt: new Date(),
    fileUploadedBy: admin.id,
  }).where(and(eq(programVolumes.id, id), eq(programVolumes.fileVersion, volume.fileVersion))).returning({ id: programVolumes.id });
  if (!updated.length) throw new HttpError(409, 'The PDF was changed at the same time. Please reload and try again.');
  return Response.json({ program: toAdminProgram((await findProgram(db, volume.programId))!) });
});

/** Download the current PDF (admins only; customers receive it by email). */
export const GET = handle(async (_request: Request, context: IdContext) => {
  await requireAdmin();
  const volume = await findVolume(getDatabase(), await routeId(context));
  if (!volume?.filePath || !volume.fileName) throw new HttpError(404, 'This volume has no PDF yet.');
  const data = await downloadProgramFile(volume.filePath);
  return new Response(new Uint8Array(data), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${volume.fileName.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
