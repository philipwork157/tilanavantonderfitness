import assert from 'node:assert/strict';
import { adminSessionResponseSchema } from '@tilana/contracts/auth';
import { USER_ROLES, userRoleSchema, userRoleValues } from '@tilana/contracts/identity';
import { describe, it } from 'vitest';

describe('shared user roles', () => {
  it('keeps the named roles, validation values, and inferred contract aligned', () => {
    assert.deepEqual(userRoleValues, [
      USER_ROLES.ADMIN,
      USER_ROLES.CUSTOMER,
      USER_ROLES.STAFF,
    ]);

    for (const role of userRoleValues) {
      assert.equal(userRoleSchema.parse(role), role);
    }
  });

  it('uses the shared admin role in the session contract', () => {
    const result = adminSessionResponseSchema.parse({
      authenticated: true,
      user: {
        id: 1,
        email: 'admin@example.com',
        firstName: 'Admin',
        lastName: 'User',
        role: USER_ROLES.ADMIN,
      },
    });

    assert.equal(result.user.role, USER_ROLES.ADMIN);
    assert.equal(adminSessionResponseSchema.safeParse({
      ...result,
      user: { ...result.user, role: USER_ROLES.CUSTOMER },
    }).success, false);
  });
});
