import { invoiceReviewSchema } from '@tilana/contracts/invoices';
import { approveInvoicePurchaseReview } from '@server/services/invoice-review';
import { requireAdminMutation } from '@server/utils/admin-mutation';
import { readZodBody, requireRouteDatabaseId } from '@server/utils/route-validation';

/** Evidence approval never edits an order or changes a provider payment/refund outcome. */
export default defineEventHandler(async event => {
  const { user } = await requireAdminMutation(event);
  const id = requireRouteDatabaseId(event, 'order');
  const input = await readZodBody(event, invoiceReviewSchema, 'Check the review evidence.');
  return approveInvoicePurchaseReview(id, input, user.id);
});
