import type { CheckoutRequest, CheckoutResponse, CheckoutStatusResponse } from '@tilana/contracts/checkout';
import type { AdminPaymentRefundRequest } from '@tilana/contracts/payments';
import { programmeCatalogByKey } from '@tilana/contracts/programs';
import type { Database } from '@tilana/db/server';
import {
  clients,
  orderItems,
  orders,
  paymentEvents,
  paymentRefunds,
  payments,
  programAccess,
  programs,
  programVolumes,
  type PaymentRefundStatus,
} from '@tilana/db/schema';
import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { getDatabase } from '../utils/database';

type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

interface PaystackInitializeResponse {
  status: boolean;
  message: string;
  data?: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

interface PaystackVerifyResponse {
  status: boolean;
  message: string;
  data?: PaystackEvent['data'];
}

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

async function getOrCreateClient(transaction: DatabaseTransaction, input: CheckoutRequest) {
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

async function getPurchasableVolume(transaction: DatabaseTransaction, programmeKey: CheckoutRequest['programmeKey']) {
  const definition = programmeCatalogByKey[programmeKey];
  let [programme] = await transaction
    .select({ id: programs.id, status: programs.status })
    .from(programs)
    .where(eq(programs.slug, definition.slug))
    .limit(1);

  if (!programme) {
    [programme] = await transaction
      .insert(programs)
      .values({ slug: definition.slug, name: definition.name, status: 'published' })
      .onConflictDoNothing()
      .returning({ id: programs.id, status: programs.status });
  }

  if (!programme) {
    [programme] = await transaction
      .select({ id: programs.id, status: programs.status })
      .from(programs)
      .where(eq(programs.slug, definition.slug))
      .limit(1);
  }

  if (!programme || programme.status !== 'published') {
    throw createError({ statusCode: 409, statusMessage: 'This program is not available for purchase yet.' });
  }

  let [volume] = await transaction
    .select({
      id: programVolumes.id,
      name: programVolumes.name,
      priceCents: programVolumes.currentPriceCents,
      currency: programVolumes.currency,
      isPublished: programVolumes.isPublished,
    })
    .from(programVolumes)
    .where(and(
      eq(programVolumes.programId, programme.id),
      eq(programVolumes.volumeNumber, definition.volumeNumber),
    ))
    .limit(1);

  if (!volume) {
    [volume] = await transaction
      .insert(programVolumes)
      .values({
        programId: programme.id,
        volumeNumber: definition.volumeNumber,
        name: definition.volumeName,
        currentPriceCents: definition.suggestedPriceCents,
        currency: 'ZAR',
        isPublished: true,
      })
      .onConflictDoNothing()
      .returning({
        id: programVolumes.id,
        name: programVolumes.name,
        priceCents: programVolumes.currentPriceCents,
        currency: programVolumes.currency,
        isPublished: programVolumes.isPublished,
      });
  }

  if (!volume) {
    [volume] = await transaction
      .select({
        id: programVolumes.id,
        name: programVolumes.name,
        priceCents: programVolumes.currentPriceCents,
        currency: programVolumes.currency,
        isPublished: programVolumes.isPublished,
      })
      .from(programVolumes)
      .where(and(
        eq(programVolumes.programId, programme.id),
        eq(programVolumes.volumeNumber, definition.volumeNumber),
      ))
      .limit(1);
  }

  if (!volume || !volume.isPublished || volume.priceCents <= 0) {
    throw createError({ statusCode: 409, statusMessage: 'This program is not available for purchase yet.' });
  }

  return volume;
}

export async function initializePaystackCheckout(input: CheckoutRequest): Promise<CheckoutResponse> {
  const config = useRuntimeConfig();
  const secretKey = String(config.paystackSecretKey || '').trim();
  const callbackUrl = String(config.paystackCallbackUrl || '').trim();
  const environment = String(config.paystackEnvironment || 'test');

  if (!secretKey || !callbackUrl || !['test', 'live'].includes(environment)) {
    throw createError({ statusCode: 503, statusMessage: 'Online checkout is not configured.' });
  }

  const database = getDatabase();
  const checkout = await database.transaction(async (transaction) => {
    const customer = await getOrCreateClient(transaction, input);
    const volume = await getPurchasableVolume(transaction, input.programmeKey);
    if (volume.priceCents !== input.expectedPriceCents) {
      throw createError({ statusCode: 409, statusMessage: 'The program price has changed. Please refresh before paying.' });
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
        currency: volume.currency,
        subtotalCents: volume.priceCents,
        totalCents: volume.priceCents,
      })
      .returning({ id: orders.id });

    if (!order) throw new Error('The order could not be created.');

    await transaction.insert(orderItems).values({
      orderId: order.id,
      clientId: customer.id,
      programVolumeId: volume.id,
      description: volume.name,
      quantity: 1,
      unitPriceCents: volume.priceCents,
      lineTotalCents: volume.priceCents,
    });

    const [payment] = await transaction
      .insert(payments)
      .values({
        orderId: order.id,
        provider: 'paystack',
        providerReference: reference,
        environment: environment as 'test' | 'live',
        amountCents: volume.priceCents,
        currency: volume.currency,
      })
      .returning({ id: payments.id });

    if (!payment) throw new Error('The payment attempt could not be created.');
    return { orderId: order.id, paymentId: payment.id, reference, email: customer.email, volume };
  });

  try {
    const response = await $fetch<PaystackInitializeResponse>('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secretKey}` },
      body: {
        email: checkout.email,
        amount: String(checkout.volume.priceCents),
        currency: checkout.volume.currency,
        reference: checkout.reference,
        callback_url: callbackUrl,
        metadata: {
          order_id: checkout.orderId,
          payment_id: checkout.paymentId,
          program_volume_id: checkout.volume.id,
        },
      },
    });

    if (!response.status || !response.data || response.data.reference !== checkout.reference) {
      throw new Error(response.message || 'Paystack did not initialize checkout.');
    }

    await database
      .update(payments)
      .set({
        accessCode: response.data.access_code,
        checkoutUrl: response.data.authorization_url,
        providerStatus: 'initialized',
        updatedAt: new Date(),
      })
      .where(eq(payments.id, checkout.paymentId));

    return { authorizationUrl: response.data.authorization_url, reference: checkout.reference };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Paystack initialization failed.';
    await database
      .update(payments)
      .set({ status: 'failed', providerStatus: 'initialization_failed', failureMessage: message, updatedAt: new Date() })
      .where(eq(payments.id, checkout.paymentId));
    throw createError({ statusCode: 502, statusMessage: 'Payment could not be started. Please try again.' });
  }
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
    .select({ id: programAccess.id })
    .from(programAccess)
    .where(and(
      eq(programAccess.clientId, item.clientId),
      eq(programAccess.programVolumeId, item.programVolumeId),
      eq(programAccess.status, 'active'),
    ))
    .limit(1);
  if (activeAccess) return;

  const [existingAccess] = await transaction
    .select({ id: programAccess.id })
    .from(programAccess)
    .where(eq(programAccess.orderItemId, item.id))
    .limit(1);

  if (existingAccess) {
    await transaction
      .update(programAccess)
      .set({ status: 'active', revokedAt: null, updatedAt: new Date() })
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
    || (environment !== null && environment !== payment.environment)
  ) {
    await markPaymentEvent(
      transaction,
      eventId,
      'failed',
      'Payment reference, environment, status, amount, or currency did not match the pending payment.',
    );
    return;
  }

  if (payment.status === 'refunded' || payment.status === 'reversed') {
    await markPaymentEvent(transaction, eventId, 'ignored', 'The payment was already fully refunded or reversed.');
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
    || (environment !== null && environment !== payment.environment)
    || !['succeeded', 'partially_refunded', 'refunded', 'reversed'].includes(payment.status)
  ) {
    await markPaymentEvent(
      transaction,
      eventId,
      'failed',
      'Refund reference, environment, payment state, amount, or currency was invalid.',
    );
    return;
  }

  const providerRefundId = identifierValue(payload.data?.refund_reference)
    ?? identifierValue(payload.data?.id);
  let [existingRefund] = providerRefundId
    ? await transaction
        .select({
          id: paymentRefunds.id,
          status: paymentRefunds.status,
          providerRefundId: paymentRefunds.providerRefundId,
          customerNote: paymentRefunds.customerNote,
          merchantNote: paymentRefunds.merchantNote,
          expectedAt: paymentRefunds.expectedAt,
          refundedAt: paymentRefunds.refundedAt,
        })
        .from(paymentRefunds)
        .where(and(
          eq(paymentRefunds.provider, 'paystack'),
          eq(paymentRefunds.providerRefundId, providerRefundId),
        ))
        .limit(1)
    : [];

  if (!existingRefund) {
    const candidates = await transaction
      .select({
        id: paymentRefunds.id,
        status: paymentRefunds.status,
        providerRefundId: paymentRefunds.providerRefundId,
        customerNote: paymentRefunds.customerNote,
        merchantNote: paymentRefunds.merchantNote,
        expectedAt: paymentRefunds.expectedAt,
        refundedAt: paymentRefunds.refundedAt,
      })
      .from(paymentRefunds)
      .where(and(
        eq(paymentRefunds.paymentId, payment.id),
        eq(paymentRefunds.amountCents, amount),
        eq(paymentRefunds.currency, currency),
        isNull(paymentRefunds.providerRefundId),
        ne(paymentRefunds.status, 'failed'),
      ))
      .orderBy(desc(paymentRefunds.createdAt))
      .limit(2);
    if (candidates.length === 1) [existingRefund] = candidates;
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
  const config = useRuntimeConfig();
  const secretKey = String(config.paystackSecretKey || '').trim();
  const environment = String(config.paystackEnvironment || 'test');
  if (!secretKey || !['test', 'live'].includes(environment)) {
    throw new PaystackRefundError('Paystack refunds are not configured for this environment.', 503);
  }

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
    || (responseEnvironment !== null && responseEnvironment !== reservation.payment.environment)
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
    const providerRefundId = identifierValue(response.data?.refund_reference)
      ?? identifierValue(response.data?.id)
      ?? currentRefund.providerRefundId;
    const now = new Date();
    await transaction
      .update(paymentRefunds)
      .set({
        providerRefundId,
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
  const database = getDatabase();
  const [payment] = await database
    .select({ id: payments.id, orderId: payments.orderId, status: payments.status, amountCents: payments.amountCents })
    .from(payments)
    .where(and(eq(payments.provider, 'paystack'), eq(payments.providerReference, reference)))
    .limit(1);
  if (!payment || payment.status !== 'pending') return;

  const secretKey = String(useRuntimeConfig().paystackSecretKey || '').trim();
  if (!secretKey) return;

  const response = await $fetch<PaystackVerifyResponse>(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${secretKey}` } },
  );
  const providerStatus = stringValue(response.data?.status);

  if (response.status && response.data && providerStatus === 'success') {
    const transactionId = identifierValue(response.data.id) || reference;
    await processPaystackEvent(
      { event: 'charge.success', data: response.data },
      `verify:charge.success:${transactionId}:${reference}`,
    );
    return;
  }

  const terminalStatus = providerStatus === 'failed'
    ? 'failed'
    : providerStatus === 'abandoned'
      ? 'abandoned'
      : providerStatus === 'reversed'
        ? 'reversed'
        : null;
  await database.transaction(async (transaction) => {
    const now = new Date();
    await transaction
      .update(payments)
      .set({
        ...(terminalStatus && { status: terminalStatus }),
        ...(terminalStatus === 'reversed' && { refundedAmountCents: payment.amountCents }),
        providerStatus: providerStatus || 'verification_pending',
        failureMessage: terminalStatus ? response.message : null,
        updatedAt: now,
      })
      .where(eq(payments.id, payment.id));

    if (terminalStatus === 'reversed') {
      await transaction
        .update(orders)
        .set({ status: 'refunded', updatedAt: now })
        .where(eq(orders.id, payment.orderId));
      await revokeOrderAccess(transaction, payment.orderId);
    }
  });
}
