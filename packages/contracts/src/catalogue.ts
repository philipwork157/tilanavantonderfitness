import { z } from 'zod';

export const catalogueSlugSchema = z
  .string()
  .trim()
  .min(1, 'Enter a slug.')
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens only.');

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

export const publicCatalogueVolumeDetailSchema = publicCatalogueVolumeSchema.extend({
  program: publicCatalogueProgramSchema,
});

export const publicCatalogueVolumeResponseSchema = z.object({
  volume: publicCatalogueVolumeDetailSchema,
});

export type PublicCatalogueProgram = z.infer<typeof publicCatalogueProgramSchema>;
export type PublicCatalogueVolume = z.infer<typeof publicCatalogueVolumeSchema>;
export type PublicCatalogueVolumeDetail = z.infer<typeof publicCatalogueVolumeDetailSchema>;
