/** Confirmed seller details are copied onto each invoice, not read live by PDF renderers. */
export const INVOICE_SELLER = {
  sellerName: 'Tilana van Tonder',
  sellerAddress: 'Ternberry Village, Cleveland 31\nCape Town, Western Cape, 7580\nSouth Africa',
  sellerTaxNumber: null,
  notes: 'Sole proprietor. Not VAT-registered. No VAT charged.',
} as const;

/** Validate snapshot arithmetic before issuing a financial document. */
export function validateInvoicePurchase(
  order: { currency: string; subtotalCents: number; discountCents: number; taxCents: number; totalCents: number },
  payment: { amountCents: number; currency: string },
  items: Array<{ quantity: number; unitPriceCents: number; lineTotalCents: number }>,
) {
  const amounts = [order.subtotalCents, order.discountCents, order.taxCents, order.totalCents, payment.amountCents];
  if (amounts.some(value => !Number.isSafeInteger(value) || value < 0)
    || order.currency !== 'ZAR' || payment.currency !== order.currency || payment.amountCents !== order.totalCents
    || order.taxCents !== 0 || order.totalCents <= 0
    || order.totalCents !== order.subtotalCents - order.discountCents || items.length === 0
    || items.some(item => !Number.isSafeInteger(item.quantity) || item.quantity <= 0
      || !Number.isSafeInteger(item.unitPriceCents) || item.unitPriceCents < 0
      || !Number.isSafeInteger(item.lineTotalCents) || item.lineTotalCents !== item.quantity * item.unitPriceCents)
    || items.reduce((sum, item) => sum + item.lineTotalCents, 0) !== order.subtotalCents) {
    throw new Error('Purchase snapshots require billing review.');
  }
}
