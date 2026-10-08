import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { VolumeView } from './volume-view';

export const metadata: Metadata = { title: 'Volume' };

export default async function VolumePage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) notFound();
  return <VolumeView id={id} />;
}
