import type { ProgrammeKey } from '@tilana/contracts/programs';

export type MarketingProgram = {
  name: string;
  label: string;
  title: string;
  description: string;
  accent: 'beginner' | 'intermediate' | 'advanced' | 'reconnect' | 'nourish';
  catalogueKey?: ProgrammeKey;
  interest?: 'move' | 'reconnect' | 'nourish';
  status?: 'Coming soon';
};

export const marketingPrograms: MarketingProgram[] = [
  {
    name: 'Beginner',
    label: 'Beginner · Volume 1',
    title: 'Build a confident foundation.',
    description:
      'A welcoming introduction to strength for women and men who are new to training or returning after time away. Learn healthy movement patterns, practise good form, and build the confidence to use bodyweight or dumbbells safely at home or in the gym.',
    accent: 'beginner',
    catalogueKey: 'move-volume-1',
    interest: 'move',
  },
  {
    name: 'Intermediate',
    label: 'The next step',
    title: 'Turn your foundation into progress.',
    description:
      'Designed for people who feel comfortable with the basics and want a structured next step. The program will introduce more training volume, thoughtful exercise progressions, and new challenges while keeping technique and sustainable progress at the centre.',
    accent: 'intermediate',
    status: 'Coming soon',
  },
  {
    name: 'Advanced',
    label: 'Advanced · Volume 1',
    title: 'Train with greater purpose.',
    description:
      'A focused strength program for experienced women and men who already have an established training base. Advanced will use purposeful sessions, progressive overload, and clear performance goals to help you continue building strength with confidence.',
    accent: 'advanced',
    catalogueKey: 'strong-volume-1',
    status: 'Coming soon',
  },
  {
    name: 'Reconnect',
    label: 'Reconnect · Volume 1',
    title: 'Reconnect with your pelvic floor.',
    description:
      'Gentle education and movement for building pelvic-floor awareness before, during, and after pregnancy. Learn how breathing, coordination, and gradual strengthening can support daily movement, while understanding when help from a pelvic-health professional is needed.',
    accent: 'reconnect',
    catalogueKey: 'reconnect-volume-1',
    interest: 'reconnect',
  },
  {
    name: 'Nourish',
    label: 'Nourish · Volume 1',
    title: 'Understand how to fuel your body.',
    description:
      'A practical guide to macro- and micronutrients and the roles they play in energy, recovery, and everyday wellbeing. Learn to build balanced, satisfying meals around your needs without rigid restriction, guilt, or treating food as a reward.',
    accent: 'nourish',
    catalogueKey: 'nourish-volume-1',
    interest: 'nourish',
  },
];
