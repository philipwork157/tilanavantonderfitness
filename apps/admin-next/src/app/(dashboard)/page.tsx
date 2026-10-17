import type { Metadata } from 'next';
import { getAdmin } from '@/server/auth/admin';
import { Overview } from './overview';

export const metadata: Metadata = { title: 'Overview' };

export default async function OverviewPage() {
  const admin = await getAdmin().catch(() => null);
  return <Overview firstName={admin?.firstName ?? null} />;
}
