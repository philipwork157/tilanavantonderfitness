import type { AdminProgram } from './types';

/** Colour panel classes per program tone (white uses the card colour). */
export const toneClass: Record<AdminProgram['tone'], string> = {
  terracotta: 'bg-tone-terracotta text-on-tone',
  sage: 'bg-tone-sage text-on-tone',
  sand: 'bg-tone-sand text-on-tone',
  caramel: 'bg-tone-caramel text-on-tone',
  white: 'bg-card text-card-foreground',
};

export const toneLabels: Record<AdminProgram['tone'], string> = {
  terracotta: 'Terracotta',
  sage: 'Sage',
  sand: 'Sand',
  caramel: 'Caramel',
  white: 'Cream',
};

export const illustrationLabels: Record<AdminProgram['illustration'], string> = {
  barbell: 'Barbell (plates show the step)',
  breath: 'Breathing (pelvic floor)',
  plate: 'Balanced plate (nutrition)',
};

const rand = new Intl.NumberFormat('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** 39900 → "R399", 39950 → "R399.50". */
export function formatRand(cents: number): string {
  const value = cents / 100;
  return `R${Number.isInteger(value) ? rand.format(value) : value.toFixed(2)}`.replace(/\u00a0/g, ' ');
}

/** "399" or "399,50" → 39900 / 39950; null when it is not a valid amount. */
export function parseRand(text: string): number | null {
  const match = text.trim().replace(/^R\s*/i, '').replace(/\s/g, '').match(/^(\d{1,6})(?:[.,](\d{1,2}))?$/);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

/** 2_400_000 → "2.3 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
