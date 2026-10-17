import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProgramEditor } from './program-editor';

export const metadata: Metadata = { title: 'Edit program' };

export default async function ProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) notFound();
  return <ProgramEditor id={id} />;
}
