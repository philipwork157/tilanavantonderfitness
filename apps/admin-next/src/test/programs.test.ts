import { describe, expect, it } from 'vitest';
import { MAX_PROGRAM_PDF_BYTES, programInputSchema } from '@tilana/contracts/admin-programs';
import { formatRand, parseRand } from '@/lib/programs';
import { programDeliveryEmail, type ProgramDeliveryContent } from '@/server/services/program-emails';
import { isOnWebsite, offWebsiteReason, programLabel } from '@/server/services/programs';
import { routeEmail } from '@/server/utils/email-routing';
import { inspectPdf, PdfRejectedError, programFileKey, programFileName, r2Endpoint } from '@/server/utils/program-files';

const pdf = (body = 'hello') => Buffer.from(`%PDF-1.7\n${body}\n%%EOF\n`, 'latin1');

const content: ProgramDeliveryContent = {
  firstName: 'Anna <b>',
  orderNumber: 'TV-7K4Q9P',
  programs: ['Beginner · Volume 1'],
  websiteUrl: 'https://tilanavantonder.co.za',
  refundPolicyUrl: 'https://tilanavantonder.co.za/refund-policy',
};
const attachment = { fileName: 'Tilana van Tonder - Beginner Volume 1.pdf', contentType: 'application/pdf', data: new Uint8Array(pdf()) };

describe('program PDFs', () => {
  it('accepts a PDF and returns its SHA-256', () => {
    expect(inspectPdf(pdf()).sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects files that are not complete PDFs', () => {
    expect(() => inspectPdf(Buffer.alloc(0))).toThrow(PdfRejectedError);
    expect(() => inspectPdf(Buffer.from('<html>not a pdf</html>'))).toThrow('not a PDF');
    expect(() => inspectPdf(Buffer.from('%PDF-1.7\ncut off half way'))).toThrow('incomplete');
  });

  it('rejects PDFs that are too big for an email', () => {
    const big = Buffer.concat([pdf(), Buffer.alloc(MAX_PROGRAM_PDF_BYTES)]);
    expect(() => inspectPdf(big)).toThrow('15 MB');
  });

  it('stores each version under its own R2 key', () => {
    expect(programFileKey(7, 2, 'abcdef0123456789')).toBe('programs/7/v2-abcdef012345.pdf');
    expect(r2Endpoint('acc123')).toBe('https://acc123.r2.cloudflarestorage.com');
  });

  it('gives downloads a friendly, safe file name', () => {
    expect(programFileName('Beginner · Volume 1')).toBe('Tilana van Tonder - Beginner Volume 1.pdf');
    expect(programFileName('Bad/"name":*')).toBe('Tilana van Tonder - Bad name.pdf');
  });
});

describe('program delivery email', () => {
  it('attaches the PDF and escapes the buyer name', () => {
    const email = programDeliveryEmail('anna@example.com', content, [attachment]);
    expect(email.to).toEqual(['anna@example.com']);
    expect(email.subject).toBe('Your program: Beginner · Volume 1');
    expect(email.attachments).toEqual([attachment]);
    expect(email.html).toContain('Anna &lt;b&gt;');
    expect(email.html).not.toContain('Anna <b>');
    expect(email.html).toContain('TV-7K4Q9P');
    expect(email.text).toContain('- Beginner · Volume 1');
  });

  it('uses the plural for several programs and marks test emails', () => {
    const email = programDeliveryEmail('anna@example.com', { ...content, orderNumber: null, programs: ['Beginner · Volume 1', 'Nourish · Volume 1'] }, [attachment, attachment], { test: true, replyTo: 'tilana@example.com' });
    expect(email.subject).toBe('[Test] Your programs from Tilana');
    expect(email.html).toContain('Your programs are here');
    expect(email.html).toContain('Test email');
    expect(email.replyTo).toEqual(['tilana@example.com']);
  });

  it('keeps the attachments when development redirects the email', () => {
    const email = programDeliveryEmail('anna@example.com', content, [attachment]);
    const routed = routeEmail(email, { devRedirectTo: 'dev@example.com', requireRedirect: true });
    expect(routed.to).toEqual(['dev@example.com']);
    expect(routed.attachments).toEqual([attachment]);
  });
});

describe('program rules', () => {
  it('names programs after their volume', () => {
    expect(programLabel('Beginner', { name: 'Volume 2' })).toBe('Beginner · Volume 2');
  });

  it('shows a program on the website when its volume is on and it has a PDF', () => {
    const on = { isActive: true, name: 'Volume 1' };
    const off = { isActive: false, name: 'Volume 2' };
    expect(isOnWebsite({ filePath: 'programs/1/v1.pdf' }, on)).toBe(true);
    expect(isOnWebsite({ filePath: null }, on)).toBe(false);
    expect(isOnWebsite({ filePath: 'programs/1/v1.pdf' }, off)).toBe(false);
    expect(offWebsiteReason({ filePath: null }, on)).toBe('Upload the PDF to show it on the website.');
    expect(offWebsiteReason({ filePath: 'programs/1/v1.pdf' }, off)).toBe('Volume 2 is switched off.');
    expect(offWebsiteReason({ filePath: 'programs/1/v1.pdf' }, on)).toBeNull();
  });

  it('requires a step for the strength series only', () => {
    const base = { name: 'Beginner', slug: 'beginner-volume-1', title: '', summary: '', description: '', audience: '', tags: [], tone: 'sand', illustration: 'barbell', marker: '', sortOrder: 0, priceCents: 39_900 } as const;
    expect(programInputSchema.safeParse({ ...base, series: 'strength', step: 2 }).success).toBe(true);
    expect(programInputSchema.safeParse({ ...base, series: 'strength', step: null }).success).toBe(false);
    expect(programInputSchema.safeParse({ ...base, series: 'focus', step: 1 }).success).toBe(false);
    expect(programInputSchema.safeParse({ ...base, series: 'focus', step: null, tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }).success).toBe(false);
    expect(programInputSchema.safeParse({ ...base, series: 'focus', step: null, priceCents: 50 }).success).toBe(false);
  });

  it('reads and shows prices in rand', () => {
    expect(parseRand('399')).toBe(39_900);
    expect(parseRand('R 399,50')).toBe(39_950);
    expect(parseRand('399.5')).toBe(39_950);
    expect(parseRand('abc')).toBeNull();
    expect(parseRand('12.345')).toBeNull();
    expect(formatRand(39_900)).toBe('R399');
    expect(formatRand(129_900)).toBe('R1 299');
    expect(formatRand(39_950)).toBe('R399.50');
  });
});
