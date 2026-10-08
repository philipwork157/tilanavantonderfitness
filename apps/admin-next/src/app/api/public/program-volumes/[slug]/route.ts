import { catalogueSlugSchema } from '@tilana/contracts/catalogue';
import { publicReadRoute } from '@/server/cors';
import { getDatabase } from '@/server/db';
import { HttpError } from '@/server/http';
import { findProgramBySlug, isOnWebsite, programLabel } from '@/server/services/programs';

/**
 * Live price and availability of one program, for the basket and checkout.
 * Same URL and response shape as the old Nuxt catalogue endpoint
 * (catalogue.ts), where each sellable item was a "program volume". The
 * website treats this exact 404 message as "no longer sold".
 */
export const GET = publicReadRoute(async (_request: Request, context: { params: Promise<{ slug: string }> }) => {
  const slug = catalogueSlugSchema.safeParse((await context.params).slug);
  const program = slug.success ? await findProgramBySlug(getDatabase(), slug.data) : undefined;
  if (!program) throw new HttpError(404, 'Program volume not found.');
  const onWebsite = isOnWebsite(program, program.volume);
  const item = {
    id: program.id,
    slug: program.slug,
    volumeNumber: program.volume.number,
    name: programLabel(program.name, program.volume),
    description: null,
    priceCents: program.priceCents,
    currency: 'ZAR' as const,
    isAvailable: onWebsite,
  };
  return Response.json({
    volume: {
      ...item,
      program: {
        id: program.id,
        slug: program.slug,
        name: program.name,
        cardLabel: program.marker || program.name,
        headline: program.title,
        description: program.description,
        accent: program.tone,
        cover: null,
        volumes: onWebsite ? [item] : [],
      },
    },
  });
});
