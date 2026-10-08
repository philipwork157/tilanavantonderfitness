import type { PublicProgram } from '@tilana/contracts/public-programs';
import type { Tone } from './data';

/**
 * Programs as the website shows them. The words, prices, colour (`tone`) and
 * drawing (`illustration`, plus `step` for the barbell's plates) come from the
 * admin; the drawings and animations themselves live in ProgramArt.astro.
 * Shared by the pages and the browser islands, so no server-only imports.
 */

export type ProgramIcon = 'dumbbell' | 'stairs' | 'bolt' | 'breath' | 'bowl';

export type Program = {
  /** The program's slug: page anchor (#beginner-volume-1). */
  key: string;
  /** What the basket and checkout buy (the same slug). */
  slug: string;
  name: string;
  /** "Beginner · Volume 1": the name in the basket and emails. */
  label: string;
  /** "Volume 1": the stamp on the colour panel. */
  volume: string;
  volumeNumber: number;
  priceCents: number;
  title: string;
  short: string;
  description: string;
  tone: Tone;
  level: string;
  tags: string[];
  illustration: PublicProgram['illustration'];
  icon: ProgramIcon;
  /** The strength series is a step-by-step path; the focus programs stand on their own. */
  series: 'strength' | 'focus';
  /** Strength series: 1, 2 or 3. */
  step?: 1 | 2 | 3;
  /** A short label on the art panel: "Start here", "Pelvic floor", ... */
  marker: string;
};

/** What the basket and checkout need to show a program. */
export type Product = { slug: string; key: string; name: string; label: string; volume: string; title: string; priceCents: number; tone: Tone };

const barbellIcons: Record<1 | 2 | 3, ProgramIcon> = { 1: 'dumbbell', 2: 'stairs', 3: 'bolt' };

export function programIcon(illustration: PublicProgram['illustration'], step?: number | null): ProgramIcon {
  if (illustration === 'breath') return 'breath';
  if (illustration === 'plate') return 'bowl';
  return barbellIcons[(step ?? 1) as 1 | 2 | 3] ?? 'dumbbell';
}

export function toSiteProgram(p: PublicProgram): Program {
  const step = p.step === 1 || p.step === 2 || p.step === 3 ? p.step : undefined;
  const volume = `Volume ${p.volumeNumber}`;
  return {
    key: p.slug,
    slug: p.slug,
    name: p.name,
    label: `${p.name} · ${volume}`,
    volume,
    volumeNumber: p.volumeNumber,
    priceCents: p.priceCents,
    title: p.title,
    short: p.summary,
    description: p.description,
    tone: p.tone,
    level: p.audience,
    tags: p.tags,
    illustration: p.illustration,
    icon: programIcon(p.illustration, step),
    series: p.series,
    ...(step ? { step } : {}),
    marker: p.marker,
  };
}

/** The programs on the website, in the admin's order. */
export function toSitePrograms(list: PublicProgram[]): Program[] {
  return list.map(toSiteProgram);
}

/** The basket name: later volumes carry their number ("Beginner Vol. 2"). */
export const productName = (p: Pick<Program, 'name' | 'volumeNumber'>) => (p.volumeNumber > 1 ? `${p.name} Vol. ${p.volumeNumber}` : p.name);

/** One basket product per program. */
export function toProducts(programs: Program[]): Product[] {
  return programs.map((p) => ({
    slug: p.slug,
    key: p.key,
    name: productName(p),
    label: p.label,
    volume: p.volume,
    title: p.title,
    priceCents: p.priceCents,
    tone: p.tone,
  }));
}
