/**
 * Fixed V1 program volumes the website references by key (contact interests,
 * marketing cards). Keys and slugs are public identifiers used in URLs and the
 * catalogue API, so they stay stable even where the display name differs
 * (`move` is shown as Beginner, `strong` as Advanced). Prices and availability
 * come from the catalogue API, not from this list.
 */
export const programCatalog = [
  {
    key: 'strong-volume-1',
    slug: 'strong',
    name: 'Advanced',
    volumeNumber: 1,
    volumeName: 'Advanced · Volume 1',
  },
  {
    key: 'move-volume-1',
    slug: 'move',
    name: 'Beginner',
    volumeNumber: 1,
    volumeName: 'Beginner · Volume 1',
  },
  {
    key: 'nourish-volume-1',
    slug: 'nourish',
    name: 'Nourish',
    volumeNumber: 1,
    volumeName: 'Nourish · Volume 1',
  },
  {
    key: 'reconnect-volume-1',
    slug: 'reconnect',
    name: 'Reconnect',
    volumeNumber: 1,
    volumeName: 'Reconnect · Volume 1',
  },
] as const;

export type ProgramCatalogItem = (typeof programCatalog)[number];
export type ProgramKey = ProgramCatalogItem['key'];

export const programCatalogByKey = Object.fromEntries(
  programCatalog.map((program) => [program.key, program]),
) as Record<ProgramKey, ProgramCatalogItem>;
