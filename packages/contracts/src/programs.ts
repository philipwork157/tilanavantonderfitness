export const programmeCatalog = [
  {
    key: 'strong-volume-1',
    slug: 'strong',
    name: 'Advanced',
    volumeNumber: 1,
    volumeName: 'Advanced · Volume 1',
    suggestedPriceCents: 69_000,
  },
  {
    key: 'move-volume-1',
    slug: 'move',
    name: 'Beginner',
    volumeNumber: 1,
    volumeName: 'Beginner · Volume 1',
    suggestedPriceCents: 40_000,
  },
  {
    key: 'nourish-volume-1',
    slug: 'nourish',
    name: 'Nourish',
    volumeNumber: 1,
    volumeName: 'Nourish · Volume 1',
    suggestedPriceCents: 40_000,
  },
  {
    key: 'reconnect-volume-1',
    slug: 'reconnect',
    name: 'Reconnect',
    volumeNumber: 1,
    volumeName: 'Reconnect · Volume 1',
    suggestedPriceCents: 40_000,
  },
] as const;

export type ProgrammeCatalogItem = (typeof programmeCatalog)[number];
export type ProgrammeKey = ProgrammeCatalogItem['key'];

export const programmeCatalogByKey = Object.fromEntries(
  programmeCatalog.map((programme) => [programme.key, programme]),
) as Record<ProgrammeKey, ProgrammeCatalogItem>;

export function formatZar(cents: number): string {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}
