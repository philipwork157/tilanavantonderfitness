import { clients, contactSubmissions, invoices, orders } from '@tilana/db/schema';
import { count, desc, eq } from 'drizzle-orm';
import { getDatabase } from '../utils/database';

export async function getAdminDashboard() {
  const database = getDatabase();

  const [contactsResult, newContactsResult, clientsResult, paidOrdersResult, invoicesResult, recentContacts] =
    await Promise.all([
      database.select({ value: count() }).from(contactSubmissions),
      database.select({ value: count() }).from(contactSubmissions).where(eq(contactSubmissions.status, 'new')),
      database.select({ value: count() }).from(clients),
      database.select({ value: count() }).from(orders).where(eq(orders.status, 'paid')),
      database.select({ value: count() }).from(invoices).where(eq(invoices.status, 'issued')),
      database
        .select({
          id: contactSubmissions.id,
          fullName: contactSubmissions.fullName,
          email: contactSubmissions.email,
          interest: contactSubmissions.interest,
          status: contactSubmissions.status,
          createdAt: contactSubmissions.createdAt,
        })
        .from(contactSubmissions)
        .orderBy(desc(contactSubmissions.createdAt))
        .limit(6),
    ]);

  return {
    stats: {
      contacts: contactsResult[0]?.value ?? 0,
      newContacts: newContactsResult[0]?.value ?? 0,
      clients: clientsResult[0]?.value ?? 0,
      paidOrders: paidOrdersResult[0]?.value ?? 0,
      issuedInvoices: invoicesResult[0]?.value ?? 0,
    },
    recentContacts,
  };
}

export async function listContactSubmissions() {
  return getDatabase()
    .select({
      id: contactSubmissions.id,
      fullName: contactSubmissions.fullName,
      email: contactSubmissions.email,
      interest: contactSubmissions.interest,
      message: contactSubmissions.message,
      status: contactSubmissions.status,
      createdAt: contactSubmissions.createdAt,
    })
    .from(contactSubmissions)
    .orderBy(desc(contactSubmissions.createdAt))
    .limit(100);
}
