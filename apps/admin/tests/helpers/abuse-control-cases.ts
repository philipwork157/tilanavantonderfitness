import { abuseLimits } from '@tilana/db/schema';
import type { Database } from '@tilana/db/server';
import { eq, like } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { abusePolicies, claimSharedAllowance } from '@server/services/abuse-controls';

export function registerAbuseControlCases(getDatabase: () => Database) {
  describe('shared abuse controls against PostgreSQL', () => {
    it('allows only one parallel verification claim across instances', async () => {
      vi.stubGlobal('useRuntimeConfig', () => ({ contactIpHashSecret: 'integration-secret' }));
      const claims = await Promise.all(Array.from({ length: 12 }, () =>
        claimSharedAllowance('TVT-parallel-reference', abusePolicies.verificationReference)));
      expect(claims.filter(Boolean)).toHaveLength(1);
    });

    it('stores only a pseudonymous identity and permits a retry after expiry', async () => {
      vi.stubGlobal('useRuntimeConfig', () => ({ contactIpHashSecret: 'integration-secret' }));
      const email = 'private-buyer@example.test';
      expect(await claimSharedAllowance(email, abusePolicies.loginRecipient)).toBe(true);
      expect(await claimSharedAllowance(email, abusePolicies.loginRecipient)).toBe(false);
      const [row] = await getDatabase().select().from(abuseLimits)
        .where(like(abuseLimits.bucketKey, 'login:recipient:%'));
      expect(JSON.stringify(row)).not.toContain(email);
      await getDatabase().update(abuseLimits).set({ resetAt: new Date(0) }).where(eq(abuseLimits.bucketKey, row!.bucketKey));
      expect(await claimSharedAllowance(email, abusePolicies.loginRecipient)).toBe(true);
    });
  });
}
