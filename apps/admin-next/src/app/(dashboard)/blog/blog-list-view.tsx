'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { ImageIcon, NotebookPen, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { EmptyState } from '@/components/empty-state';
import { NavLink } from '@/components/nav-link';
import { PageHeader } from '@/components/page-header';
import { RefreshButton } from '@/components/refresh-button';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useNavigate } from '@/lib/navigation-progress';
import { blogStatus, statusStyle } from '@/lib/status';
import type { BlogPostSummary } from '@/lib/types';

export function BlogListView() {
  const router = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');

  const { data, isPending, isFetching, refetch } = useQuery({
    queryKey: ['blog-posts'],
    queryFn: () => api<{ posts: BlogPostSummary[] }>('/api/blog-posts'),
  });
  const posts = data?.posts ?? [];

  const create = useMutation({
    mutationFn: (newTitle: string) => api<{ id: number }>('/api/blog-posts', { method: 'POST', body: JSON.stringify({ title: newTitle }) }),
    onSuccess: ({ id }) => {
      setCreateOpen(false);
      setTitle('');
      router.push(`/blog/${id}`);
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate(title.trim());
  }

  const newPostButton = (
    <Button className="rounded-full" onClick={() => { create.reset(); setCreateOpen(true); }}>
      <Plus /> New post
    </Button>
  );

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        eyebrow="Website"
        title="Blog"
        description="Posts appear on the website within about five minutes of publishing."
        actions={<><RefreshButton loading={isFetching} onClick={() => refetch()} />{newPostButton}</>}
      />

      {!isPending && posts.length === 0 ? (
        <EmptyState icon={NotebookPen} title="No blog posts yet" description="Write the first post. It stays a draft until you publish it.">
          <div className="mt-3">{newPostButton}</div>
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="px-5">Post</TableHead>
                <TableHead className="hidden px-5 md:table-cell">Category</TableHead>
                <TableHead className="px-5">Status</TableHead>
                <TableHead className="hidden px-5 lg:table-cell">Last edited</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending && Array.from({ length: 3 }, (_, i) => (
                <TableRow key={i}><TableCell colSpan={4} className="px-5 py-4"><Skeleton className="h-12 w-full" /></TableCell></TableRow>
              ))}
              {posts.map((post) => {
                const status = statusStyle(blogStatus, post.status);
                return (
                  <TableRow key={post.id} className="cursor-pointer" onClick={() => router.push(`/blog/${post.id}`)}>
                    <TableCell className="px-5 py-3 whitespace-normal">
                      <NavLink href={`/blog/${post.id}`} className="flex items-center gap-3 rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" onClick={(e) => e.stopPropagation()}>
                        <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted text-muted-foreground">
                          {post.coverImageUrl
                            // eslint-disable-next-line @next/next/no-img-element -- remote Supabase image, small thumbnail
                            ? <img src={post.coverImageUrl} alt="" loading="lazy" className="size-full object-cover" />
                            : <ImageIcon className="size-4" aria-hidden />}
                        </span>
                        <span className="grid min-w-0">
                          <span className="font-semibold break-words">{post.title}</span>
                          <span className="text-xs break-all text-muted-foreground">/blog/{post.slug}</span>
                        </span>
                      </NavLink>
                    </TableCell>
                    <TableCell className="hidden px-5 md:table-cell">{post.category}</TableCell>
                    <TableCell className="px-5"><StatusBadge label={status.label} tone={status.tone} /></TableCell>
                    <TableCell className="hidden px-5 whitespace-nowrap lg:table-cell">{formatDateTime(post.updatedAt)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <form onSubmit={submit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle className="font-heading text-2xl">New blog post</DialogTitle>
              <DialogDescription>Start with a title. You can change everything later.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="new-title">Title</Label>
              <Input id="new-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="When life gets in the way" maxLength={160} autoFocus />
              {create.error && <p role="alert" className="text-sm text-destructive">{create.error instanceof ApiError ? create.error.message : 'Could not create the post.'}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={title.trim().length < 3 || create.isPending}>{create.isPending ? 'Creating…' : 'Create draft'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
