import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendInvoicePdf } from '@server/utils/invoice-response';
import { invoiceDocumentFixture } from './helpers/invoice-document-fixture';
const mocks = vi.hoisted(() => ({ renderInvoicePdf: vi.fn(), getItemRaw: vi.fn() }));
vi.mock('@server/services/invoice-pdf', () => ({ renderInvoicePdf: mocks.renderInvoicePdf }));
beforeEach(() => {
  vi.stubGlobal('useStorage', vi.fn(() => ({ getItemRaw: mocks.getItemRaw })));
  vi.stubGlobal('setHeader', vi.fn());
  vi.stubGlobal('createError', (value: object) => Object.assign(new Error('Unavailable'), value));
  mocks.getItemRaw.mockResolvedValue(new Uint8Array([1, 2]));
  mocks.renderInvoicePdf.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
});
describe('authenticated invoice PDF response', () => {
  it('uses only bundled server font assets and emits private non-sniffable PDF bytes', async () => {
    expect(await sendInvoicePdf({} as never, invoiceDocumentFixture())).toEqual(Buffer.from('%PDF'));
    expect(useStorage).toHaveBeenCalledWith('assets:server');
    expect(setHeader).toHaveBeenCalledWith({}, 'cache-control', 'private, no-store');
    expect(setHeader).toHaveBeenCalledWith({}, 'x-content-type-options', 'nosniff');
    expect(setHeader).toHaveBeenCalledWith({}, 'content-type', 'application/pdf');
  });
  it('fails closed when the server font is unavailable', async () => {
    mocks.getItemRaw.mockResolvedValueOnce(null);
    await expect(sendInvoicePdf({} as never, invoiceDocumentFixture())).rejects.toMatchObject({ statusCode: 503 });
    expect(mocks.renderInvoicePdf).not.toHaveBeenCalled();
  });
  it('sanitizes financial document numbers before writing response headers', async () => {
    const document = invoiceDocumentFixture();
    document.invoice.invoiceNumber = 'INV-1\r\nInjected: true';
    await sendInvoicePdf({} as never, document);
    expect(setHeader).toHaveBeenCalledWith({}, 'content-disposition', 'attachment; filename="INV-1Injectedtrue.pdf"');
  });
});
