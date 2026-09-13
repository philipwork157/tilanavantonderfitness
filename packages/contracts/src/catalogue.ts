import { z } from 'zod';

export const catalogueSlugSchema = z
  .string()
  .trim()
  .min(1, 'Enter a slug.')
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens only.');

export const catalogueProgramStatusValues = ['draft', 'published', 'archived'] as const;
export const catalogueProgramStatusSchema = z.enum(catalogueProgramStatusValues);

export const catalogueUploadStatusValues = ['pending', 'ready', 'failed'] as const;
export const catalogueUploadStatusSchema = z.enum(catalogueUploadStatusValues);

export const catalogueImageContentTypeValues = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
] as const;
export const catalogueImageContentTypeSchema = z.enum(catalogueImageContentTypeValues);

export const CATALOGUE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const CATALOGUE_PDF_MAX_BYTES = 50 * 1024 * 1024;

const optionalText = (maximum: number) => z.string().trim().min(1).max(maximum).nullable().optional();
const uploadFilenameSchema = z
  .string()
  .trim()
  .min(1, 'Select a file.')
  .max(255)
  .refine(
    value => Array.from(value).every((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint > 31 && codePoint !== 127;
    }),
    'The filename contains unsupported characters.',
  );

export const adminProgramCreateRequestSchema = z.object({
  slug: catalogueSlugSchema,
  name: z.string().trim().min(1, 'Enter a program name.').max(120),
  cardLabel: optionalText(120),
  headline: optionalText(180),
  description: optionalText(10_000),
  accent: catalogueSlugSchema.max(40).nullable().optional(),
  sortOrder: z.number().int().min(0).max(100_000).optional().default(0),
});

export const adminProgramUpdateRequestSchema = z.object({
  slug: catalogueSlugSchema.optional(),
  name: z.string().trim().min(1, 'Enter a program name.').max(120).optional(),
  cardLabel: optionalText(120),
  headline: optionalText(180),
  description: optionalText(10_000),
  accent: catalogueSlugSchema.max(40).nullable().optional(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
})
  .refine(value => Object.keys(value).length > 0, 'Provide at least one field to update.');

export const adminProgramStatusRequestSchema = z.object({
  status: catalogueProgramStatusSchema,
});

export const adminProgramVolumeCreateRequestSchema = z.object({
  slug: catalogueSlugSchema.nullable().optional(),
  volumeNumber: z.number().int().positive().max(10_000),
  name: z.string().trim().min(1, 'Enter a volume name.').max(160),
  description: optionalText(10_000),
  currentPriceCents: z.number().int().min(0).max(100_000_000),
  currency: z.literal('ZAR').optional().default('ZAR'),
  sortOrder: z.number().int().min(0).max(100_000).optional().default(0),
  isPublished: z.boolean().optional().default(false),
});

export const adminProgramVolumeUpdateRequestSchema = z.object({
  slug: catalogueSlugSchema.nullable().optional(),
  volumeNumber: z.number().int().positive().max(10_000).optional(),
  name: z.string().trim().min(1, 'Enter a volume name.').max(160).optional(),
  description: optionalText(10_000),
  currentPriceCents: z.number().int().min(0).max(100_000_000).optional(),
  currency: z.literal('ZAR').optional(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
  isPublished: z.boolean().optional(),
})
  .refine(value => Object.keys(value).length > 0, 'Provide at least one field to update.');

export const adminProgramMediaUploadRequestSchema = z.object({
  filename: uploadFilenameSchema,
  displayName: z.string().trim().min(1, 'Enter a display name.').max(200),
  altText: z.string().trim().min(1, 'Enter alternative text.').max(300),
  contentType: catalogueImageContentTypeSchema,
  sizeBytes: z.number().int().positive().max(CATALOGUE_IMAGE_MAX_BYTES),
  width: z.number().int().positive().max(20_000).optional(),
  height: z.number().int().positive().max(20_000).optional(),
}).superRefine((value, context) => {
  if ((value.width === undefined) !== (value.height === undefined)) {
    context.addIssue({
      code: 'custom',
      path: ['width'],
      message: 'Image width and height must be supplied together.',
    });
  }
});

export const adminProgramFileUploadRequestSchema = z.object({
  filename: uploadFilenameSchema,
  displayName: z.string().trim().min(1, 'Enter a display name.').max(200),
  contentType: z.literal('application/pdf'),
  sizeBytes: z.number().int().positive().max(CATALOGUE_PDF_MAX_BYTES),
  sortOrder: z.number().int().min(0).max(100_000).optional().default(0),
});

export const adminCatalogueUploadFinalizeRequestSchema = z.object({}).strict();

export const adminProgramFileUploadFinalizeRequestSchema = z.object({
  replaceFileId: z.number().int().positive().optional(),
}).strict();

export const adminCatalogueDeactivateRequestSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
});

export const catalogueUploadResponseSchema = z.object({
  uploadId: z.number().int().positive(),
  uploadUrl: z.string().url(),
  expiresInSeconds: z.number().int().positive(),
  headers: z.object({
    'Content-Type': z.string().min(1),
  }),
});

export const publicCatalogueCoverSchema = z.object({
  id: z.number().int().positive(),
  url: z.string().url(),
  altText: z.string(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
});

export const publicCatalogueVolumeSchema = z.object({
  id: z.number().int().positive(),
  slug: catalogueSlugSchema,
  volumeNumber: z.number().int().positive(),
  name: z.string(),
  description: z.string().nullable(),
  priceCents: z.number().int().nonnegative(),
  currency: z.literal('ZAR'),
  isAvailable: z.boolean(),
});

export const publicCatalogueProgramSchema = z.object({
  id: z.number().int().positive(),
  slug: catalogueSlugSchema,
  name: z.string(),
  cardLabel: z.string(),
  headline: z.string(),
  description: z.string(),
  accent: z.string(),
  cover: publicCatalogueCoverSchema.nullable(),
  volumes: z.array(publicCatalogueVolumeSchema),
});

export const publicCatalogueResponseSchema = z.object({
  programs: z.array(publicCatalogueProgramSchema),
});

export type AdminProgramCreateRequest = z.infer<typeof adminProgramCreateRequestSchema>;
export type AdminProgramUpdateRequest = z.infer<typeof adminProgramUpdateRequestSchema>;
export type AdminProgramStatusRequest = z.infer<typeof adminProgramStatusRequestSchema>;
export type AdminProgramVolumeCreateRequest = z.infer<typeof adminProgramVolumeCreateRequestSchema>;
export type AdminProgramVolumeUpdateRequest = z.infer<typeof adminProgramVolumeUpdateRequestSchema>;
export type AdminProgramMediaUploadRequest = z.infer<typeof adminProgramMediaUploadRequestSchema>;
export type AdminProgramFileUploadRequest = z.infer<typeof adminProgramFileUploadRequestSchema>;
export type AdminProgramFileUploadFinalizeRequest = z.infer<typeof adminProgramFileUploadFinalizeRequestSchema>;
export type AdminCatalogueDeactivateRequest = z.infer<typeof adminCatalogueDeactivateRequestSchema>;
export type CatalogueUploadResponse = z.infer<typeof catalogueUploadResponseSchema>;
export type PublicCatalogueProgram = z.infer<typeof publicCatalogueProgramSchema>;
export type PublicCatalogueVolume = z.infer<typeof publicCatalogueVolumeSchema>;
