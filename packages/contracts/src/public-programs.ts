import { z } from 'zod';
import { PROGRAM_ILLUSTRATIONS, PROGRAM_SERIES, PROGRAM_TONES } from './admin-programs';
import { catalogueSlugSchema } from './catalogue';

/**
 * Pictures of the PDF for "Peek inside": the cover sharp, inside pages blurred.
 * Made automatically by the admin whenever the PDF changes. `page` is the page
 * number in the PDF; images are public WebP files.
 */
export const programPreviewSchema = z.object({
  pageCount: z.number().int().positive(),
  pages: z.array(z.object({
    url: z.string().url(),
    page: z.number().int().positive(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    blurred: z.boolean(),
  })).min(1),
});

/**
 * Programs on the website (GET /api/public/programs): every program with a PDF
 * in an active volume, in website order. Drawings stay in the website's code
 * and are chosen by `illustration` (and `step` for the barbell's plates).
 * `slug` is what the basket and checkout buy.
 */
export const publicProgramSchema = z.object({
  slug: catalogueSlugSchema,
  name: z.string(),
  title: z.string(),
  summary: z.string(),
  description: z.string(),
  audience: z.string(),
  tags: z.array(z.string()),
  /** "What's inside", written by Tilana; older admins leave it out. */
  highlights: z.array(z.string()).optional(),
  tone: z.enum(PROGRAM_TONES),
  illustration: z.enum(PROGRAM_ILLUSTRATIONS),
  series: z.enum(PROGRAM_SERIES),
  step: z.number().int().min(1).max(3).nullable(),
  marker: z.string(),
  volumeNumber: z.number().int().positive(),
  priceCents: z.number().int().positive(),
  currency: z.literal('ZAR'),
  /** The sneak peek made from the PDF, when it has been made. */
  preview: programPreviewSchema.nullable().optional(),
});

export const publicProgramsResponseSchema = z.object({
  programs: z.array(publicProgramSchema),
});

export type PublicProgram = z.infer<typeof publicProgramSchema>;
export type ProgramPreview = z.infer<typeof programPreviewSchema>;
