import type {
  clients,
  invoiceItems,
  invoices,
  orderItems,
  orders,
  payments,
  users,
  programAccess,
  programFiles,
  programs,
  programVolumes,
  userRoles,
} from '../schema';

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserRoleRecord = typeof userRoles.$inferSelect;
export type NewUserRoleRecord = typeof userRoles.$inferInsert;
export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;

export type Program = typeof programs.$inferSelect;
export type NewProgram = typeof programs.$inferInsert;
export type ProgramVolume = typeof programVolumes.$inferSelect;
export type NewProgramVolume = typeof programVolumes.$inferInsert;
export type ProgramFile = typeof programFiles.$inferSelect;
export type NewProgramFile = typeof programFiles.$inferInsert;

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;
export type NewOrderItem = typeof orderItems.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type ProgramAccess = typeof programAccess.$inferSelect;
export type NewProgramAccess = typeof programAccess.$inferInsert;

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type NewInvoiceItem = typeof invoiceItems.$inferInsert;
