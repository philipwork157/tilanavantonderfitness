import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'vitest';
import {
  createPaystackEventKey,
  isValidPaystackWebhookSignature,
} from '@server/utils/paystack-webhook.ts';
import { digestEventPayload, sanitizePaystackEvent } from '@server/utils/paystack-event-evidence';

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

  it('keeps reconciliation evidence without provider authorization or customer data', () => {
    const payload = {
      event: 'charge.success',
      data: {
        id: 12, reference: 'TVT-123', status: 'success', amount: 39_900,
        currency: 'ZAR', domain: 'test', customer: { email: 'buyer@example.test' },
        authorization: { authorization_code: 'AUTH_reusable-secret' }, metadata: { phone: 'secret' },
      },
    };
    const safe = sanitizePaystackEvent(payload);
    assert.deepEqual(safe, { event: 'charge.success', data: {
      id: 12, reference: 'TVT-123', status: 'success', amount: 39_900, currency: 'ZAR', domain: 'test',
    } });
    assert.match(digestEventPayload(payload), /^[a-f0-9]{64}$/);
    assert.doesNotMatch(JSON.stringify(safe), /buyer|authorization|AUTH_|metadata|phone/);
  });
});
