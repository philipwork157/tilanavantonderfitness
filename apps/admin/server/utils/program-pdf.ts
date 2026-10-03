import { PDFDocument } from 'pdf-lib';

export class InvalidProgramPdfError extends Error {
  constructor() { super('Upload a readable, non-password-protected PDF with at least one page.'); }
}

/** Check actual PDF structure, not a browser-supplied filename or MIME label. */
export async function validateProgramPdf(content: Uint8Array): Promise<void> {
  const bytes = Buffer.from(content);
  if (bytes.subarray(0, 5).toString() !== '%PDF-' || !bytes.subarray(-1024).includes(Buffer.from('%%EOF'))) {
    throw new InvalidProgramPdfError();
  }
  try {
    const document = await PDFDocument.load(content, { throwOnInvalidObject: true, updateMetadata: false });
    if (document.isEncrypted || document.getPageCount() < 1) throw new Error('Unreadable PDF');
  } catch { throw new InvalidProgramPdfError(); }
}
