import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SalesView } from './sales-view';

export const metadata: Metadata = { title: 'Sales' };

export default function SalesPage() {
  // Suspense: the orders search can start from ?q= in the address bar.
  return <Suspense><SalesView /></Suspense>;
}
