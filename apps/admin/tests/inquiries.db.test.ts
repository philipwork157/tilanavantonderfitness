/**
 * Database tests for saving enquiries. Need an isolated, throwaway Postgres:
 *   TEST_DATABASE_URL=postgresql://... pnpm --filter @tilana/admin test
 */
import { fileURLToPath } from 'node:url';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, inquiries, type Database } from '@tilana/db';
import { createInquiry, type SavedInquiry } from '../server/services/inquiries';

const url = process.env.TEST_DATABASE_URL;
const input = {
  name: 'Anna Smith',
  email: 'Anna@Example.com',
  interest: 'move' as const,
  message: 'I would like to start the beginner program.',
  consent: true as const,
  website: '',
  turnstileToken: '',
};

describe.skipIf(!url)('createInquiry (database)', () => {
  let db: Database;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, close } = createDatabase(url!, { max: 1 }));
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../../../packages/db/migrations', import.meta.url)) });
  });

  beforeEach(async () => {
    await db.execute(sql`truncate table inquiries restart identity`);
  });

  afterAll(async () => {
    await close?.();
  });

  it('saves the enquiry with the shown label and consent time, then records the notification', async () => {
    const acceptedAt = new Date('2026-10-05T12:00:00Z');
    let notified: SavedInquiry | undefined;
    const result = await createInquiry(db, input, { now: acceptedAt, notify: async (row) => { notified = row; } });

    expect(result).toEqual({ id: 1, notified: true });
    expect(notified?.email).toBe('anna@example.com');
    const [row] = await db.select().from(inquiries).where(eq(inquiries.id, 1));
    expect(row).toMatchObject({
      name: 'Anna Smith',
      email: 'anna@example.com',
      interest: 'move',
      interestLabel: 'Beginner · Volume 1',
      status: 'new',
      notificationError: null,
    });
    expect(row!.privacyAcceptedAt.toISOString()).toBe(acceptedAt.toISOString());
    expect(row!.notifiedAt).toBeInstanceOf(Date);
  });

  it('keeps the enquiry and stores the reason when the email fails', async () => {
    const result = await createInquiry(db, input, { notify: async () => { throw new Error('SES rejected the sender'); } });

    expect(result).toEqual({ id: 1, notified: false });
    const [row] = await db.select().from(inquiries).where(eq(inquiries.id, 1));
    expect(row!.notifiedAt).toBeNull();
    expect(row!.notificationError).toBe('SES rejected the sender');
  });

  it('only allows known statuses', async () => {
    await createInquiry(db, input, { notify: async () => {} });
    await expect(db.execute(sql`update inquiries set status = 'spam' where id = 1`)).rejects.toThrow();
  });
});
