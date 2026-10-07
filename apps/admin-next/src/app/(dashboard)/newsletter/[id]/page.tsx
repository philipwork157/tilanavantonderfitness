import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CampaignView } from './campaign-view';

export const metadata: Metadata = { title: 'Newsletter email' };

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) notFound();
  return <CampaignView id={id} />;
}
