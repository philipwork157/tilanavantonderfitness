import type { ClientPurchaseStatus } from '@tilana/contracts/clients';

export function shouldGrantManualProgramAccess(purchaseStatus: ClientPurchaseStatus) {
  return purchaseStatus === 'paid';
}
