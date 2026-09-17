import type {
  BasketCheckoutRequest,
  CheckoutRequest,
  CheckoutResponse,
  CheckoutStatusResponse,
} from '@tilana/contracts/checkout';
import { paystackVerificationResponseSchema, type AdminPaymentRefundRequest } from '@tilana/contracts/payments';
import type { Database } from '@tilana/db/server';
import {
  clients,
  orderItems,
  orders,
  paymentEvents,
  paymentRefunds,
  payments,
  programAccess,
  programFiles,
  programs,
  programVolumes,
  type PaymentRefundStatus,
} from '@tilana/db/schema';
import { and, desc, eq, inArray, ne, or, sql } from 'drizzle-orm';
import { getDatabase } from '@server/utils/database';
import { assertPaystackDatabaseEnvironment, getPaystackCheckoutConfiguration, getPaystackCredentials } from '@server/utils/paystack-configuration';
import { getCatalogueStorageConfiguration } from '@server/utils/r2';
import { isCheckoutPriceCurrent } from './catalogue-policy';
import { hashCheckoutIntent, resolvePaystackCheckout } from './paystack-checkout-intent';
import {
  getTerminalCheckoutResolution,
  isPaymentAlreadyFulfilled,
  isPaystackEnvironmentMatch,
  isProgramAccessCurrent,
} from './paystack-policy';

type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

interface PaystackRefundResponse {
  status: boolean;
  message: string;
  data?: {
    id?: unknown;
    refund_reference?: unknown;
    status?: unknown;
    amount?: unknown;
    currency?: unknown;
    domain?: unknown;
    refunded_at?: unknown;
    expected_at?: unknown;
    customer_note?: unknown;
    merchant_note?: unknown;
  };
}

interface PaystackEvent {
  event?: unknown;
  data?: {
    id?: unknown;
    reference?: unknown;
    status?: unknown;
    amount?: unknown;
    currency?: unknown;
    fees?: unknown;
    channel?: unknown;
    gateway_response?: unknown;
    paid_at?: unknown;
    transaction_reference?: unknown;
    refund_reference?: unknown;
    domain?: unknown;
    refunded_at?: unknown;
    expected_at?: unknown;
    customer_note?: unknown;
    merchant_note?: unknown;
  };
  [key: string]: unknown;
}

function makeOrderNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return `WEB-${date}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function makePaymentReference(): string {
  return `TVT-${Date.now()}-${crypto.randomUUID()}`;
}

type CheckoutCustomer = Pick<
  BasketCheckoutRequest,
  'firstName' | 'lastName' | 'email' | 'phone'
>;

async function getOrCreateClient(transaction: DatabaseTransaction, input: CheckoutCustomer) {
  const email = input.email.trim().toLowerCase();
  let [client] = await transaction
    .select({ id: clients.id })
    .from(clients)
    .where(sql`lower(${clients.email}) = ${email}`)
    .limit(1);

  if (!client) {
    [client] = await transaction
      .insert(clients)
      .values({
        firstName: input.firstName,
        lastName: input.lastName,
        email,
        phone: input.phone || null,
      })
      .onConflictDoNothing()
      .returning({ id: clients.id });
  }

  if (!client) {
    [client] = await transaction
      .select({ id: clients.id })
      .from(clients)
      .where(sql`lower(${clients.email}) = ${email}`)
      .limit(1);
  }

  if (!client) throw new Error('The customer record could not be created.');
  return { id: client.id, email };
}

async function getPurchasableVolume(
  transaction: DatabaseTransaction,
  volumeSlug: CheckoutRequest['volumeSlug'],
) {
  const storage = getCatalogueStorageConfiguration();
  const [volume] = await transaction
    .select({
      id: programVolumes.id,
      name: programVolumes.name,
      priceCents: programVolumes.currentPriceCents,
      currency: programVolumes.currency,
      isPublished: programVolumes.isPublished,
    })
    .from(programVolumes)
    .innerJoin(programs, eq(programs.id, programVolumes.programId))
    .where(and(
      eq(programVolumes.slug, volumeSlug),
      eq(programVolumes.isPublished, true),
      eq(programs.status, 'published'),
    ))
    .limit(1);

  if (!volume || !volume.isPublished || volume.priceCents <= 0 || volume.currency !== 'ZAR') {
    throw createError({ statusCode: 409, statusMessage: 'This program is not available for purchase yet.' });
  }

  const [readyFile] = await transaction
    .select({ id: programFiles.id })
    .from(programFiles)
    .where(and(
      eq(programFiles.programVolumeId, volume.id),
      eq(programFiles.uploadStatus, 'ready'),
      eq(programFiles.isActive, true),
      eq(programFiles.r2Bucket, storage.privateProgramBucket),
    ))
    .limit(1);

  if (!readyFile) {
    throw createError({ statusCode: 409, statusMessage: 'This program is not available for purchase yet.' });
  }

  return volume;
}

export async function initializePaystackCheckout(input: CheckoutRequest): Promise<CheckoutResponse> {
  return initializePaystackBasketCheckout({
    idempotencyKey: input.idempotencyKey,
    items: [{ volumeSlug: input.volumeSlug, expectedPriceCents: input.expectedPriceCents }],
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone,
    consent: input.consent,
    website: input.website,
    turnstileToken: input.turnstileToken,
  });
}

export async function initializePaystackBasketCheckout(input: BasketCheckoutRequest): Promise<CheckoutResponse> {
  const { secretKey, callbackUrl, environment } = getPaystackCheckoutConfiguration();
  await assertPaystackDatabaseEnvironment();

  const database = getDatabase();
  const { keyHash, requestHash } = hashCheckoutIntent(input);
  const checkout = await database.transaction(async (transaction) => {
    // Serialize first reservations across modes: two differently configured apps must not both pass an empty-database check.
    await transaction.execute(sql`select pg_advisory_xact_lock(84621904)`);
    await assertPaystackDatabaseEnvironment(transaction);
    // Serialize reservation creation across processes before checking the unique
    // key. The transaction ends before contacting Paystack; no network row lock.
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${keyHash}, 0))`);
    const [existing] = await transaction.select().from(payments).where(and(
      eq(payments.provider, 'paystack'), eq(payments.environment, environment as 'test' | 'live'),
      eq(payments.checkoutIntentKeyHash, keyHash),
    )).limit(1);
    if (existing) {
      if (existing.checkoutRequestHash !== requestHash) {
        throw createError({ statusCode: 409, statusMessage: 'This checkout key belongs to different details. Please review your basket.' });
      }
      const [order] = await transaction.select({ email: orders.customerEmail }).from(orders).where(eq(orders.id, existing.orderId));
      const items = await transaction.select({ id: orderItems.programVolumeId }).from(orderItems).where(eq(orderItems.orderId, existing.orderId));
      if (!order?.email || !existing.providerReference) throw new Error('The checkout reservation is incomplete.');
      return { orderId: existing.orderId, paymentId: existing.id, reference: existing.providerReference,
        email: order.email, volumeIds: items.map(item => item.id), totalCents: existing.amountCents };
    }
    const customer = await getOrCreateClient(transaction, input);
    const volumes = [];
    for (const item of input.items) {
      const volume = await getPurchasableVolume(transaction, item.volumeSlug);
      if (!isCheckoutPriceCurrent(item.expectedPriceCents, volume.priceCents)) {
        throw createError({ statusCode: 409, statusMessage: 'A programme price has changed. Please review your basket before paying.' });
      }
      volumes.push(volume);
    }
    const totalCents = volumes.reduce((total, volume) => total + volume.priceCents, 0);
    if (!Number.isSafeInteger(totalCents) || totalCents <= 0 || totalCents > 2_147_483_647) {
      throw createError({ statusCode: 409, statusMessage: 'The basket total is not valid.' });
    }
    const orderNumber = makeOrderNumber();
    const reference = makePaymentReference();

    const [order] = await transaction
      .insert(orders)
      .values({
        orderNumber,
        clientId: customer.id,
        customerEmail: customer.email,
        status: 'pending',
        currency: 'ZAR',
        subtotalCents: totalCents,
        totalCents,
      })
      .returning({ id: orders.id });

    if (!order) throw new Error('The order could not be created.');

    await transaction.insert(orderItems).values(volumes.map(volume => ({
      orderId: order.id,
      clientId: customer.id,
      programVolumeId: volume.id,
      description: volume.name,
      quantity: 1,
      unitPriceCents: volume.priceCents,
      lineTotalCents: volume.priceCents,
    })));

    const [payment] = await transaction
      .insert(payments)
      .values({
        orderId: order.id,
        provider: 'paystack',
        providerReference: reference,
        environment: environment as 'test' | 'live',
        checkoutIntentKeyHash: keyHash,
        checkoutRequestHash: requestHash,
        providerStatus: 'initialization_reserved',
        amountCents: totalCents,
        currency: 'ZAR',
      })
      .returning({ id: payments.id });

    if (!payment) throw new Error('The payment attempt could not be created.');
    return { orderId: order.id, paymentId: payment.id, reference, email: customer.email, volumeIds: volumes.map(volume => volume.id), totalCents };
  });

  return resolvePaystackCheckout(database, checkout, { secretKey, callbackUrl }, verifyPaystackCheckout);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null;
}

function integerValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function identifierValue(value: unknown): string | null {
  if (typeof value === 'string' && value) return value;
  return typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : null;
}

function dateValue(value: unknown): Date | null {
  const raw = stringValue(value);
  if (!raw || Number.isNaN(Date.parse(raw))) return null;
  return new Date(raw);
}

const refundEventStatuses: Record<string, PaymentRefundStatus> = {
  'refund.pending': 'pending',
  'refund.processing': 'processing',
  'refund.needs-attention': 'needs-attention',
  'refund.failed': 'failed',
  'refund.processed': 'processed',
};

const refundStatusProgress: Record<PaymentRefundStatus, number> = {
  pending: 0,
  processing: 1,
  'needs-attention': 2,
  failed: 3,
  processed: 3,
};

export class PaystackRefundError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = 'PaystackRefundError';
  }
}

async function markPaymentEvent(
  transaction: DatabaseTransaction,
  eventId: number,
  processingStatus: 'processed' | 'ignored' | 'failed',
  errorMessage: string | null = null,
) {
  await transaction
    .update(paymentEvents)
    .set({ processingStatus, errorMessage, processedAt: new Date() })
    .where(eq(paymentEvents.id, eventId));
}

async function getOrderAccessItems(transaction: DatabaseTransaction, orderId: number) {
  return transaction
    .select({
      id: orderItems.id,
      clientId: orderItems.clientId,
      programVolumeId: orderItems.programVolumeId,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));
}

async function ensureAccessForItem(
  transaction: DatabaseTransaction,
  item: { id: number; clientId: number; programVolumeId: number | null },
) {
  if (!item.programVolumeId) return;

  const [activeAccess] = await transaction
    .select({ id: programAccess.id, expiresAt: programAccess.expiresAt })
    .from(programAccess)
    .where(and(
      eq(programAccess.clientId, item.clientId),
      eq(programAccess.programVolumeId, item.programVolumeId),
      eq(programAccess.status, 'active'),
    ))
    .limit(1);
  const now = new Date();
  if (activeAccess && isProgramAccessCurrent(activeAccess.expiresAt, now)) return;
  if (activeAccess) {
    await transaction
      .update(programAccess)
      .set({ status: 'expired', updatedAt: now })
      .where(eq(programAccess.id, activeAccess.id));
  }

  const [existingAccess] = await transaction
    .select({ id: programAccess.id })
    .from(programAccess)
    .where(eq(programAccess.orderItemId, item.id))
    .limit(1);

  if (existingAccess) {
    await transaction
      .update(programAccess)
      .set({ status: 'active', expiresAt: null, revokedAt: null, updatedAt: new Date() })
      .where(eq(programAccess.id, existingAccess.id));
    return;
  }

  await transaction
    .insert(programAccess)
    .values({
      clientId: item.clientId,
      programVolumeId: item.programVolumeId,
      orderItemId: item.id,
      source: 'purchase',
    })
    .onConflictDoNothing();
}

async function grantOrderAccess(transaction: DatabaseTransaction, orderId: number) {
  const items = await getOrderAccessItems(transaction, orderId);
  for (const item of items) await ensureAccessForItem(transaction, item);
}

async function revokeOrderAccess(transaction: DatabaseTransaction, orderId: number) {
  const items = await getOrderAccessItems(transaction, orderId);
  const itemIds = items.map((item) => item.id);
  const now = new Date();

  if (itemIds.length) {
    await transaction
      .update(programAccess)
      .set({ status: 'revoked', revokedAt: now, updatedAt: now })
      .where(and(inArray(programAccess.orderItemId, itemIds), eq(programAccess.status, 'active')));
  }

  // A second paid order for the same programme must keep the entitlement alive.
  for (const item of items) {
    if (!item.programVolumeId) continue;
    const [replacement] = await transaction
      .select({
        id: orderItems.id,
        clientId: orderItems.clientId,
        programVolumeId: orderItems.programVolumeId,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(
        eq(orderItems.clientId, item.clientId),
        eq(orderItems.programVolumeId, item.programVolumeId),
        eq(orders.status, 'paid'),
        ne(orders.id, orderId),
      ))
      .orderBy(desc(orders.paidAt))
      .limit(1);
    if (replacement) await ensureAccessForItem(transaction, replacement);
  }
}

type PaymentEventRecord = {
  id: number;
  orderId: number;
  status: typeof payments.$inferSelect.status;
  amountCents: number;
  currency: string;
  environment: typeof payments.$inferSelect.environment;
};

async function synchronizePaymentRefundState(
  transaction: DatabaseTransaction,
  payment: PaymentEventRecord,
  providerStatus?: PaymentRefundStatus,
) {
  const [processed] = await transaction
    .select({ total: sql<number>`coalesce(sum(${paymentRefunds.amountCents}), 0)::integer` })
    .from(paymentRefunds)
    .where(and(eq(paymentRefunds.paymentId, payment.id), eq(paymentRefunds.status, 'processed')));
  const refundedAmountCents = processed?.total ?? 0;
  const paymentStatus = refundedAmountCents === 0
    ? 'succeeded'
    : refundedAmountCents === payment.amountCents
      ? 'refunded'
      : 'partially_refunded';
  const fullyRefunded = paymentStatus === 'refunded';
  const now = new Date();

  await transaction
    .update(payments)
    .set({
      status: paymentStatus,
      ...(providerStatus && { providerStatus }),
      refundedAmountCents,
      updatedAt: now,
    })
    .where(eq(payments.id, payment.id));
  await transaction
    .update(orders)
    .set({ status: fullyRefunded ? 'refunded' : 'paid', updatedAt: now })
    .where(eq(orders.id, payment.orderId));

  if (fullyRefunded) await revokeOrderAccess(transaction, payment.orderId);
  else await grantOrderAccess(transaction, payment.orderId);
}

async function processChargeSuccess(
  transaction: DatabaseTransaction,
  eventId: number,
  payload: PaystackEvent,
  payment: PaymentEventRecord | undefined,
) {
  const amount = numberValue(payload.data?.amount);
  const currency = stringValue(payload.data?.currency);
  const providerStatus = stringValue(payload.data?.status);
  const environment = stringValue(payload.data?.domain);

  if (
    !payment
    || providerStatus !== 'success'
    || amount !== payment.amountCents
    || currency !== payment.currency
    || !isPaystackEnvironmentMatch(environment, payment.environment)
  ) {
    await markPaymentEvent(
      transaction,
      eventId,
      'failed',
      'Payment reference, environment, status, amount, or currency did not match the pending payment.',
    );
    return;
  }

  if (isPaymentAlreadyFulfilled(payment.status)) {
    await markPaymentEvent(transaction, eventId, 'ignored', 'The successful payment was already processed.');
    return;
  }

  const now = new Date();
  const paidAt = dateValue(payload.data?.paid_at) ?? now;
  const transactionId = identifierValue(payload.data?.id);

  await transaction
    .update(payments)
    .set({
      status: 'succeeded',
      providerTransactionId: transactionId,
      providerStatus,
      channel: stringValue(payload.data?.channel),
      gatewayResponse: stringValue(payload.data?.gateway_response),
      feesCents: numberValue(payload.data?.fees),
      refundedAmountCents: 0,
      verifiedAt: now,
      paidAt,
      failureMessage: null,
      updatedAt: now,
    })
    .where(eq(payments.id, payment.id));

  await transaction
    .update(orders)
    .set({ status: 'paid', paidAt, updatedAt: now })
    .where(eq(orders.id, payment.orderId));

  await grantOrderAccess(transaction, payment.orderId);
  await markPaymentEvent(transaction, eventId, 'processed');
}

async function processRefundEvent(
  transaction: DatabaseTransaction,
  eventId: number,
  eventType: string,
  payload: PaystackEvent,
  payment: PaymentEventRecord | undefined,
) {
  const status = refundEventStatuses[eventType];
  const amount = integerValue(payload.data?.amount);
  const currency = stringValue(payload.data?.currency);
  const environment = stringValue(payload.data?.domain);

  if (
    !status
    || !payment
    || !amount
    || amount > payment.amountCents
    || currency !== payment.currency
    || !isPaystackEnvironmentMatch(environment, payment.environment)
    || !isPaymentAlreadyFulfilled(payment.status)
  ) {
    await markPaymentEvent(
      transaction,
      eventId,
      'failed',
      'Refund reference, environment, payment state, amount, or currency was invalid.',
    );
    return;
  }

  const providerRefundId = identifierValue(payload.data?.id);
  const providerRefundReference = identifierValue(payload.data?.refund_reference);
  const matches = providerRefundId || providerRefundReference
    ? await transaction
        .select()
        .from(paymentRefunds)
        .where(and(
          eq(paymentRefunds.provider, 'paystack'),
          or(
            providerRefundId ? eq(paymentRefunds.providerRefundId, providerRefundId) : undefined,
            providerRefundReference ? eq(paymentRefunds.providerRefundReference, providerRefundReference) : undefined,
            // Before PAY-02 this column could contain a reference instead of an ID.
            providerRefundReference ? eq(paymentRefunds.providerRefundId, providerRefundReference) : undefined,
          ),
        ))
        .limit(2)
    : [];
  let existingRefund = matches[0];
  if (matches.length > 1 || (existingRefund && (
    existingRefund.paymentId !== payment.id
    || existingRefund.amountCents !== amount
    || existingRefund.currency !== currency
    || (providerRefundId && existingRefund.providerRefundId && providerRefundId !== existingRefund.providerRefundId)
    || (providerRefundReference && existingRefund.providerRefundReference && providerRefundReference !== existingRefund.providerRefundReference)
  ))) {
    await markPaymentEvent(transaction, eventId, 'failed', 'Refund identifiers or purchase evidence conflicted; review in Paystack.');
    return;
  }

  if (!existingRefund) {
    const candidates = await transaction
      .select()
      .from(paymentRefunds)
      .where(and(
        eq(paymentRefunds.paymentId, payment.id),
        eq(paymentRefunds.amountCents, amount),
        eq(paymentRefunds.currency, currency),
        ne(paymentRefunds.status, 'failed'),
      ))
      .orderBy(desc(paymentRefunds.createdAt))
      .limit(2);
    // An identifier-less webhook cannot distinguish repeated equal partial
    // refunds. Fail closed rather than guessing or reserving the amount twice.
    const compatible = candidates.filter(candidate =>
      (!providerRefundId || !candidate.providerRefundId || candidate.providerRefundId === providerRefundId)
      && (!providerRefundReference || !candidate.providerRefundReference || candidate.providerRefundReference === providerRefundReference));
    if (compatible.length === 1 && (providerRefundId || providerRefundReference || candidates.length === 1)) {
      [existingRefund] = compatible;
    } else if (compatible.length > 0 || (!providerRefundId && !providerRefundReference)) {
      await markPaymentEvent(transaction, eventId, 'failed', 'Refund identity was missing or ambiguous; review in Paystack.');
      return;
    } else if (candidates.some(candidate => ['pending', 'processing', 'needs-attention'].includes(candidate.status))) {
      await markPaymentEvent(transaction, eventId, 'failed', 'Refund identity conflicted with an unsettled reservation; review in Paystack.');
      return;
    }
  }

  if (
    existingRefund
    && ['processed', 'failed'].includes(existingRefund.status)
    && existingRefund.status !== status
  ) {
    await markPaymentEvent(transaction, eventId, 'ignored', 'The refund had already reached a final state.');
    return;
  }

  const [processedBefore] = await transaction
    .select({ total: sql<number>`coalesce(sum(${paymentRefunds.amountCents}), 0)::integer` })
    .from(paymentRefunds)
    .where(and(
      eq(paymentRefunds.paymentId, payment.id),
      eq(paymentRefunds.status, 'processed'),
      existingRefund ? ne(paymentRefunds.id, existingRefund.id) : undefined,
    ));

  if (status === 'processed' && (processedBefore?.total ?? 0) + amount > payment.amountCents) {
    await markPaymentEvent(transaction, eventId, 'failed', 'The refund would exceed the original payment amount.');
    return;
  }

  const now = new Date();
  const effectiveStatus = existingRefund && refundStatusProgress[existingRefund.status] > refundStatusProgress[status]
    ? existingRefund.status
    : status;
  const values = {
    providerRefundId: providerRefundId ?? existingRefund?.providerRefundId ?? null,
    providerRefundReference: providerRefundReference ?? existingRefund?.providerRefundReference ?? null,
    status: effectiveStatus,
    amountCents: amount,
    currency,
    customerNote: stringValue(payload.data?.customer_note) ?? existingRefund?.customerNote ?? null,
    merchantNote: stringValue(payload.data?.merchant_note) ?? existingRefund?.merchantNote ?? null,
    expectedAt: dateValue(payload.data?.expected_at) ?? existingRefund?.expectedAt ?? null,
    refundedAt: effectiveStatus === 'processed'
      ? dateValue(payload.data?.refunded_at) ?? existingRefund?.refundedAt ?? now
      : null,
    updatedAt: now,
  };

  if (existingRefund) {
    await transaction.update(paymentRefunds).set(values).where(eq(paymentRefunds.id, existingRefund.id));
  } else {
    await transaction.insert(paymentRefunds).values({
      paymentId: payment.id,
      provider: 'paystack',
      ...values,
    });
  }

  await synchronizePaymentRefundState(transaction, payment, effectiveStatus);
  await markPaymentEvent(transaction, eventId, 'processed');
}

async function updateRequestedRefundStatus(
  refundId: number,
  status: PaymentRefundStatus,
  providerStatus: string,
) {
  const database = getDatabase();
  await database.transaction(async (transaction) => {
    const [owner] = await transaction.select({ paymentId: paymentRefunds.paymentId })
      .from(paymentRefunds).where(eq(paymentRefunds.id, refundId)).limit(1);
    if (!owner) return;
    // Keep the same payment-first lock order used by webhooks and API reconciliation.
    await transaction.select({ id: payments.id }).from(payments)
      .where(eq(payments.id, owner.paymentId)).for('update');
    const [refund] = await transaction
      .select({ paymentId: paymentRefunds.paymentId, status: paymentRefunds.status })
      .from(paymentRefunds)
      .where(eq(paymentRefunds.id, refundId))
      .limit(1)
      .for('update');
    if (!refund || ['processed', 'failed'].includes(refund.status)) return;

    const now = new Date();
    await transaction
      .update(paymentRefunds)
      .set({ status, updatedAt: now })
      .where(eq(paymentRefunds.id, refundId));
    await transaction
      .update(payments)
      .set({ providerStatus, updatedAt: now })
      .where(eq(payments.id, refund.paymentId));
  });
}

export async function initiatePaystackRefund(
  orderId: number,
  input: AdminPaymentRefundRequest,
  administratorUserId: number,
) {
  const { secretKey, environment } = getPaystackCredentials();
  await assertPaystackDatabaseEnvironment();

  const database = getDatabase();
  const reservation = await database.transaction(async (transaction) => {
    const [order] = await transaction
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!order) throw new PaystackRefundError('The order could not be found.', 404);

    const [payment] = await transaction
      .select({
        id: payments.id,
        orderId: payments.orderId,
        status: payments.status,
        amountCents: payments.amountCents,
        currency: payments.currency,
        environment: payments.environment,
        providerReference: payments.providerReference,
        providerTransactionId: payments.providerTransactionId,
      })
      .from(payments)
      .where(and(
        eq(payments.orderId, orderId),
        eq(payments.provider, 'paystack'),
        eq(payments.environment, environment as 'test' | 'live'),
        inArray(payments.status, ['succeeded', 'partially_refunded']),
      ))
      .orderBy(desc(payments.paidAt), desc(payments.createdAt))
      .limit(1)
      .for('update');
    if (!payment || !payment.providerReference) {
      throw new PaystackRefundError(
        `This order does not have a refundable ${environment} Paystack payment.`,
        409,
      );
    }

    const [unsettledRefund] = await transaction
      .select({ status: paymentRefunds.status })
      .from(paymentRefunds)
      .where(and(
        eq(paymentRefunds.paymentId, payment.id),
        inArray(paymentRefunds.status, ['pending', 'processing', 'needs-attention']),
      ))
      .limit(1);
    if (unsettledRefund) {
      throw new PaystackRefundError(
        unsettledRefund.status === 'needs-attention'
          ? 'This payment has a refund that needs review in Paystack before another refund can be requested.'
          : 'Wait for the current Paystack refund to finish before requesting another one.',
        409,
      );
    }

    const [activeRefunds] = await transaction
      .select({ total: sql<number>`coalesce(sum(${paymentRefunds.amountCents}), 0)::integer` })
      .from(paymentRefunds)
      .where(and(eq(paymentRefunds.paymentId, payment.id), ne(paymentRefunds.status, 'failed')));
    const refundableAmountCents = payment.amountCents - (activeRefunds?.total ?? 0);
    if (input.amountCents > refundableAmountCents) {
      throw new PaystackRefundError(
        `Only ${(refundableAmountCents / 100).toLocaleString('en-ZA', { style: 'currency', currency: payment.currency })} remains refundable.`,
        409,
      );
    }

    const [refund] = await transaction
      .insert(paymentRefunds)
      .values({
        paymentId: payment.id,
        provider: 'paystack',
        status: 'pending',
        amountCents: input.amountCents,
        currency: payment.currency,
        customerNote: input.customerNote || null,
        merchantNote: input.merchantNote || null,
        requestedByUserId: administratorUserId,
      })
      .returning({ id: paymentRefunds.id });
    if (!refund) throw new Error('The refund reservation could not be created.');

    return {
      refundId: refund.id,
      payment,
      transactionReference: payment.providerTransactionId || payment.providerReference,
      refundableAmountCents,
    };
  });

  let response: PaystackRefundResponse;
  try {
    response = await $fetch<PaystackRefundResponse>('https://api.paystack.co/refund', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secretKey}` },
      body: {
        transaction: reservation.transactionReference,
        amount: input.amountCents,
        currency: reservation.payment.currency,
        ...(input.customerNote && { customer_note: input.customerNote }),
        ...(input.merchantNote && { merchant_note: input.merchantNote }),
      },
    });
  } catch {
    // A timeout can happen after Paystack accepted the request. Keep the amount
    // reserved until a webhook confirms whether it processed or failed.
    await updateRequestedRefundStatus(reservation.refundId, 'needs-attention', 'refund_request_uncertain');
    throw new PaystackRefundError(
      'Paystack did not confirm the request. The amount remains reserved to prevent a duplicate refund; check Paystack before retrying.',
      502,
    );
  }

  if (!response.status || !response.data) {
    await updateRequestedRefundStatus(reservation.refundId, 'failed', 'refund_request_rejected');
    throw new PaystackRefundError(response.message || 'Paystack rejected the refund request.', 502);
  }

  const providerStatus = stringValue(response.data.status);
  const responseAmount = integerValue(response.data.amount);
  const responseCurrency = stringValue(response.data.currency);
  const responseEnvironment = stringValue(response.data.domain);
  const validStatuses: PaymentRefundStatus[] = ['pending', 'processing', 'processed', 'failed', 'needs-attention'];
  if (
    !providerStatus
    || !validStatuses.includes(providerStatus as PaymentRefundStatus)
    || responseAmount !== input.amountCents
    || responseCurrency !== reservation.payment.currency
    || !isPaystackEnvironmentMatch(responseEnvironment, reservation.payment.environment)
  ) {
    await updateRequestedRefundStatus(reservation.refundId, 'needs-attention', 'refund_response_invalid');
    throw new PaystackRefundError(
      'Paystack returned an unexpected refund response. The amount remains reserved for review.',
      502,
    );
  }

  const incomingStatus = providerStatus as PaymentRefundStatus;
  const result = await database.transaction(async (transaction) => {
    const [payment] = await transaction
      .select({
        id: payments.id,
        orderId: payments.orderId,
        status: payments.status,
        amountCents: payments.amountCents,
        currency: payments.currency,
        environment: payments.environment,
      })
      .from(payments)
      .where(eq(payments.id, reservation.payment.id))
      .limit(1)
      .for('update');
    const [currentRefund] = await transaction
      .select({
        id: paymentRefunds.id,
        status: paymentRefunds.status,
        providerRefundId: paymentRefunds.providerRefundId,
        providerRefundReference: paymentRefunds.providerRefundReference,
        customerNote: paymentRefunds.customerNote,
        merchantNote: paymentRefunds.merchantNote,
        expectedAt: paymentRefunds.expectedAt,
        refundedAt: paymentRefunds.refundedAt,
      })
      .from(paymentRefunds)
      .where(eq(paymentRefunds.id, reservation.refundId))
      .limit(1);
    if (!payment || !currentRefund) throw new Error('The refund reservation could not be reconciled.');

    const effectiveStatus = ['processed', 'failed'].includes(currentRefund.status)
      || refundStatusProgress[currentRefund.status] > refundStatusProgress[incomingStatus]
      ? currentRefund.status
      : incomingStatus;
    const providerRefundId = identifierValue(response.data?.id) ?? currentRefund.providerRefundId;
    const providerRefundReference = identifierValue(response.data?.refund_reference) ?? currentRefund.providerRefundReference;
    if ((currentRefund.providerRefundId && providerRefundId !== currentRefund.providerRefundId)
      || (currentRefund.providerRefundReference && providerRefundReference !== currentRefund.providerRefundReference)) {
      throw new PaystackRefundError('Paystack refund identifiers conflicted. Review the reserved refund before retrying.', 502);
    }
    const now = new Date();
    await transaction
      .update(paymentRefunds)
      .set({
        providerRefundId,
        providerRefundReference,
        status: effectiveStatus,
        customerNote: stringValue(response.data?.customer_note) ?? currentRefund.customerNote,
        merchantNote: stringValue(response.data?.merchant_note) ?? currentRefund.merchantNote,
        expectedAt: dateValue(response.data?.expected_at) ?? currentRefund.expectedAt,
        refundedAt: effectiveStatus === 'processed'
          ? dateValue(response.data?.refunded_at) ?? currentRefund.refundedAt ?? now
          : null,
        updatedAt: now,
      })
      .where(eq(paymentRefunds.id, reservation.refundId));

    await synchronizePaymentRefundState(transaction, payment, effectiveStatus);
    return {
      id: reservation.refundId,
      status: effectiveStatus,
      amountCents: input.amountCents,
      currency: reservation.payment.currency,
      remainingRefundableAmountCents: reservation.refundableAmountCents - input.amountCents,
    };
  });

  return result;
}

export async function processPaystackEvent(payload: PaystackEvent, providerEventKey: string): Promise<void> {
  getPaystackCredentials();
  await assertPaystackDatabaseEnvironment();
  const eventType = stringValue(payload.event) || 'unknown';
  const isRefundEvent = eventType in refundEventStatuses;
  const reference = isRefundEvent
    ? stringValue(payload.data?.transaction_reference)
    : stringValue(payload.data?.reference);
  const database = getDatabase();

  await database.transaction(async (transaction) => {
    const [payment] = reference
      ? await transaction
          .select({
            id: payments.id,
            orderId: payments.orderId,
            status: payments.status,
            amountCents: payments.amountCents,
            currency: payments.currency,
            environment: payments.environment,
          })
          .from(payments)
          .where(and(eq(payments.provider, 'paystack'), eq(payments.providerReference, reference)))
          .limit(1)
          .for('update')
      : [];

    const [event] = await transaction
      .insert(paymentEvents)
      .values({
        paymentId: payment?.id ?? null,
        provider: 'paystack',
        providerEventKey,
        eventType,
        payload,
      })
      .onConflictDoNothing()
      .returning({ id: paymentEvents.id });

    if (!event) return;

    if (eventType === 'charge.success') {
      await processChargeSuccess(transaction, event.id, payload, payment);
      return;
    }

    if (isRefundEvent) {
      await processRefundEvent(transaction, event.id, eventType, payload, payment);
      return;
    }

    await markPaymentEvent(transaction, event.id, 'ignored');
  });
}

export async function getPaystackCheckoutStatus(reference: string): Promise<CheckoutStatusResponse | null> {
  await assertPaystackDatabaseEnvironment();
  const [result] = await getDatabase()
    .select({ status: payments.status, orderNumber: orders.orderNumber })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .where(and(eq(payments.provider, 'paystack'), eq(payments.providerReference, reference)))
    .limit(1);
  return result ?? null;
}

/** Server-side fallback when the browser returns before a webhook is delivered. */
export async function verifyPaystackCheckout(reference: string): Promise<void> {
  await assertPaystackDatabaseEnvironment();
  const database = getDatabase();
  const [payment] = await database
    .select({
      id: payments.id,
      status: payments.status,
      amountCents: payments.amountCents,
      currency: payments.currency,
      environment: payments.environment,
    })
    .from(payments)
    .where(and(eq(payments.provider, 'paystack'), eq(payments.providerReference, reference)))
    .limit(1);
  if (!payment || payment.status !== 'pending') return;

  const { secretKey, environment } = getPaystackCredentials();
  if (payment.environment !== environment) {
    throw createError({ statusCode: 503, statusMessage: 'Payment does not belong to this environment.' });
  }
  const rawResponse = await $fetch<unknown>(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    { timeout: 10_000, retry: 0, headers: { Authorization: `Bearer ${secretKey}` } },
  );
  const parsed = paystackVerificationResponseSchema.safeParse(rawResponse);
  if (
    !parsed.success
    || parsed.data.data.reference !== reference
    || parsed.data.data.amount !== payment.amountCents
    || parsed.data.data.currency !== payment.currency
    || !isPaystackEnvironmentMatch(parsed.data.data.domain, payment.environment)
  ) {
    throw createError({ statusCode: 502, statusMessage: 'Payment verification returned invalid or mismatched evidence.' });
  }
  const response = parsed.data;
  const providerStatus = response.data.status;

  if (providerStatus === 'success') {
    const transactionId = identifierValue(response.data.id) || reference;
    await processPaystackEvent(
      { event: 'charge.success', data: response.data },
      `verify:charge.success:${transactionId}:${reference}`,
    );
    return;
  }

  const terminal = getTerminalCheckoutResolution(providerStatus);
  await database.transaction(async (transaction) => {
    const now = new Date();
    // The provider request ran outside the transaction. A webhook may have
    // settled this payment meanwhile; PostgreSQL rechecks this predicate after
    // waiting for a concurrent row lock. Only the winning update owns the
    // corresponding order/access transition, within the same transaction.
    const [updatedPayment] = await transaction
      .update(payments)
      .set({
        ...(terminal && { status: terminal.paymentStatus }),
        ...(terminal?.fullyRefunded && { refundedAmountCents: payment.amountCents }),
        providerStatus: providerStatus || 'verification_pending',
        failureMessage: terminal ? response.message : null,
        updatedAt: now,
      })
      .where(and(eq(payments.id, payment.id), eq(payments.status, 'pending')))
      .returning({ orderId: payments.orderId });

    if (!updatedPayment) return;

    if (terminal) {
      await transaction
        .update(orders)
        .set({ status: terminal.orderStatus, updatedAt: now })
        .where(terminal.orderStatus === 'cancelled'
          ? and(eq(orders.id, updatedPayment.orderId), eq(orders.status, 'pending'))
          : eq(orders.id, updatedPayment.orderId));
      if (terminal.revokeAccess) await revokeOrderAccess(transaction, updatedPayment.orderId);
    }
  });
}
