// Website settings shared by every page.
export const BASE = '';

/** Builds an internal link: href('/about') → '/about'. */
export function href(path: string): string {
  if (path === '/' || path === '') return `${BASE}/`;
  return `${BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

export const site = {
  name: 'Tilana van Tonder',
  email: 'tilanavantonder@gmail.com',
  whatsapp: '27728803734',
  /** Seller details the law (ECT Act s43) and Paystack ask a shop to show. */
  phone: '+27 72 880 3734',
  address: 'Ternberry Village, Cleveland 31, Cape Town, Western Cape, 7580, South Africa',
  url: 'https://tilanavantonder.co.za',
  tagline: 'Move better. Feel stronger. Live healthier.',
  description:
    'Practical strength programs, movement education, nutrition guidance, and sustainable healthy habits for women and men, by Tilana van Tonder.',
  developer: { name: 'Philip van Tonder', url: 'https://www.philipvtonder.co.za/' },
  disclaimer: 'General education and lived experience - not medical care.',
} as const;

/**
 * Online checkout: "Add to basket" buttons, the basket drawer and the Paystack
 * checkout page. Set to false to fall back to the live site's behaviour, where
 * every program button opens the contact form with that program chosen.
 */
export const checkoutEnabled = true;

/** Contact link for a program, with the program chosen and a first line of the message. */
export function programContactHref(program: { key: string; label: string }): string {
  // The program's slug is its contact-form interest (move, strong, nourish, ...).
  const interest = program.key;
  const message = `I'd like to buy ${program.label}.`;
  return href(`/contact?interest=${encodeURIComponent(interest)}&message=${encodeURIComponent(message)}`);
}

export type NavKey = 'home' | 'about' | 'program' | 'kitchen' | 'blog' | 'contact' | 'legal' | 'checkout';

export const navigation: { key: NavKey; label: string; path: string }[] = [
  { key: 'home', label: 'Home', path: '/' },
  { key: 'about', label: 'About', path: '/about' },
  { key: 'program', label: 'Programs', path: '/program' },
  { key: 'kitchen', label: 'Kitchen', path: '/kitchen' },
  { key: 'blog', label: 'Blog', path: '/blog' },
  { key: 'contact', label: 'Contact', path: '/contact' },
];
