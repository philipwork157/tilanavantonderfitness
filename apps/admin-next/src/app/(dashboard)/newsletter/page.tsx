import type { Metadata } from 'next';
import { Suspense } from 'react';
import { NewsletterView } from './newsletter-view';

export const metadata: Metadata = { title: 'Newsletter' };

export default function NewsletterPage() {
  // Suspense: the view reads the tab and filter from the address bar.
  return <Suspense><NewsletterView /></Suspense>;
}
