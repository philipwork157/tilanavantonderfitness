import type { AdminClientCreateRequest, AdminClientUpdateRequest } from '@tilana/contracts/clients';
import {
  programmeCatalog,
  programmeCatalogByKey,
  type ProgrammeKey,
} from '@tilana/contracts/programs';
import type { Database } from '@tilana/db/server';
import {
  clients,
  orderItems,
  orders,
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

type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

function createManualOrderNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return `MAN-${date}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

async function ensureProgrammeVolume(
  transaction: DatabaseTransaction,
  programmeKey: ProgrammeKey,
) {
  const definition = programmeCatalogByKey[programmeKey];
  let [programme] = await transaction
    .insert(programs)
    .values({
      slug: definition.slug,
      name: definition.name,
      status: 'published',
    })
    .onConflictDoNothing({ target: programs.slug })
    .returning({ id: programs.id });

  if (!programme) {
    [programme] = await transaction
      .select({ id: programs.id })
      .from(programs)
      .where(eq(programs.slug, definition.slug))
      .limit(1);
  }

  if (!programme) throw new Error(`Programme ${definition.name} is unavailable.`);

  let [volume] = await transaction
    .insert(programVolumes)
    .values({
      programId: programme.id,
      volumeNumber: definition.volumeNumber,
      name: definition.volumeName,
      currentPriceCents: definition.suggestedPriceCents,
      currency: 'ZAR',
      isPublished: true,
    })
    .onConflictDoNothing({
      target: [programVolumes.programId, programVolumes.volumeNumber],
    })
    .returning({ id: programVolumes.id });

  if (!volume) {
    [volume] = await transaction
      .select({ id: programVolumes.id })
      .from(programVolumes)
      .where(and(
        eq(programVolumes.programId, programme.id),
        eq(programVolumes.volumeNumber, definition.volumeNumber),
      ))
      .limit(1);
  }

  if (!volume) throw new Error(`Programme volume ${definition.volumeName} is unavailable.`);
  return { definition, volumeId: volume.id };
}

async function insertManualOrderItems(
  transaction: DatabaseTransaction,
  input: AdminClientCreateRequest,
  clientId: string,
  orderId: string,
  administratorUserId: string,
) {
  for (const assignment of input.programmes) {
    const { definition, volumeId } = await ensureProgrammeVolume(
      transaction,
      assignment.programmeKey,
    );
    const [item] = await transaction
      .insert(orderItems)
      .values({
        orderId,
        programVolumeId: volumeId,
        description: definition.volumeName,
        quantity: 1,
        unitPriceCents: assignment.priceCents,
        lineTotalCents: assignment.priceCents,
      })
      .returning({ id: orderItems.id });

    if (!item) throw new Error(`Order item ${definition.volumeName} was not created.`);

    await transaction.insert(programAccess).values({
      clientId,
      programVolumeId: volumeId,
      orderItemId: item.id,
      source: 'manual',
      status: 'active',
      grantedByUserId: administratorUserId,
    });
  }
}

async function insertManualPayment(
  transaction: DatabaseTransaction,
  orderId: string,
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
  administratorUserId: string,
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
  clientId: string,
  input: AdminClientUpdateRequest,
  administratorUserId: string,
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

export async function listClientsWithProgrammes() {
  const rows = await getDatabase()
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
      programmeSlug: programs.slug,
      volumeNumber: programVolumes.volumeNumber,
    })
    .from(clients)
    .leftJoin(orders, eq(orders.clientId, clients.id))
    .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
    .leftJoin(programVolumes, eq(programVolumes.id, orderItems.programVolumeId))
    .leftJoin(programs, eq(programs.id, programVolumes.programId))
    .orderBy(desc(clients.createdAt), asc(orderItems.createdAt));

  const clientMap = new Map<string, {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    gender: typeof clients.$inferSelect.gender;
    notes: string | null;
    createdAt: Date;
    programmes: Array<{
      orderId: string;
      orderNumber: string;
      name: string;
      priceCents: number;
      status: string;
      programmeKey: ProgrammeKey | null;
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
      const catalogueItem = programmeCatalog.find((item) =>
        item.slug === row.programmeSlug && item.volumeNumber === row.volumeNumber,
      );
      client.programmes.push({
        orderId: row.orderId,
        orderNumber: row.orderNumber,
        name: row.programmeName,
        priceCents: row.priceCents,
        status: row.orderStatus,
        programmeKey: catalogueItem?.key ?? null,
      });
    }
  }

  return [...clientMap.values()];
}
