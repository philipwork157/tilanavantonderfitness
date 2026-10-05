import { eq } from 'drizzle-orm';
import { inquiries } from '@tilana/db';
import { updateInquiryRequestSchema } from '@tilana/contracts/admin-inquiries';

/** Change an enquiry's status (archive, restore, mark replied). */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  await requireAdmin(event);

  const id = Number(getRouterParam(event, 'id'));
  if (!Number.isSafeInteger(id) || id < 1) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown enquiry.' });
  }
  const parsed = updateInquiryRequestSchema.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Choose a valid status.' });
  }

  const [updated] = await useDatabase().update(inquiries)
    .set({ status: parsed.data.status })
    .where(eq(inquiries.id, id))
    .returning({ id: inquiries.id, status: inquiries.status });
  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'Enquiry not found.' });
  }
  return { inquiry: updated };
});
