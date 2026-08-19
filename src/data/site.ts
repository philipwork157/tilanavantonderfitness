export const site = {
  name: 'Tilana van Tonder',
  shortName: 'TVT',
  email: 'hello@tilanavantonder.co.za',
  description:
    'Practical movement, nourishing habits, and realistic encouragement for women finding their feet after birth.',
  instagram: '#',
  navigation: [
    { label: 'Home', href: '/' },
    { label: 'About', href: '/about' },
    { label: 'Program', href: '/program' },
    { label: 'Pricing', href: '/pricing' },
    { label: 'Blog', href: '/blog' },
    { label: 'Contact', href: '/contact' },
  ],
} as const;

export const programme = {
  name: 'Strong Again',
  eyebrow: 'A gentle return to strength',
  description:
    'A practical, progressive programme to help women rebuild everyday strength, create nourishing habits, and feel more at home in their bodies.',
  price: 'R690',
  cadence: 'once-off',
  duration: '8 weeks',
  includes: [
    'Three progressive strength sessions each week',
    'Home and gym exercise alternatives',
    'Simple weekly habit prompts',
    'General balanced-eating guidance',
    'Exercise demonstrations and form cues',
    'A realistic plan for busy weeks',
  ],
} as const;
