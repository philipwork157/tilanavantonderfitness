import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  documentedApiEndpointCount,
  getAdminOpenApiDocument,
} from '@server/services/api-documentation.ts';

describe('admin API documentation', () => {
  it('publishes a complete OpenAPI document with unique operations', () => {
    const document = getAdminOpenApiDocument();
    const operations = Object.values(document.paths).flatMap(path => Object.values(path));
    const operationIds = operations.map(operation => operation.operationId);

    assert.equal(document.openapi, '3.1.0');
    assert.equal(operations.length, documentedApiEndpointCount);
    assert.equal(documentedApiEndpointCount, 69);
    assert.equal(new Set(operationIds).size, operationIds.length);
  });

  it('documents protected program management and public catalogue routes', () => {
    const document = getAdminOpenApiDocument();

    assert.ok(document.paths['/api/admin/programs']);
    assert.ok(document.paths['/api/admin/programs/{id}/volumes']);
    assert.ok(document.paths['/api/admin/program-volumes/{id}']);
    assert.ok(document.paths['/api/public/programs']);
    assert.ok(document.paths['/api/public/program-volumes/{slug}']);
    assert.ok(document.paths['/api/checkout/paystack/basket']);
    assert.ok(document.paths['/api/admin/invoices']);
    assert.ok(document.paths['/api/admin/invoices']?.post);
    assert.ok(document.paths['/api/admin/invoices/{id}/actions']);
    assert.ok(document.paths['/api/admin/invoices/orders/{id}/review']);
    assert.deepEqual(document.paths['/api/customer/invoices/{id}/editions/{editionId}']?.get?.security, [{ customerSession: [] }]);
    assert.deepEqual(document.paths['/api/customer/invoices/{id}/pdf']?.get?.security, [{ customerSession: [] }]);
    assert.ok(document.paths['/api/customer/invoices/{id}/pdf']?.get?.responses['200'].content['application/pdf']);
    assert.ok(document.components.schemas.CheckoutRequest.required.includes('idempotencyKey'));
    assert.ok(document.components.schemas.BasketCheckoutRequest.required.includes('idempotencyKey'));
    assert.deepEqual(document.paths['/api/admin/openapi']?.get?.security, [{ adminSession: [] }]);
  });
});
