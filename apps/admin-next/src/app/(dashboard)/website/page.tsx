import type { Metadata } from 'next';
import { WebsiteView } from './website-view';

export const metadata: Metadata = { title: 'Website' };

export default function WebsitePage() {
  return <WebsiteView />;
}
