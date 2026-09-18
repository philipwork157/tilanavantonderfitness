import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), requireAdminMutation: vi.fn(), requireCustomer: vi.fn(),
  listInvoices: vi.fn(), getInvoiceDocument: vi.fn(), retryInvoiceDelivery: vi.fn(), sendInvoicePdf: vi.fn(),
  getDatabase: vi.fn(), assertPaystackDatabaseEnvironment: vi.fn() }));
const administration = vi.hoisted(() => ({ createManualInvoice: vi.fn(), applyInvoiceAction: vi.fn(), approveInvoicePurchaseReview: vi.fn(), inspectInvoice: vi.fn(), inspectInvoicePurchase: vi.fn() }));
vi.mock('@server/services/invoice-administration', () => administration);
vi.mock('@server/services/invoice-actions', () => administration);
vi.mock('@server/services/invoice-review', () => administration);
vi.mock('@server/services/invoice-inspection', () => administration);
vi.mock('@server/utils/admin-auth', () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock('@server/utils/admin-mutation', () => ({ requireAdminMutation: mocks.requireAdminMutation }));
vi.mock('@server/utils/customer-auth', () => ({ requireCustomer: mocks.requireCustomer }));
vi.mock('@server/services/invoice-records', () => mocks);
vi.mock('@server/utils/invoice-response', () => ({ sendInvoicePdf: mocks.sendInvoicePdf }));
vi.mock('@server/utils/database', () => ({ getDatabase: mocks.getDatabase }));
vi.mock('@server/utils/paystack-configuration', () => ({ assertPaystackDatabaseEnvironment: mocks.assertPaystackDatabaseEnvironment }));
let query: unknown;
let body: unknown;
let id: string;
const routes: Record<string, (event: never) => Promise<unknown>> = {};
beforeAll(async () => {
  vi.stubGlobal('defineEventHandler', (handler: unknown) => handler);
  routes.adminList = (await import('@server/api/admin/invoices/index.get')).default;
  routes.customerList = (await import('@server/api/customer/invoices/index.get')).default;
  routes.adminPdf = (await import('@server/api/admin/invoices/[id]/pdf.get')).default;
  routes.customerPdf = (await import('@server/api/customer/invoices/[id]/pdf.get')).default;
  routes.adminCredit = (await import('@server/api/admin/invoices/[id]/credits/[creditId].get')).default;
  routes.customerCredit = (await import('@server/api/customer/invoices/[id]/credits/[creditId].get')).default;
  routes.retry = (await import('@server/api/admin/invoices/[id]/delivery.post')).default;
  routes.operations = (await import('@server/api/admin/invoices/operations.get')).default;
  routes.create = (await import('@server/api/admin/invoices/index.post')).default;
  routes.action = (await import('@server/api/admin/invoices/[id]/actions.post')).default;
  routes.review = (await import('@server/api/admin/invoices/orders/[id]/review.post')).default;
  routes.inspect = (await import('@server/api/admin/invoices/[id]/index.get')).default;
  routes.inspectReview = (await import('@server/api/admin/invoices/orders/[id]/review.get')).default;
  routes.adminEdition = (await import('@server/api/admin/invoices/[id]/editions/[editionId].get')).default;
  routes.customerEdition = (await import('@server/api/customer/invoices/[id]/editions/[editionId].get')).default;
});
beforeEach(() => {
  query = {}; body = { action: 'retry-delivery' }; id = '12';
  vi.stubGlobal('getQuery', () => query);
  vi.stubGlobal('getRouterParam', (_event: unknown, name: string) => name === 'creditId' || name === 'editionId' ? '8' : id);
  vi.stubGlobal('readBody', async () => body);
  vi.stubGlobal('setResponseStatus', vi.fn());
  vi.stubGlobal('createError', (input: object) => Object.assign(new Error('Invalid request'), input));
  mocks.requireAdmin.mockResolvedValue({ user: { id: 1 } });
  mocks.requireAdminMutation.mockResolvedValue({ user: { id: 1 } });
  mocks.requireCustomer.mockResolvedValue({ clientId: 7 });
  mocks.getInvoiceDocument.mockResolvedValue({ invoice: { id: 12 } });
  mocks.listInvoices.mockResolvedValue({ invoices: [], hasMore: false });
  mocks.sendInvoicePdf.mockResolvedValue('private-pdf');
  mocks.retryInvoiceDelivery.mockResolvedValue({ queued: 1 });
  mocks.getDatabase.mockReturnValue({ select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [] }) }) }) }) });
});
describe('invoice route boundaries', () => {
  it.each(['adminList', 'adminPdf', 'adminCredit', 'operations', 'inspect', 'inspectReview', 'adminEdition'])('requires an administrator before %s', async name => {
    mocks.requireAdmin.mockRejectedValueOnce(Object.assign(new Error('Denied'), { statusCode: 401 }));
    await expect(routes[name]!({} as never)).rejects.toMatchObject({ statusCode: 401 });
    expect(mocks.getInvoiceDocument).not.toHaveBeenCalled();
    expect(mocks.listInvoices).not.toHaveBeenCalled();
    expect(mocks.getDatabase).not.toHaveBeenCalled();
  });
  it.each(['customerList', 'customerPdf', 'customerCredit', 'customerEdition'])('requires a customer before %s', async name => {
    mocks.requireCustomer.mockRejectedValueOnce(Object.assign(new Error('Denied'), { statusCode: 401 }));
    await expect(routes[name]!({} as never)).rejects.toMatchObject({ statusCode: 401 });
    expect(mocks.getInvoiceDocument).not.toHaveBeenCalled();
    expect(mocks.listInvoices).not.toHaveBeenCalled();
  });
  it('passes verified client scope, not browser-supplied email or ID', async () => {
    query = { before: '4' };
    await routes.customerList!({} as never);
    expect(mocks.listInvoices).toHaveBeenCalledWith(7, 4);
    query = { clientId: '999' };
    await expect(routes.customerList!({} as never)).rejects.toMatchObject({ statusCode: 400 });
  });
  it('returns only a bounded protected billing operations queue', async () => {
    expect(await routes.operations!({} as never)).toEqual({ review: [], deliveries: [] });
    expect(mocks.assertPaystackDatabaseEnvironment).toHaveBeenCalledOnce();
  });
  it.each(['adminPdf', 'customerPdf', 'adminCredit', 'customerCredit'])('rejects invalid internal IDs for %s', async name => {
    id = 'not-an-id';
    await expect(routes[name]!({} as never)).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.getInvoiceDocument).not.toHaveBeenCalled();
  });
  it('passes both ownership and credit association to the service', async () => {
    expect(await routes.customerCredit!({} as never)).toBe('private-pdf');
    expect(mocks.getInvoiceDocument).toHaveBeenCalledWith(12, 7, 8);
    await routes.customerPdf!({} as never);
    expect(mocks.getInvoiceDocument).toHaveBeenCalledWith(12, 7);
  });
  it('serves administrator PDFs and validates credit IDs', async () => {
    await routes.adminPdf!({} as never);
    expect(mocks.getInvoiceDocument).toHaveBeenCalledWith(12);
    await routes.adminCredit!({} as never);
    expect(mocks.getInvoiceDocument).toHaveBeenCalledWith(12, undefined, 8);
    await routes.adminList!({} as never);
    expect(mocks.listInvoices).toHaveBeenCalledWith(undefined, undefined);
  });
  it('preserves service 404 ownership denials without rendering a PDF', async () => {
    mocks.getInvoiceDocument.mockRejectedValueOnce(Object.assign(new Error('Not found'), { statusCode: 404 }));
    await expect(routes.customerPdf!({} as never)).rejects.toMatchObject({ statusCode: 404 });
    expect(mocks.sendInvoicePdf).not.toHaveBeenCalled();
  });
  it.each([401, 403])('denies unauthenticated or cross-origin delivery changes with %s', async statusCode => {
    mocks.requireAdminMutation.mockRejectedValueOnce(Object.assign(new Error('Denied'), { statusCode }));
    await expect(routes.retry!({} as never)).rejects.toMatchObject({ statusCode });
    expect(mocks.retryInvoiceDelivery).not.toHaveBeenCalled();
  });
  it('rejects recipient overrides and queues valid retries with 202', async () => {
    body = { action: 'retry-delivery', email: 'attacker@example.test' };
    await expect(routes.retry!({} as never)).rejects.toMatchObject({ statusCode: 400 });
    body = { action: 'retry-delivery' };
    expect(await routes.retry!({} as never)).toEqual({ queued: 1 });
    expect(setResponseStatus).toHaveBeenCalledWith({}, 202);
  });
  it.each(['create', 'action', 'review'])('checks admin/origin before %s writes', async name => {
    mocks.requireAdminMutation.mockRejectedValueOnce(Object.assign(new Error('Denied'), { statusCode: 403 }));
    await expect(routes[name]!({} as never)).rejects.toMatchObject({ statusCode: 403 });
    expect(administration.createManualInvoice).not.toHaveBeenCalled();
    expect(administration.applyInvoiceAction).not.toHaveBeenCalled();
    expect(administration.approveInvoicePurchaseReview).not.toHaveBeenCalled();
  });
  it('validates draft payloads and binds administrator identity', async () => {
    body = { idempotencyKey: '123e4567-e89b-42d3-a456-426614174000', reason: 'Agreed service fee', clientId: 7, items: [{ description: 'Coaching', quantity: 1, unitPriceCents: 5000 }] };
    await routes.create!({} as never);
    expect(administration.createManualInvoice).toHaveBeenCalledWith(body, 1);
    body = { ...(body as object), status: 'paid' };
    await expect(routes.create!({} as never)).rejects.toMatchObject({ statusCode: 400 });
  });
  it('validates action/review contracts and target IDs before executing', async () => {
    body = { idempotencyKey: '123e4567-e89b-42d3-a456-426614174000', reason: 'Original evidence verified', action: 'issue' };
    await routes.action!({} as never);
    expect(administration.applyInvoiceAction).toHaveBeenCalledWith(12, body, 1);
    body = { idempotencyKey: '123e4567-e89b-42d3-a456-426614174000', reason: 'Original evidence verified', paymentId: 9, clientName: 'Buyer', clientEmail: 'buyer@example.test', clientPhone: '', evidence: 'Original checkout evidence reference' };
    await routes.review!({} as never);
    expect(administration.approveInvoicePurchaseReview).toHaveBeenCalledWith(12, body, 1);
    id = 'bad-id';
    await expect(routes.review!({} as never)).rejects.toMatchObject({ statusCode: 400 });
  });
  it('scopes edition downloads to both verified customer and invoice association', async () => {
    await routes.customerEdition!({} as never);
    expect(mocks.getInvoiceDocument).toHaveBeenCalledWith(12, 7, undefined, 8);
    await routes.adminEdition!({} as never);
    expect(mocks.getInvoiceDocument).toHaveBeenCalledWith(12, undefined, undefined, 8);
    await routes.inspect!({} as never);
    expect(administration.inspectInvoice).toHaveBeenCalledWith(12);
    await routes.inspectReview!({} as never);
    expect(administration.inspectInvoicePurchase).toHaveBeenCalledWith(12);
  });
});
