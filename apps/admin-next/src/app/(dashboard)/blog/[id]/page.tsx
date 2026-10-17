import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PostEditor } from './post-editor';

export const metadata: Metadata = { title: 'Edit post' };

export default async function BlogPostPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) notFound();
  return <PostEditor id={id} />;
}
