import { describe, expect, it } from 'vitest';
import { createFailureLimiter, isAllowedAdmin, isSameOrigin, parseAdminEmails } from '../server/utils/admin-access';
import { safeRedirectPath } from '../app/utils/safe-redirect';
import { adminLoginRequestSchema } from '@tilana/contracts/admin-auth';

const confirmed = '2026-01-01T00:00:00Z';

describe('parseAdminEmails', () => {
  it('normalises comma and whitespace separated emails', () => {
    expect([...parseAdminEmails(' Tilana@Example.com, owner@example.com\nthird@example.com ,')])
      .toEqual(['tilana@example.com', 'owner@example.com', 'third@example.com']);
  });

  it('returns an empty set when unset', () => {
    expect(parseAdminEmails(undefined).size).toBe(0);
    expect(parseAdminEmails('  ').size).toBe(0);
  });
});

describe('isAllowedAdmin', () => {
  const allow = parseAdminEmails('tilana@example.com');

  it('allows a confirmed listed email regardless of case', () => {
    expect(isAllowedAdmin({ email: 'Tilana@Example.com', email_confirmed_at: confirmed }, allow)).toBe(true);
  });

  it('rejects unlisted, unconfirmed or missing users', () => {
    expect(isAllowedAdmin({ email: 'someone@example.com', email_confirmed_at: confirmed }, allow)).toBe(false);
    expect(isAllowedAdmin({ email: 'tilana@example.com', email_confirmed_at: null }, allow)).toBe(false);
    expect(isAllowedAdmin({ email: null, email_confirmed_at: confirmed }, allow)).toBe(false);
    expect(isAllowedAdmin(null, allow)).toBe(false);
  });

  it('rejects everyone when the allow-list is empty', () => {
    expect(isAllowedAdmin({ email: 'tilana@example.com', email_confirmed_at: confirmed }, new Set())).toBe(false);
  });
});

describe('isSameOrigin', () => {
  it('accepts a matching origin', () => {
    expect(isSameOrigin('https://admin.example.com', 'admin.example.com')).toBe(true);
    expect(isSameOrigin('http://localhost:3001', 'localhost:3001')).toBe(true);
  });

  it('rejects missing, foreign or malformed origins', () => {
    expect(isSameOrigin(undefined, 'admin.example.com')).toBe(false);
    expect(isSameOrigin('https://evil.example.com', 'admin.example.com')).toBe(false);
    expect(isSameOrigin('http://localhost:3002', 'localhost:3001')).toBe(false);
    expect(isSameOrigin('not a url', 'admin.example.com')).toBe(false);
  });
});

describe('createFailureLimiter', () => {
  it('blocks after the maximum failures and recovers after the window', () => {
    let time = 0;
    const limiter = createFailureLimiter({ maxFailures: 3, windowMs: 1000, now: () => time });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(limiter.isBlocked('key')).toBe(false);
      limiter.recordFailure('key');
    }
    expect(limiter.isBlocked('key')).toBe(true);
    expect(limiter.isBlocked('other')).toBe(false);

    time = 1001;
    expect(limiter.isBlocked('key')).toBe(false);
  });

  it('clears failures after a successful sign-in', () => {
    const limiter = createFailureLimiter({ maxFailures: 1, windowMs: 1000, now: () => 0 });
    limiter.recordFailure('key');
    expect(limiter.isBlocked('key')).toBe(true);
    limiter.clear('key');
    expect(limiter.isBlocked('key')).toBe(false);
  });
});

describe('safeRedirectPath', () => {
  it('keeps local paths', () => {
    expect(safeRedirectPath('/programs?tab=volumes')).toBe('/programs?tab=volumes');
  });

  it('falls back to home for external, protocol-relative, login or non-string targets', () => {
    expect(safeRedirectPath('https://evil.example.com')).toBe('/');
    expect(safeRedirectPath('//evil.example.com')).toBe('/');
    expect(safeRedirectPath('/\\evil.example.com')).toBe('/');
    expect(safeRedirectPath('/login')).toBe('/');
    expect(safeRedirectPath(['/programs'])).toBe('/');
    expect(safeRedirectPath(undefined)).toBe('/');
  });
});

describe('adminLoginRequestSchema', () => {
  it('trims and lowercases the email', () => {
    expect(adminLoginRequestSchema.parse({ email: '  Tilana@Example.com ', password: 'secret' }))
      .toEqual({ email: 'tilana@example.com', password: 'secret' });
  });

  it('rejects an invalid email or empty password', () => {
    expect(adminLoginRequestSchema.safeParse({ email: 'nope', password: 'secret' }).success).toBe(false);
    expect(adminLoginRequestSchema.safeParse({ email: 'tilana@example.com', password: '' }).success).toBe(false);
  });
});
