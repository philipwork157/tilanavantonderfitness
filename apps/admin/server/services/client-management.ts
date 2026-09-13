import type { AdminClientCreateRequest, AdminClientUpdateRequest } from '@tilana/contracts/clients';
import type { Database } from '@tilana/db/server';
import {
  clients,
  orderItems,
  orders,
  paymentRefunds,
  payments,
  programAccess,
  programs,
  programVolumes,
} from '@tilana/db/schema';
import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { getDatabase } from '../utils/database';

export class ClientEmailExistsError extends Error {
  constructor() {
    super('A client with this email address already exists.');
  }
}

export class ClientNotEditableError extends Error {
  constructor() {
    super('Automated purchases cannot be rewritten from the manual client editor.');
  }
}

export class ProgramVolumeUnavailableError extends Error {
  constructor() {
    super('The selected programme volume is unavailable.');
  }
}

type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

function createManualOrderNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return `MAN-${date}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

async function getManualProgrammeVolume(
  transaction: DatabaseTransaction,
  programVolumeId: number,
) {
  const [volume] = await transaction
    .select({
      id: programVolumes.id,
      name: programVolumes.name,
      currency: programVolumes.currency,
      programStatus: programs.status,
    })
    .from(programVolumes)
    .innerJoin(programs, eq(programs.id, programVolumes.programId))
    .where(eq(programVolumes.id, programVolumeId))
    .limit(1);

  if (!volume || volume.programStatus === 'archived' || volume.currency !== 'ZAR') {
    throw new ProgramVolumeUnavailableError();
  }
  return volume;
}

async function insertManualOrderItems(
  transaction: DatabaseTransaction,
  input: AdminClientCreateRequest,
  clientId: number,
  orderId: number,
  administratorUserId: number,
) {
  for (const assignment of input.programmes) {
    const volume = await getManualProgrammeVolume(
      transaction,
      assignment.programVolumeId,
    );
    const [item] = await transaction
      .insert(orderItems)
      .values({
        orderId,
        clientId,
        programVolumeId: volume.id,
        description: volume.name,
        quantity: 1,
        unitPriceCents: assignment.priceCents,
        lineTotalCents: assignment.priceCents,
      })
      .returning({ id: orderItems.id });

    if (!item) throw new Error(`Order item ${volume.name} was not created.`);

    await transaction.insert(programAccess).values({
      clientId,
      programVolumeId: volume.id,
      orderItemId: item.id,
      source: 'manual',
      status: 'active',
      grantedByUserId: administratorUserId,
    });
  }
}

export async function listManualProgramVolumeOptions() {
  return getDatabase()
    .select({
      id: programVolumes.id,
      programId: programs.id,
      programName: programs.name,
      programSlug: programs.slug,
      programStatus: programs.status,
      volumeNumber: programVolumes.volumeNumber,
      name: programVolumes.name,
      slug: programVolumes.slug,
      currentPriceCents: programVolumes.currentPriceCents,
      currency: programVolumes.currency,
      isPublished: programVolumes.isPublished,
    })
    .from(programVolumes)
    .innerJoin(programs, eq(programs.id, programVolumes.programId))
    .where(ne(programs.status, 'archived'))
    .orderBy(asc(programs.sortOrder), asc(programs.name), asc(programVolumes.sortOrder), asc(programVolumes.volumeNumber));
}

async function insertManualPayment(
  transaction: DatabaseTransaction,
  orderId: number,
  totalCents: number,
  paidAt: Date,
) {
  if (totalCents <= 0) return;
  await transaction.insert(payments).values({
    orderId,
    status: 'succeeded',
    provider: 'manual',
    amountCents: totalCents,
    currency: 'ZAR',
    paidAt,
  });
}

export async function createManualClient(
  input: AdminClientCreateRequest,
  administratorUserId: number,
) {
  const database = getDatabase();
  const email = input.email.trim().toLowerCase();

  return database.transaction(async (transaction) => {
    const [existingClient] = await transaction
      .select({ id: clients.id })
      .from(clients)
      .where(sql`lower(${clients.email}) = ${email}`)
      .limit(1);

    if (existingClient) throw new ClientEmailExistsError();

    const [client] = await transaction
      .insert(clients)
      .values({
        firstName: input.firstName,
        lastName: input.lastName,
        email,
        phone: input.phone || null,
        gender: input.gender,
        notes: input.notes || null,
        createdByUserId: administratorUserId,
      })
      .returning({ id: clients.id });

    if (!client) throw new Error('The client record was not created.');

    const totalCents = input.programmes.reduce((total, item) => total + item.priceCents, 0);
    const isPaid = input.purchaseStatus === 'paid';
    const now = new Date();
    const [order] = await transaction
      .insert(orders)
      .values({
        orderNumber: createManualOrderNumber(),
        clientId: client.id,
        status: input.purchaseStatus,
        currency: 'ZAR',
        subtotalCents: totalCents,
        totalCents,
        notes: 'Created manually in the admin portal.',
        createdByUserId: administratorUserId,
        paidAt: isPaid ? now : null,
      })
      .returning({ id: orders.id, orderNumber: orders.orderNumber });

    if (!order) throw new Error('The client order was not created.');

    await insertManualOrderItems(transaction, input, client.id, order.id, administratorUserId);

    if (isPaid && totalCents > 0) {
      await insertManualPayment(transaction, order.id, totalCents, now);
    }

    return { id: client.id, orderNumber: order.orderNumber };
  });
}

export async function updateManualClient(
  clientId: number,
  input: AdminClientUpdateRequest,
  administratorUserId: number,
) {
  const database = getDatabase();
  const email = input.email.trim().toLowerCase();

  return database.transaction(async (transaction) => {
    const [client] = await transaction
      .select({ id: clients.id })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);
    if (!client) return null;

    const [duplicateEmail] = await transaction
      .select({ id: clients.id })
      .from(clients)
      .where(and(sql`lower(${clients.email}) = ${email}`, ne(clients.id, clientId)))
      .limit(1);
    if (duplicateEmail) throw new ClientEmailExistsError();

    const existingOrders = await transaction
      .select({ id: orders.id, orderNumber: orders.orderNumber })
      .from(orders)
      .where(eq(orders.clientId, clientId));

    if (existingOrders.length > 1 || existingOrders.some((order) => !order.orderNumber.startsWith('MAN-'))) {
      throw new ClientNotEditableError();
    }

    await transaction
      .update(clients)
      .set({
        firstName: input.firstName,
        lastName: input.lastName,
        email,
        phone: input.phone || null,
        gender: input.gender,
        notes: input.notes || null,
        updatedAt: new Date(),
      })
      .where(eq(clients.id, clientId));

    const totalCents = input.programmes.reduce((total, item) => total + item.priceCents, 0);
    const isPaid = input.purchaseStatus === 'paid';
    const now = new Date();
    let order = existingOrders[0];

    if (!order) {
      [order] = await transaction
        .insert(orders)
        .values({
          orderNumber: createManualOrderNumber(),
          clientId,
          status: input.purchaseStatus,
          currency: 'ZAR',
          subtotalCents: totalCents,
          totalCents,
          notes: 'Created manually in the admin portal.',
          createdByUserId: administratorUserId,
          paidAt: isPaid ? now : null,
        })
        .returning({ id: orders.id, orderNumber: orders.orderNumber });
    } else {
      const existingItems = await transaction
        .select({ id: orderItems.id })
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id));
      const itemIds = existingItems.map((item) => item.id);
      if (itemIds.length) {
        await transaction.delete(programAccess).where(inArray(programAccess.orderItemId, itemIds));
      }
      await transaction.delete(payments).where(eq(payments.orderId, order.id));
      await transaction.delete(orderItems).where(eq(orderItems.orderId, order.id));
      await transaction
        .update(orders)
        .set({
          status: input.purchaseStatus,
          subtotalCents: totalCents,
          totalCents,
          paidAt: isPaid ? now : null,
          updatedAt: now,
        })
        .where(eq(orders.id, order.id));
    }

    if (!order) throw new Error('The client order was not available.');
    await insertManualOrderItems(transaction, input, clientId, order.id, administratorUserId);
    if (isPaid) await insertManualPayment(transaction, order.id, totalCents, now);

    return { id: clientId, orderNumber: order.orderNumber };
  });
}

export async function listClientsWithProgrammes(paystackEnvironment: 'test' | 'live') {
  const database = getDatabase();
  const rows = await database
    .select({
      id: clients.id,
      firstName: clients.firstName,
      lastName: clients.lastName,
      email: clients.email,
      phone: clients.phone,
      gender: clients.gender,
      notes: clients.notes,
      createdAt: clients.createdAt,
      orderId: orders.id,
      orderStatus: orders.status,
      orderNumber: orders.orderNumber,
      programmeName: orderItems.description,
      priceCents: orderItems.lineTotalCents,
      programVolumeId: programVolumes.id,
    })
    .from(clients)
    .leftJoin(orders, eq(orders.clientId, clients.id))
    .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
    .leftJoin(programVolumes, eq(programVolumes.id, orderItems.programVolumeId))
    .leftJoin(programs, eq(programs.id, programVolumes.programId))
    .orderBy(desc(clients.createdAt), asc(orderItems.createdAt));

  const paymentRows = await database
    .select({
      id: payments.id,
      orderId: payments.orderId,
      status: payments.status,
      environment: payments.environment,
      amountCents: payments.amountCents,
      refundedAmountCents: payments.refundedAmountCents,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .where(and(
      eq(payments.provider, 'paystack'),
      eq(payments.environment, paystackEnvironment),
      inArray(payments.status, ['succeeded', 'partially_refunded', 'refunded', 'reversed']),
    ))
    .orderBy(desc(payments.createdAt));
  const paymentIds = paymentRows.map((payment) => payment.id);
  const refundRows = paymentIds.length
    ? await database
        .select({
          paymentId: paymentRefunds.paymentId,
          status: paymentRefunds.status,
          amountCents: paymentRefunds.amountCents,
          updatedAt: paymentRefunds.updatedAt,
        })
        .from(paymentRefunds)
        .where(inArray(paymentRefunds.paymentId, paymentIds))
        .orderBy(desc(paymentRefunds.updatedAt))
    : [];

  const refundsByPayment = new Map<number, {
    activeAmountCents: number;
    pendingAmountCents: number;
    latestStatus: typeof paymentRefunds.$inferSelect.status | null;
  }>();
  for (const refund of refundRows) {
    const summary = refundsByPayment.get(refund.paymentId) ?? {
      activeAmountCents: 0,
      pendingAmountCents: 0,
      latestStatus: null,
    };
    summary.latestStatus ??= refund.status;
    if (refund.status !== 'failed') summary.activeAmountCents += refund.amountCents;
    if (['pending', 'processing', 'needs-attention'].includes(refund.status)) {
      summary.pendingAmountCents += refund.amountCents;
    }
    refundsByPayment.set(refund.paymentId, summary);
  }

  type PaystackPaymentSummary = {
    id: number;
    status: typeof payments.$inferSelect.status;
    environment: typeof payments.$inferSelect.environment;
    amountCents: number;
    refundedAmountCents: number;
    pendingRefundAmountCents: number;
    refundableAmountCents: number;
    latestRefundStatus: typeof paymentRefunds.$inferSelect.status | null;
  };
  const paymentByOrder = new Map<number, PaystackPaymentSummary>();
  for (const payment of paymentRows) {
    if (paymentByOrder.has(payment.orderId)) continue;
    const refunds = refundsByPayment.get(payment.id);
    const isTerminal = payment.status === 'refunded' || payment.status === 'reversed';
    paymentByOrder.set(payment.orderId, {
      id: payment.id,
      status: payment.status,
      environment: payment.environment,
      amountCents: payment.amountCents,
      refundedAmountCents: payment.refundedAmountCents,
      pendingRefundAmountCents: refunds?.pendingAmountCents ?? 0,
      refundableAmountCents: isTerminal
        ? 0
        : Math.max(0, payment.amountCents - (refunds?.activeAmountCents ?? 0)),
      latestRefundStatus: refunds?.latestStatus ?? null,
    });
  }

  const clientMap = new Map<number, {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    gender: typeof clients.$inferSelect.gender;
    notes: string | null;
    createdAt: Date;
    programmes: Array<{
      orderId: number;
      orderNumber: string;
      name: string;
      priceCents: number;
      status: string;
      programVolumeId: number | null;
      payment: PaystackPaymentSummary | null;
    }>;
  }>();

  for (const row of rows) {
    let client = clientMap.get(row.id);
    if (!client) {
      client = {
        id: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        phone: row.phone,
        gender: row.gender,
        notes: row.notes,
        createdAt: row.createdAt,
        programmes: [],
      };
      clientMap.set(row.id, client);
    }

    if (row.orderId && row.orderNumber && row.orderStatus && row.programmeName && row.priceCents !== null) {
      client.programmes.push({
        orderId: row.orderId,
        orderNumber: row.orderNumber,
        name: row.programmeName,
        priceCents: row.priceCents,
        status: row.orderStatus,
        programVolumeId: row.programVolumeId,
        payment: paymentByOrder.get(row.orderId) ?? null,
      });
    }
  }

  return [...clientMap.values()];
}
