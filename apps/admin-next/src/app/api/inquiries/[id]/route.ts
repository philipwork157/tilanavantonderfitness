import { updateInquiryRequestSchema } from '@tilana/contracts/admin-inquiries';
import { inquiries } from '@tilana/db';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/server/auth/admin';
import { isSameOrigin } from '@/server/auth/admin-access';
import { getDatabase } from '@/server/db';
import { handle, HttpError, readJson, routeId, sameOriginOnly, type IdContext } from '@/server/http';
import { matchInquiryOrders } from '@/server/services/inquiries';

/** The order an order/payment/refund enquiry is about (matched by order number, then email). */
export const GET = handle(async (_request: Request, context: IdContext) => {
  await requireAdmin();
  const id = await routeId(context, 'Unknown enquiry.');
  const db = getDatabase();
  const [inquiry] = await db.select({
    orderTopic: inquiries.orderTopic,
    orderNumber: inquiries.orderNumber,
    purchaseEmail: inquiries.purchaseEmail,
    email: inquiries.email,
  }).from(inquiries).where(eq(inquiries.id, id)).limit(1);
  if (!inquiry) throw new HttpError(404, 'Enquiry not found.');
  if (!inquiry.orderTopic) return Response.json({ match: null });
  return Response.json({ match: await matchInquiryOrders(db, inquiry) });
});

/** Change an enquiry's status (archive, restore, mark replied). */
export const PATCH = handle(async (request: Request, context: IdContext) => {
  sameOriginOnly(request, isSameOrigin);
  await requireAdmin();
  const id = await routeId(context, 'Unknown enquiry.');
  const parsed = updateInquiryRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) throw new HttpError(400, 'Choose a valid status.');
  const [updated] = await getDatabase().update(inquiries)
    .set({ status: parsed.data.status })
    .where(eq(inquiries.id, id))
    .returning({ id: inquiries.id, status: inquiries.status });
  if (!updated) throw new HttpError(404, 'Enquiry not found.');
  return Response.json({ inquiry: updated });
});
