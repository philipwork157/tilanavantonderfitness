// Website settings shared by every page.
import { SITE_ENVIRONMENT } from '@web/utils/site-environment';

export const BASE = '';

/** Builds an internal link: href('/about') → '/about'. */
/** The contact form, opened on "An order, payment or refund" with a starter message. */
export function orderContactHref(message: string): string {
  return href(`/contact?interest=order&message=${encodeURIComponent(message)}`);
}

export const REFUND_MESSAGE = 'Refund request\nPurchase email:\nProgram:\nOrder number or Paystack reference:\nPurchase date:\nWhat went wrong:';
export const RESEND_MESSAGE = 'Please send my programs again.\nPurchase email:\nOrder number:';

export function href(path: string): string {
  if (path === '/' || path === '') return `${BASE}/`;
  return `${BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

export const site = {
  name: 'Tilana van Tonder',
  /** Shown on the contact page only. No phone number or home address anywhere on the website. */
  email: 'tilanavantonder@gmail.com',
  /** Used only by the WhatsApp button's link; never printed on a page. */
  whatsapp: '27728803734',
  url: 'https://tilanavantonder.co.za',
  tagline: 'Move better. Feel stronger. Live healthier.',
  description:
    'Practical strength programs, movement education, nutrition guidance, and sustainable healthy habits for women and men, by Tilana van Tonder.',
  developer: { name: 'Philip van Tonder', url: 'https://www.philipvtonder.co.za/' },
  disclaimer: 'General education and lived experience - not medical care.',
} as const;

/**
 * Whether online buying is on, from PUBLIC_CHECKOUT_ENABLED ("true" or
 * "false"). When it is not set: on for the development website (and locally),
 * off for the live website, so the live site only sells once it is switched on
 * on purpose (after Paystack approves the business).
 */
export function checkoutSetting(value: unknown, environment: 'production' | 'development'): boolean {
  const setting = String(value ?? '').trim().toLowerCase();
  if (setting === 'true') return true;
  if (setting === 'false') return false;
  return environment !== 'production';
}

/**
 * Online checkout: "Add to basket" buttons, the basket drawer and the Paystack
 * checkout page. When off, every program button opens the contact form with
 * that program chosen, and /checkout says online checkout is coming soon. The
 * rest of the site (programs, prices, sneak peeks, quiz) stays the same.
 */
export const checkoutEnabled = checkoutSetting(import.meta.env.PUBLIC_CHECKOUT_ENABLED, SITE_ENVIRONMENT);

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
