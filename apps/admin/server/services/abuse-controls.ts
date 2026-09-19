import { createHmac } from 'node:crypto';
import { abuseLimits } from '@tilana/db/schema';
import { lt, sql } from 'drizzle-orm';
import { getDatabase } from '@server/utils/database';

interface LimitPolicy {
  namespace: string;
  maxAttempts: number;
  windowMs: number;
}

const EXPIRED_RETENTION_MS = 24 * 60 * 60 * 1000;

function getHashSecret() {
  const secret = String(useRuntimeConfig().contactIpHashSecret || 'local-development-only');
  if (process.env.NODE_ENV === 'production' && secret === 'local-development-only') {
    throw createError({ statusCode: 503, statusMessage: 'Abuse protection is not configured.' });
  }
  return secret;
}

function bucketKey(namespace: string, identity: string) {
  const digest = createHmac('sha256', getHashSecret()).update(identity.trim().toLowerCase()).digest('hex');
  return `${namespace}:${digest}`;
}

/** Atomically claim a fixed-window allowance shared by every server instance. */
export async function claimSharedAllowance(identity: string, policy: LimitPolicy): Promise<boolean> {
  const database = getDatabase();
  const now = new Date();
  const resetAt = new Date(now.getTime() + policy.windowMs);
  const nowIso = now.toISOString();
  const resetAtIso = resetAt.toISOString();
  const key = bucketKey(policy.namespace, identity);
  const [result] = await database.insert(abuseLimits).values({
    bucketKey: key,
    requestCount: 1,
    resetAt,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: abuseLimits.bucketKey,
    set: {
      requestCount: sql<number>`case when ${abuseLimits.resetAt} <= ${nowIso}::timestamptz then 1 else ${abuseLimits.requestCount} + 1 end`,
      resetAt: sql<Date>`case when ${abuseLimits.resetAt} <= ${nowIso}::timestamptz then ${resetAtIso}::timestamptz else ${abuseLimits.resetAt} end`,
      updatedAt: now,
    },
  }).returning({ requestCount: abuseLimits.requestCount });

  // Keep the shared table bounded without retaining long-lived IP/email hashes.
  await database.delete(abuseLimits).where(lt(abuseLimits.resetAt, new Date(now.getTime() - EXPIRED_RETENTION_MS)));
  return Boolean(result && result.requestCount <= policy.maxAttempts);
}

export async function enforceSharedLimit(identity: string, policy: LimitPolicy, message: string) {
  if (!await claimSharedAllowance(identity, policy)) {
    throw createError({ statusCode: 429, statusMessage: message });
  }
}

export async function clearSharedAllowance(identity: string, policy: LimitPolicy) {
  await getDatabase().delete(abuseLimits).where(sql`${abuseLimits.bucketKey} = ${bucketKey(policy.namespace, identity)}`);
}

export const abusePolicies = {
  contact: (namespace: string): LimitPolicy => ({ namespace: `request:${namespace}`, maxAttempts: 5, windowMs: 15 * 60_000 }),
  loginIp: { namespace: 'login:ip', maxAttempts: 6, windowMs: 15 * 60_000 },
  loginRecipient: { namespace: 'login:recipient', maxAttempts: 1, windowMs: 60_000 },
  statusIp: { namespace: 'checkout-status:ip', maxAttempts: 60, windowMs: 15 * 60_000 },
  verificationReference: { namespace: 'checkout-status:reference', maxAttempts: 1, windowMs: 15_000 },
} as const;
