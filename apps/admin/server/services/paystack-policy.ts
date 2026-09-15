export type TerminalCheckoutResolution = {
  paymentStatus: 'failed' | 'abandoned' | 'reversed';
  orderStatus: 'cancelled' | 'refunded';
  fullyRefunded: boolean;
  revokeAccess: boolean;
};

const fulfilledPaymentStatuses = new Set([
  'succeeded',
  'partially_refunded',
  'refunded',
  'reversed',
]);

const terminalCheckoutResolutions: Record<string, TerminalCheckoutResolution> = {
  failed: {
    paymentStatus: 'failed',
    orderStatus: 'cancelled',
    fullyRefunded: false,
    revokeAccess: false,
  },
  abandoned: {
    paymentStatus: 'abandoned',
    orderStatus: 'cancelled',
    fullyRefunded: false,
    revokeAccess: false,
  },
  reversed: {
    paymentStatus: 'reversed',
    orderStatus: 'refunded',
    fullyRefunded: true,
    revokeAccess: true,
  },
};

export function isPaystackEnvironmentMatch(
  receivedEnvironment: string | null,
  expectedEnvironment: string | null,
): boolean {
  return receivedEnvironment !== null
    && expectedEnvironment !== null
    && receivedEnvironment === expectedEnvironment;
}

export function isPaymentAlreadyFulfilled(status: string): boolean {
  return fulfilledPaymentStatuses.has(status);
}

export function isProgramAccessCurrent(expiresAt: Date | null, now: Date): boolean {
  return expiresAt === null || expiresAt > now;
}

export function getTerminalCheckoutResolution(
  providerStatus: string | null,
): TerminalCheckoutResolution | null {
  return providerStatus ? terminalCheckoutResolutions[providerStatus] ?? null : null;
}
