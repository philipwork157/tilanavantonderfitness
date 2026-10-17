import type { Metadata } from 'next';
import { KitchenListView } from './kitchen-list-view';

export const metadata: Metadata = { title: 'Kitchen' };

export default function KitchenPage() {
  return <KitchenListView />;
}
