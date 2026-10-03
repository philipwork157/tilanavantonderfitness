import { z } from 'zod';

/** Paystack is the V1 default; legacy/manual client records remain explicitly accessible. */
export const adminClientListQuerySchema = z.object({ source: z.enum(['paystack', 'all']).default('paystack') });

/** Purchase-mail state records provider acceptance, not arrival in the buyer's inbox. */
export const programEmailDeliveryStatusSchema = z.enum(['pending', 'retrying', 'sent', 'canceled', 'unavailable']);
export type ProgramEmailDeliveryStatus = z.infer<typeof programEmailDeliveryStatusSchema>;
export const PROGRAM_EMAIL_PENDING_ATTENTION_MS = 30 * 60_000;

/** Include a stuck first send, not just failed attempts; completed/canceled work stays clear. */
export function programEmailNeedsAttention(status: ProgramEmailDeliveryStatus, queuedAt?: Date | string | null, now = Date.now()): boolean {
  if (status === 'retrying' || status === 'unavailable') return true;
  return status === 'pending' && !!queuedAt && now - new Date(queuedAt).getTime() >= PROGRAM_EMAIL_PENDING_ATTENTION_MS;
}

export const clientGenderValues = [
  'female',
  'male',
  'non-binary',
  'other',
  'prefer-not-to-say',
] as const;

export const clientPurchaseStatusValues = ['paid', 'pending'] as const;

export const adminClientProgrammeSchema = z.object({
  programVolumeId: z.number().int().positive(),
  priceCents: z.number().int().min(0).max(10_000_000),
});

export const adminClientCreateRequestSchema = z.object({
  firstName: z.string().trim().min(1, 'Please enter a first name.').max(100),
  lastName: z.string().trim().min(1, 'Please enter a last name.').max(100),
  email: z.string().trim().email('Please enter a valid email address.').max(254),
  phone: z.string().trim().max(40).optional().default(''),
  gender: z.enum(clientGenderValues).nullable().optional().default(null),
  notes: z.string().trim().max(2_000).optional().default(''),
  purchaseStatus: z.enum(clientPurchaseStatusValues).default('paid'),
  programmes: z.array(adminClientProgrammeSchema).min(1, 'Add at least one programme.').max(10),
}).superRefine((value, context) => {
  const volumeIds = value.programmes.map((programme) => programme.programVolumeId);
  if (new Set(volumeIds).size !== volumeIds.length) {
    context.addIssue({
      code: 'custom',
      path: ['programmes'],
      message: 'Each programme can only be added once.',
    });
  }
});

export const adminClientUpdateRequestSchema = adminClientCreateRequestSchema;

export type AdminClientCreateRequest = z.infer<typeof adminClientCreateRequestSchema>;
export type AdminClientUpdateRequest = z.infer<typeof adminClientUpdateRequestSchema>;
export type ClientGender = (typeof clientGenderValues)[number];
export type ClientPurchaseStatus = (typeof clientPurchaseStatusValues)[number];
