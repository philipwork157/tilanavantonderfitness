import assert from 'node:assert/strict';
import { adminLoginRequestSchema } from '@tilana/contracts/auth';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import {
  requireDatabaseId,
  requireRouteDatabaseId,
  readZodBody,
  validateRequestBody,
} from '../server/utils/route-validation.ts';

beforeEach(() => {
  vi.stubGlobal('createError', (input: { statusCode: number; statusMessage: string }) =>
    Object.assign(new Error(input.statusMessage), input));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('API route validation helpers', () => {
  it('accepts only positive safe integer database identifiers', () => {
    assert.equal(requireDatabaseId('42', 'client'), 42);
    assert.throws(() => requireDatabaseId('0', 'client'), {
      statusCode: 400,
      statusMessage: 'Invalid client identifier.',
    });
    assert.throws(() => requireDatabaseId('1.5', 'client'), {
      statusCode: 400,
      statusMessage: 'Invalid client identifier.',
    });
  });

  it('reads a database identifier from the requested route parameter', () => {
    const getRouterParamMock = vi.fn(() => '7');
    vi.stubGlobal('getRouterParam', getRouterParamMock);
    const event = {} as Parameters<typeof requireRouteDatabaseId>[0];

    assert.equal(requireRouteDatabaseId(event, 'program', 'programId'), 7);
    assert.deepEqual(getRouterParamMock.mock.calls, [[event, 'programId']]);
  });

  it('returns validated and normalized request data', () => {
    assert.deepEqual(validateRequestBody(
      { email: '  Customer@Example.com ', password: 'secret' },
      adminLoginRequestSchema,
      'Check the request.',
    ), { email: 'Customer@Example.com', password: 'secret' });
  });

  it('uses the first contract error at the HTTP boundary', () => {
    assert.throws(() => validateRequestBody(
      { email: 'not-an-email', password: 'secret' },
      adminLoginRequestSchema,
      'Check the request.',
    ), {
      statusCode: 400,
      statusMessage: 'Invalid email address',
    });
  });

  it('falls back when a validator does not provide an issue message', () => {
    const schema = {
      safeParse: () => ({ success: false as const, error: { issues: [] } }),
    };
    assert.throws(() => validateRequestBody({}, schema, 'Check the request.'), {
      statusCode: 400,
      statusMessage: 'Check the request.',
    });
  });

  it('can normalize an absent body to an empty object', async () => {
    vi.stubGlobal('readBody', vi.fn(async () => null));
    const schema = {
      safeParse: (value: unknown) => {
        assert.deepEqual(value, {});
        return { success: true as const, data: { accepted: true } };
      },
    };

    const event = {} as Parameters<typeof readZodBody>[0];
    assert.deepEqual(
      await readZodBody(event, schema, 'Check the request.', { defaultToEmptyObject: true }),
      { accepted: true },
    );
  });

  it('can hide contract details behind a stable public error message', async () => {
    vi.stubGlobal('readBody', vi.fn(async () => ({ email: 'invalid', password: '' })));
    const event = {} as Parameters<typeof readZodBody>[0];

    await assert.rejects(
      readZodBody(event, adminLoginRequestSchema, 'Invalid email or password.', {
        exposeIssueMessage: false,
      }),
      { statusCode: 400, statusMessage: 'Invalid email or password.' },
    );
  });
});
