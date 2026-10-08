import { z } from 'zod';

/** Admin editing of volumes and their programs. Website contracts live in public-programs.ts. */

export const PROGRAM_TONES = ['terracotta', 'sage', 'sand', 'white', 'caramel'] as const;
export const PROGRAM_ILLUSTRATIONS = ['barbell', 'breath', 'plate'] as const;
export const PROGRAM_SERIES = ['strength', 'focus'] as const;

/** Largest PDF accepted for a program. Emails must stay under inbox size limits. */
export const MAX_PROGRAM_PDF_BYTES = 15 * 1024 * 1024;

export const programSlugSchema = z.string().trim().toLowerCase().min(2).max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens only.');

const line = (max: number) => z.string().trim().max(max);

const priceCentsSchema = z.number().int().min(100, 'The price must be at least R1.').max(10_000_000, 'The price must be at most R100 000.');

/** Everything Tilana edits on a program. Its PDF is uploaded separately. */
export const programInputSchema = z.object({
  name: z.string().trim().min(2, 'Add a name.').max(60),
  slug: programSlugSchema,
  title: line(120),
  summary: line(240),
  description: line(1200),
  audience: line(80),
  tags: z.array(z.string().trim().min(1).max(40)).max(6, 'Use at most 6 tags.'),
  tone: z.enum(PROGRAM_TONES),
  illustration: z.enum(PROGRAM_ILLUSTRATIONS),
  series: z.enum(PROGRAM_SERIES),
  step: z.number().int().min(1).max(3).nullable(),
  marker: line(40),
  sortOrder: z.number().int().min(0).max(10_000),
  priceCents: priceCentsSchema,
}).superRefine((value, context) => {
  if (value.series === 'strength' && value.step === null) {
    context.addIssue({ code: 'custom', path: ['step'], message: 'Choose a step for the strength series.' });
  }
  if (value.series === 'focus' && value.step !== null) {
    context.addIssue({ code: 'custom', path: ['step'], message: 'Focus programs have no step.' });
  }
});

/** A new program in a volume: a name and a price to start with. */
export const createProgramRequestSchema = z.object({
  volumeId: z.number().int().positive(),
  name: z.string().trim().min(2, 'Add a name.').max(60),
  priceCents: priceCentsSchema,
});

/** Rename a volume or switch it on or off for the website. */
export const updateVolumeRequestSchema = z.object({
  name: z.string().trim().min(2, 'Add a name.').max(60),
  isActive: z.boolean(),
});

export type ProgramTone = (typeof PROGRAM_TONES)[number];
export type ProgramIllustration = (typeof PROGRAM_ILLUSTRATIONS)[number];
export type ProgramSeries = (typeof PROGRAM_SERIES)[number];
export type ProgramInput = z.infer<typeof programInputSchema>;
export type UpdateVolumeRequest = z.infer<typeof updateVolumeRequestSchema>;
