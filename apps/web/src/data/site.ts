import { programmeCatalogByKey } from '@tilana/contracts/programs';

const strongProgramme = programmeCatalogByKey['strong-volume-1'];

export const site = {
  name: 'Tilana van Tonder',
  email: 'tilanavantonder@gmail.com',
  description:
    'Practical strength programs, movement education, nutrition guidance, and sustainable healthy habits for women and men, by Tilana van Tonder.',
  navigation: [
    { label: 'Home', href: '/' },
    { label: 'About', href: '/about' },
    { label: 'Program', href: '/program' },
    { label: 'Blog', href: '/blog' },
    { label: 'Contact', href: '/contact' },
  ],
} as const;

export const programme = {
  name: strongProgramme.name,
  volume: `Volume ${strongProgramme.volumeNumber}`,
  description:
    'A focused eight-week programme for women and men with training experience who want to build advanced strength through structured sessions, clear progression, and purposeful practice.',
  duration: '8 weeks',
  price: String(strongProgramme.suggestedPriceCents / 100),
  includes: [
    'Four progressive strength sessions each week',
    'Advanced home and gym exercise alternatives',
    'Exercise demonstrations and form cues',
    'Progressive overload and load-selection guidance',
    'Training checkpoints to track performance',
    'Structured options for demanding weeks',
  ],
} as const;
