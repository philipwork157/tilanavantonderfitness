import assert from 'node:assert/strict';
import { describe, it, vi } from 'vitest';
import { authorizeCatalogueMutation } from '../server/utils/catalogue-authorization.ts';

describe('admin catalogue mutation authorization', () => {
  it('requires same-origin validation before checking the admin session', async () => {
    const calls: string[] = [];
    const session = {
      authenticated: true as const,
      user: {
        id: 7,
        email: 'admin@example.com',
        firstName: 'A',
        lastName: 'D',
        role: 'admin' as const,
      },
    };
    const result = await authorizeCatalogueMutation({}, {
      enforceSameOrigin: vi.fn(() => { calls.push('origin'); }),
      requireAdmin: vi.fn(async () => { calls.push('admin'); return session; }),
    });

    assert.deepEqual(calls, ['origin', 'admin']);
    assert.equal(result.user.id, 7);
  });

  it('does not attempt authentication after a rejected origin', async () => {
    const requireAdmin = vi.fn(async () => ({ id: 1 }));
    await assert.rejects(authorizeCatalogueMutation({}, {
      enforceSameOrigin: vi.fn(() => { throw new Error('origin rejected'); }),
      requireAdmin,
    }), /origin rejected/);
    assert.equal(requireAdmin.mock.calls.length, 0);
  });
});
