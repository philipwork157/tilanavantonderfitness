import type { Metadata } from 'next';
import { InquiriesView } from './inquiries-view';

export const metadata: Metadata = { title: 'Inquiries' };

export default function InquiriesPage() {
  return <InquiriesView />;
}
