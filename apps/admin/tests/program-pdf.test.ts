import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { validateProgramPdf } from '@server/utils/program-pdf';

describe('actual uploaded PDF validation', () => {
  it('accepts a readable PDF with pages', async () => {
    const pdf = await PDFDocument.create(); pdf.addPage();
    await expect(validateProgramPdf(await pdf.save())).resolves.toBeUndefined();
  });
  it.each(['not a PDF', '%PDF-1.7\npretend PDF\n%%EOF', '%PDF-1.7\ntruncated'])('rejects mislabeled/corrupt content: %s', async value => {
    await expect(validateProgramPdf(Buffer.from(value))).rejects.toThrow('readable');
  });
  it('rejects a structurally valid document with no pages', async () => {
    const pdf = await PDFDocument.create();
    await expect(validateProgramPdf(await pdf.save({ addDefaultPage: false }))).rejects.toThrow('at least one page');
  });
});
