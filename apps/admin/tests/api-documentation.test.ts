import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  documentedApiEndpointCount,
  getAdminOpenApiDocument,
} from '../server/services/api-documentation.ts';

describe('admin API documentation', () => {
  it('publishes a complete OpenAPI document with unique operations', () => {
    const document = getAdminOpenApiDocument();
    const operations = Object.values(document.paths).flatMap(path => Object.values(path));
    const operationIds = operations.map(operation => operation.operationId);

    assert.equal(document.openapi, '3.1.0');
    assert.equal(operations.length, documentedApiEndpointCount);
    assert.equal(documentedApiEndpointCount, 52);
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
    assert.deepEqual(document.paths['/api/admin/openapi']?.get?.security, [{ adminSession: [] }]);
  });
});
