import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'vitest';
import {
  createPaystackEventKey,
  isValidPaystackWebhookSignature,
} from '../server/utils/paystack-webhook.ts';

describe('Paystack webhook request boundary', () => {
  const secret = 'sk_test_webhook_unit_test';
  const body = JSON.stringify({
    event: 'charge.success',
    data: { reference: 'TVT-123', amount: 39_900, currency: 'ZAR', domain: 'test' },
  });

  it('accepts the exact SHA-512 HMAC and rejects altered requests', () => {
    const signature = createHmac('sha512', secret).update(body).digest('hex');
    assert.equal(isValidPaystackWebhookSignature(secret, body, signature), true);
    assert.equal(isValidPaystackWebhookSignature(secret, `${body} `, signature), false);
    assert.equal(isValidPaystackWebhookSignature('different-secret', body, signature), false);
  });

  it('rejects missing or malformed signatures without comparing buffers', () => {
    assert.equal(isValidPaystackWebhookSignature(secret, body, ''), false);
    assert.equal(isValidPaystackWebhookSignature(secret, body, 'not-hex'), false);
    assert.equal(isValidPaystackWebhookSignature('', body, 'a'.repeat(128)), false);
    assert.equal(isValidPaystackWebhookSignature(secret, '', 'a'.repeat(128)), false);
  });

  it('creates a stable event key that changes with the signed body', () => {
    const key = createPaystackEventKey(body);
    assert.match(key, /^[a-f0-9]{64}$/);
    assert.equal(createPaystackEventKey(body), key);
    assert.notEqual(createPaystackEventKey(`${body} `), key);
  });
});
