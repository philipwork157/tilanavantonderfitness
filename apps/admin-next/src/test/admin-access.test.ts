import { describe, expect, it } from 'vitest';
import { ADMIN_AREA_ROLES, hasAnyRole } from '@tilana/db/roles';
import { confirmedEmail, createAttemptLimiter, isSameOrigin } from '@/server/auth/admin-access';
import { clientIp } from '@/server/client-ip';
import { safeRedirectPath } from '@/lib/safe-redirect';
import { adminLoginRequestSchema } from '@tilana/contracts/admin-auth';

const confirmed = '2026-01-01T00:00:00Z';

describe('confirmedEmail', () => {
  it('returns the lowercase email only when it is confirmed', () => {
    expect(confirmedEmail({ email: ' Tilana@Example.com ', email_confirmed_at: confirmed })).toBe('tilana@example.com');
    expect(confirmedEmail({ email: 'tilana@example.com', email_confirmed_at: null })).toBeNull();
    expect(confirmedEmail({ email: null, email_confirmed_at: confirmed })).toBeNull();
    expect(confirmedEmail(null)).toBeNull();
  });
});

describe('hasAnyRole', () => {
  it('allows admin and staff into the admin area, not customers', () => {
    expect(hasAnyRole(['admin'], ADMIN_AREA_ROLES)).toBe(true);
    expect(hasAnyRole(['staff'], ADMIN_AREA_ROLES)).toBe(true);
    expect(hasAnyRole(['customer', 'admin'], ADMIN_AREA_ROLES)).toBe(true);
    expect(hasAnyRole(['customer'], ADMIN_AREA_ROLES)).toBe(false);
    expect(hasAnyRole([], ADMIN_AREA_ROLES)).toBe(false);
  });

  it('limits admin-only actions to admins', () => {
    expect(hasAnyRole(['staff'], ['admin'])).toBe(false);
    expect(hasAnyRole(['admin', 'staff'], ['admin'])).toBe(true);
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

describe('createAttemptLimiter', () => {
  it('blocks after the maximum failures and recovers after the window', () => {
    let time = 0;
    const limiter = createAttemptLimiter({ maxAttempts: 3, windowMs: 1000, now: () => time });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(limiter.isBlocked('key')).toBe(false);
      limiter.record('key');
    }
    expect(limiter.isBlocked('key')).toBe(true);
    expect(limiter.isBlocked('other')).toBe(false);

    time = 1001;
    expect(limiter.isBlocked('key')).toBe(false);
  });

  it('clears failures after a successful sign-in', () => {
    const limiter = createAttemptLimiter({ maxAttempts: 1, windowMs: 1000, now: () => 0 });
    limiter.record('key');
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

describe('clientIp', () => {
  const ip = (headers: Record<string, string>) => clientIp(new Request('http://localhost/', { headers }));
  it('trusts Fly-Client-IP, which Fly sets itself', () => {
    expect(ip({ 'fly-client-ip': '102.33.4.25', 'x-forwarded-for': '1.2.3.4' })).toBe('102.33.4.25');
  });
  it('otherwise takes the last X-Forwarded-For entry, never the one a visitor can type', () => {
    expect(ip({ 'x-forwarded-for': '6.6.6.6, 102.33.4.25' })).toBe('102.33.4.25');
    expect(ip({})).toBe('unknown');
  });
});

describe('createAttemptLimiter memory', () => {
  it('forgets keys whose attempts have expired', () => {
    let time = 0;
    const limiter = createAttemptLimiter({ maxAttempts: 3, windowMs: 1000, now: () => time });
    for (let i = 0; i < 50; i += 1) limiter.record(`ip-${i}`);
    expect(limiter.size()).toBe(50);
    time = 5000;
    limiter.record('fresh');
    expect(limiter.size()).toBe(1);
  });
});
