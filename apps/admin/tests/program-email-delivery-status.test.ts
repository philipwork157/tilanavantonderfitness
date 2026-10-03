import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { programEmailDeliveryStatusSchema, programEmailNeedsAttention, PROGRAM_EMAIL_PENDING_ATTENTION_MS } from '@tilana/contracts/clients';
import { adminDashboardAlertsSchema } from '@tilana/contracts/dashboard';
import { getProgramEmailDeliveryStatus } from '@server/utils/program-email-delivery';

describe('purchase email status for V1 sales', () => {
  const notification = { id: 1, attempts: 0, sentAt: null, canceledAt: null };
  it.each([null, undefined])('does not claim delivery when no purchase job exists (%s)', value => {
    expect(getProgramEmailDeliveryStatus(value)).toBe('unavailable');
  });
  it('shows initial waiting work and unresolved attempts independently of payment status', () => {
    expect(getProgramEmailDeliveryStatus(notification)).toBe('pending');
    expect(getProgramEmailDeliveryStatus({ ...notification, attempts: 1 })).toBe('retrying');
  });
  it('uses provider acceptance or cancellation even after failed attempts', () => {
    const completed = { ...notification, attempts: 3, sentAt: new Date() };
    expect(getProgramEmailDeliveryStatus(completed)).toBe('sent');
    expect(getProgramEmailDeliveryStatus({ ...completed, canceledAt: new Date() })).toBe('canceled');
  });
  it.each(['retrying', 'unavailable'] as const)('flags unresolved %s delivery', status => {
    expect(programEmailNeedsAttention(status)).toBe(true);
  });
  it('flags a stuck first send at 30 minutes, but not freshly queued or completed work', () => {
    const now = Date.now(); const queuedAt = new Date(now - PROGRAM_EMAIL_PENDING_ATTENTION_MS);
    expect(programEmailNeedsAttention('pending', queuedAt, now - 1)).toBe(false);
    expect(programEmailNeedsAttention('pending', queuedAt.toISOString(), now)).toBe(true);
    expect(programEmailNeedsAttention('pending', new Date(now + 1), now)).toBe(false);
    expect(programEmailNeedsAttention('sent', queuedAt, now)).toBe(false);
    expect(programEmailNeedsAttention('canceled', queuedAt, now)).toBe(false);
    expect(programEmailNeedsAttention('pending', 'not-a-date', now)).toBe(false);
  });
  it('validates the new delivery/alert boundary without accepting unknown states or negative counts', () => {
    expect(programEmailDeliveryStatusSchema.safeParse('delivered').success).toBe(false);
    const alerts = { failedPayments: 0, stalePayments: 0, refundsNeedingAttention: 0, programEmailsNeedingAttention: 2 };
    expect(adminDashboardAlertsSchema.parse(alerts)).toEqual(alerts);
    expect(adminDashboardAlertsSchema.safeParse({ ...alerts, programEmailsNeedingAttention: -1 }).success).toBe(false);
  });
  it('wires visible order-level badges and the dashboard attention link without an inbox-delivered claim', () => {
    const clients = readFileSync(new URL('../app/pages/clients/index.vue', import.meta.url), 'utf8');
    const dashboard = readFileSync(new URL('../app/pages/dashboard.vue', import.meta.url), 'utf8');
    expect(clients).toContain('isFirstOrderProgramme(row.original.programmes, programmeIndex)');
    expect(clients).toContain('Email accepted by SES');
    expect(clients).toContain('programEmailNeedsAttention(programme.delivery.status, programme.delivery.queuedAt)');
    expect(clients).toContain('not proof it reached the inbox');
    expect(dashboard).toContain('/clients?delivery=attention');
    expect(dashboard).toContain('alerts.programEmailsNeedingAttention');
  });
});
