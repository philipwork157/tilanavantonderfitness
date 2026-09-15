import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { authorizeAdminMutation } from '../server/utils/admin-mutation-authorization.ts';

describe('admin mutation authorization', () => {
  it('checks the request origin before resolving the administrator', async () => {
    const calls: string[] = [];
    const session = { user: { id: 11 } };
    const result = await authorizeAdminMutation({}, {
      enforceSameOrigin: mock.fn(() => { calls.push('origin'); }),
      requireAdmin: mock.fn(async () => { calls.push('admin'); return session; }),
    });

    assert.deepEqual(calls, ['origin', 'admin']);
    assert.equal(result.user.id, 11);
  });

  it('stops before session lookup when the origin is rejected', async () => {
    const requireAdmin = mock.fn(async () => ({ user: { id: 11 } }));
    await assert.rejects(authorizeAdminMutation({}, {
      enforceSameOrigin: mock.fn(() => { throw new Error('origin rejected'); }),
      requireAdmin,
    }), /origin rejected/);
    assert.equal(requireAdmin.mock.callCount(), 0);
  });
});
