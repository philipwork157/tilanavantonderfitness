import { z } from 'zod';
import { programmeCatalog } from './programs';

export const clientGenderValues = [
  'female',
  'male',
  'non-binary',
  'other',
  'prefer-not-to-say',
] as const;

export const clientPurchaseStatusValues = ['paid', 'pending'] as const;
export const programmeKeyValues = programmeCatalog.map((programme) => programme.key) as [
  (typeof programmeCatalog)[number]['key'],
  ...(typeof programmeCatalog)[number]['key'][],
];

export const adminClientProgrammeSchema = z.object({
  programmeKey: z.enum(programmeKeyValues),
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
  const keys = value.programmes.map((programme) => programme.programmeKey);
  if (new Set(keys).size !== keys.length) {
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
