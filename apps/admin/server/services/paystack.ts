import type { CheckoutRequest, CheckoutResponse, CheckoutStatusResponse } from '@tilana/contracts/checkout';
import { programmeCatalogByKey } from '@tilana/contracts/programs';
import type { Database } from '@tilana/db/server';
import {
  clients,
  orderItems,
  orders,
  paymentEvents,
  payments,
  programAccess,
  programs,
  programVolumes,
} from '@tilana/db/schema';
import { and, eq, sql } from 'drizzle-orm';
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

function identifierValue(value: unknown): string | null {
  if (typeof value === 'string' && value) return value;
  return typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : null;
}

export async function processPaystackEvent(payload: PaystackEvent, providerEventKey: string): Promise<void> {
  const eventType = stringValue(payload.event) || 'unknown';
  const reference = stringValue(payload.data?.reference);
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
          })
          .from(payments)
          .where(and(eq(payments.provider, 'paystack'), eq(payments.providerReference, reference)))
          .limit(1)
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

    if (eventType !== 'charge.success') {
      await transaction
        .update(paymentEvents)
        .set({ processingStatus: 'ignored', processedAt: new Date() })
        .where(eq(paymentEvents.id, event.id));
      return;
    }

    const amount = numberValue(payload.data?.amount);
    const currency = stringValue(payload.data?.currency);
    const providerStatus = stringValue(payload.data?.status);
    if (!payment || providerStatus !== 'success' || amount !== payment.amountCents || currency !== payment.currency) {
      await transaction
        .update(paymentEvents)
        .set({
          processingStatus: 'failed',
          errorMessage: 'Payment reference, status, amount, or currency did not match the pending payment.',
          processedAt: new Date(),
        })
        .where(eq(paymentEvents.id, event.id));
      return;
    }

    const now = new Date();
    const paidAtValue = stringValue(payload.data?.paid_at);
    const paidAt = paidAtValue && !Number.isNaN(Date.parse(paidAtValue)) ? new Date(paidAtValue) : now;
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

    const purchasedItems = await transaction
      .select({ id: orderItems.id, programVolumeId: orderItems.programVolumeId, clientId: orders.clientId })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(eq(orderItems.orderId, payment.orderId));

    for (const item of purchasedItems) {
      if (!item.programVolumeId) continue;
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

    await transaction
      .update(paymentEvents)
      .set({ processingStatus: 'processed', processedAt: now })
      .where(eq(paymentEvents.id, event.id));
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
    .select({ id: payments.id, status: payments.status })
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
  await database
    .update(payments)
    .set({
      ...(terminalStatus && { status: terminalStatus }),
      providerStatus: providerStatus || 'verification_pending',
      failureMessage: terminalStatus ? response.message : null,
      updatedAt: new Date(),
    })
    .where(eq(payments.id, payment.id));
}
