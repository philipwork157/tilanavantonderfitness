import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { RecipeEditor } from './recipe-editor';

export const metadata: Metadata = { title: 'Edit recipe' };

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) notFound();
  return <RecipeEditor id={id} />;
}
