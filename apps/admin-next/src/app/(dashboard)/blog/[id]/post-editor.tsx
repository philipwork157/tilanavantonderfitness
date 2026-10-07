'use client';

import { BLOG_CATEGORIES, slugify } from '@tilana/contracts/blog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, EyeOff, Globe, ImageIcon, Loader2, Save, Send, Trash2, Upload } from 'lucide-react';
import { useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { MarkdownEditor } from '@/components/markdown-editor';
import { NavLink } from '@/components/nav-link';
import { StatusBadge } from '@/components/status-badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api';
import { useNavigate } from '@/lib/navigation-progress';
import type { AdminBlogPost } from '@/lib/types';
import { useUnsavedGuard } from '@/lib/use-unsaved-guard';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Editable copy of a post. Dates are edited as yyyy-mm-dd in South African time. */
function toForm(post: AdminBlogPost) {
  return {
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    category: post.category,
    bodyMarkdown: post.bodyMarkdown,
    coverImageAlt: post.coverImageAlt ?? '',
    closingLine: post.closingLine ?? '',
    quoteText: post.quoteText ?? '',
    quoteCitation: post.quoteCitation ?? '',
    publishedOn: post.publishedAt
      ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg' }).format(new Date(post.publishedAt))
      : '',
  };
}
type PostForm = ReturnType<typeof toForm>;

function toPayload(form: PostForm) {
  const { publishedOn, ...rest } = form;
  // Midday in South Africa keeps the chosen calendar day in every timezone.
  return { ...rest, publishedAt: publishedOn ? `${publishedOn}T12:00:00+02:00` : null };
}

const message = (error: unknown, fallback: string) => (error instanceof ApiError ? error.message : fallback);

export function PostEditor({ id }: { id: number }) {
  const { data, error, isPending } = useQuery({
    queryKey: ['blog-post', id],
    queryFn: () => api<{ post: AdminBlogPost }>(`/api/blog-posts/${id}`),
  });

  if (isPending) {
    return (
      <div className="mx-auto grid w-full max-w-6xl gap-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="mx-auto grid w-full max-w-6xl justify-items-start gap-4">
        <p role="alert" className="text-destructive">{message(error, 'Post not found.')}</p>
        <Button asChild variant="outline"><NavLink href="/blog"><ArrowLeft /> All posts</NavLink></Button>
      </div>
    );
  }
  return <EditorForm initial={data.post} />;
}

function EditorForm({ initial }: { initial: AdminBlogPost }) {
  const router = useNavigate();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [post, setPost] = useState(initial);
  const [form, setForm] = useState(() => toForm(initial));
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(toForm(initial)));
  const [deleteOpen, setDeleteOpen] = useState(false);
  const dirty = JSON.stringify(form) !== savedJson;
  const isPublished = post.status === 'published';
  useUnsavedGuard(dirty);

  const set = <K extends keyof PostForm>(key: K, value: PostForm[K]) => setForm((current) => ({ ...current, [key]: value }));

  function applyServerPost(next: AdminBlogPost) {
    setPost(next);
    const nextForm = toForm(next);
    setForm(nextForm);
    setSavedJson(JSON.stringify(nextForm));
    queryClient.setQueryData(['blog-post', next.id], { post: next });
    void queryClient.invalidateQueries({ queryKey: ['blog-posts'] });
  }

  async function saveNow(): Promise<AdminBlogPost> {
    const result = await api<{ post: AdminBlogPost }>(`/api/blog-posts/${post.id}`, { method: 'PUT', body: JSON.stringify(toPayload(form)) });
    applyServerPost(result.post);
    return result.post;
  }

  const save = useMutation({
    mutationFn: saveNow,
    onSuccess: () => toast.success('Saved'),
    onError: (error) => toast.error('Not saved', { description: message(error, 'Please try again.') }),
  });

  const changeStatus = useMutation({
    mutationFn: async (status: 'draft' | 'published') => {
      if (dirty) await saveNow();
      return api<{ post: AdminBlogPost }>(`/api/blog-posts/${post.id}/status`, { method: 'POST', body: JSON.stringify({ status }) });
    },
    onSuccess: (result, status) => {
      applyServerPost(result.post);
      toast.success(status === 'published' ? 'Published' : 'Moved to drafts', {
        description: status === 'published' ? 'It appears on the website within about 5 minutes.' : 'It disappears from the website within about 5 minutes.',
      });
    },
    onError: (error) => toast.error('Not published yet', { description: message(error, 'Please try again.') }),
  });

  const cover = useMutation({
    mutationFn: (file: File | null) => {
      if (!file) return api<{ post: AdminBlogPost }>(`/api/blog-posts/${post.id}/cover`, { method: 'DELETE' });
      const body = new FormData();
      body.append('file', file);
      return api<{ post: AdminBlogPost }>(`/api/blog-posts/${post.id}/cover`, { method: 'POST', body });
    },
    onSuccess: (result, file) => {
      setPost(result.post);
      queryClient.setQueryData(['blog-post', post.id], { post: result.post });
      void queryClient.invalidateQueries({ queryKey: ['blog-posts'] });
      if (file) toast.success('Cover photo updated');
    },
    onError: (error) => toast.error('Upload failed', { description: message(error, 'Please try another photo.') }),
  });

  function chooseCover(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error('Photo too large', { description: 'Please choose a photo smaller than 10 MB.' });
      return;
    }
    cover.mutate(file);
  }

  const emailSubscribers = useMutation({
    mutationFn: async () => {
      if (dirty) await saveNow();
      return api<{ id: number }>('/api/newsletter-campaigns', { method: 'POST', body: JSON.stringify({ blogPostId: post.id }) });
    },
    onSuccess: ({ id }) => router.push(`/newsletter/${id}`),
    onError: (error) => toast.error('Could not start the email', { description: message(error, 'Please try again.') }),
  });

  const remove = useMutation({
    mutationFn: () => api(`/api/blog-posts/${post.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setSavedJson(JSON.stringify(form));
      void queryClient.invalidateQueries({ queryKey: ['blog-posts'] });
      toast.success('Post deleted');
      router.push('/blog');
    },
    onError: (error) => toast.error('Not deleted', { description: message(error, 'Please try again.') }),
  });

  const busy = save.isPending || changeStatus.isPending;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="link" className="px-0 text-muted-foreground">
          <NavLink href="/blog"><ArrowLeft /> All posts</NavLink>
        </Button>
        {dirty && <span className="text-sm font-semibold text-status-warning">Unsaved changes</span>}
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-2 text-xs font-extrabold tracking-[0.2em] text-brand-text uppercase">Blog post</p>
          <h1 className="font-heading text-3xl font-bold tracking-tight break-words md:text-4xl">{form.title || 'Untitled post'}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label={isPublished ? 'Published' : 'Draft'} tone={isPublished ? 'success' : 'neutral'} className="max-sm:hidden" />
          <Button variant="outline" className="rounded-full bg-card" disabled={!dirty || busy} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />} Save
          </Button>
          {isPublished ? (
            <Button variant="ghost" className="rounded-full" disabled={busy} onClick={() => changeStatus.mutate('draft')}>
              <EyeOff /> Unpublish
            </Button>
          ) : (
            <Button className="rounded-full" disabled={busy} onClick={() => changeStatus.mutate('published')}>
              {changeStatus.isPending ? <Loader2 className="animate-spin" /> : <Globe />} Publish
            </Button>
          )}
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid gap-5">
          <Panel>
            <Field id="title" label="Title">
              <Input id="title" value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={160} className="h-11 text-lg font-semibold" />
            </Field>
            <Field id="excerpt" label="Summary" hint="Shown on the blog cards and in Google results. One or two sentences.">
              <Textarea id="excerpt" value={form.excerpt} onChange={(e) => set('excerpt', e.target.value)} rows={2} maxLength={300} />
            </Field>
          </Panel>

          <Panel title="Post" titleId="body-heading" hint="The first letter of the first paragraph becomes the large decorative letter on the website.">
            <MarkdownEditor value={form.bodyMarkdown} onChange={(markdown) => set('bodyMarkdown', markdown)} labelledBy="body-heading" />
          </Panel>

          <Panel title="Ending" titleId="ending-heading">
            <Field id="closing" label="Closing line" hint="Shown in the green box above “With love, Tilana”. Leave empty to show only the signature.">
              <Textarea id="closing" value={form.closingLine} onChange={(e) => set('closingLine', e.target.value)} rows={2} maxLength={300} />
            </Field>
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_14rem]">
              <Field id="quote" label="Quote" hint="Optional, for example a Bible verse. Shown in the terracotta block at the end.">
                <Textarea id="quote" value={form.quoteText} onChange={(e) => set('quoteText', e.target.value)} rows={2} maxLength={500} />
              </Field>
              <Field id="quote-source" label="Quote source">
                <Input id="quote-source" value={form.quoteCitation} onChange={(e) => set('quoteCitation', e.target.value)} placeholder="Proverbs 31:25" maxLength={120} />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">Every post also ends with the standard “Please note” health disclaimer.</p>
          </Panel>
        </div>

        <aside className="grid gap-5">
          <Panel title="Cover photo" titleId="cover-heading">
            <div className="grid aspect-[4/5] place-items-center overflow-hidden rounded-xl border bg-muted text-muted-foreground">
              {post.coverImageUrl
                // eslint-disable-next-line @next/next/no-img-element -- remote Supabase image chosen by the admin
                ? <img src={post.coverImageUrl} alt={form.coverImageAlt} className="size-full object-cover" />
                : <ImageIcon className="size-8" aria-hidden />}
            </div>
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={chooseCover} aria-label="Choose a cover photo" />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="bg-card" disabled={cover.isPending} onClick={() => fileInput.current?.click()}>
                {cover.isPending ? <Loader2 className="animate-spin" /> : <Upload />} {post.coverImageUrl ? 'Replace photo' : 'Upload photo'}
              </Button>
              {post.coverImageUrl && <Button variant="ghost" disabled={cover.isPending} onClick={() => cover.mutate(null)}>Remove</Button>}
            </div>
            <p className="text-xs text-muted-foreground">JPG, PNG or WebP up to 10 MB. Portrait photos look best.</p>
            <Field id="alt" label="Photo description" hint="Describe the photo for people using screen readers.">
              <Textarea id="alt" value={form.coverImageAlt} onChange={(e) => set('coverImageAlt', e.target.value)} rows={2} maxLength={250} />
            </Field>
          </Panel>

          <Panel title="Settings" titleId="settings-heading">
            <Field id="category" label="Category">
              <Select value={form.category} onValueChange={(value) => set('category', value)}>
                <SelectTrigger id="category" className="w-full bg-card"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BLOG_CATEGORIES.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field id="published-on" label="Publish date" hint={isPublished ? undefined : 'Leave empty to use the day you publish.'}>
              <Input id="published-on" type="date" value={form.publishedOn} onChange={(e) => set('publishedOn', e.target.value)} />
            </Field>
            <Field id="slug" label="Web address" hint={isPublished ? 'Changing this breaks links people already shared.' : undefined}>
              <div className="flex items-center rounded-md border bg-card focus-within:ring-2 focus-within:ring-ring/40">
                <span className="pl-3 text-sm text-muted-foreground" aria-hidden>/blog/</span>
                <Input id="slug" value={form.slug} onChange={(e) => set('slug', e.target.value)} maxLength={120} className="border-0 pl-1 shadow-none focus-visible:ring-0" />
              </div>
            </Field>
            {form.slug !== slugify(form.title) && (
              <Button variant="link" size="sm" className="justify-self-start px-0" onClick={() => set('slug', slugify(form.title))}>Match the title</Button>
            )}
          </Panel>

          {isPublished && (
            <Panel title="Newsletter" titleId="newsletter-heading" hint="Share this post with your subscribers. You can preview it and send yourself a test first.">
              <Button variant="outline" className="bg-card" disabled={emailSubscribers.isPending} onClick={() => emailSubscribers.mutate()}>
                {emailSubscribers.isPending ? <Loader2 className="animate-spin" /> : <Send />} Email to subscribers
              </Button>
            </Panel>
          )}

          <Panel title="Delete" titleId="delete-heading" hint="Removes the post and its cover photo for good." danger>
            <Button variant="outline" className="border-destructive/50 bg-card text-destructive hover:bg-destructive/10" onClick={() => setDeleteOpen(true)}>
              <Trash2 /> Delete post
            </Button>
          </Panel>
        </aside>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{post.title}”?</AlertDialogTitle>
            <AlertDialogDescription>The post and its cover photo will be removed. This can&apos;t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep post</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" disabled={remove.isPending} onClick={(e) => { e.preventDefault(); remove.mutate(); }}>
              {remove.isPending ? 'Deleting…' : 'Delete post'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Panel({ title, titleId, hint, danger, children }: {
  title?: string;
  titleId?: string;
  hint?: string;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={titleId} className={`grid gap-4 rounded-2xl border bg-card p-5 ${danger ? 'border-destructive/30' : ''}`}>
      {title && <h2 id={titleId} className="text-sm font-extrabold tracking-[0.14em] uppercase">{title}</h2>}
      {hint && <p className="-mt-2 text-xs text-muted-foreground">{hint}</p>}
      {children}
    </section>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
