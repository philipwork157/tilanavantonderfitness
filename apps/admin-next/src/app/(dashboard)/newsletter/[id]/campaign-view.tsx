'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Check, CircleCheck, CirclePause, Eye, FlaskConical, Loader2, Mail, Monitor, PenLine, Play, Save, Send,
  Smartphone, Trash2, Users,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { NavLink } from '@/components/nav-link';
import { RefreshButton } from '@/components/refresh-button';
import { StatusBadge } from '@/components/status-badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api';
import { formatDateTime, plural } from '@/lib/format';
import { useNavigate } from '@/lib/navigation-progress';
import { campaignStatus, deliveryStatus, statusStyle, type StatusTone } from '@/lib/status';
import type { BlogPostSummary, CampaignDetail, Delivery, EmailPreview, TestPreview } from '@/lib/types';
import { useDebounced } from '@/lib/use-debounced';
import { useUnsavedGuard } from '@/lib/use-unsaved-guard';
import { cn } from '@/lib/utils';

interface CampaignForm {
  blogPostId: number | null;
  subject: string;
  previewText: string;
  introduction: string;
}

const toForm = (campaign: CampaignDetail['campaign']): CampaignForm => ({
  blogPostId: campaign.blogPostId,
  subject: campaign.subject,
  previewText: campaign.previewText,
  introduction: campaign.introduction,
});

const message = (error: unknown, fallback: string) => (error instanceof ApiError ? error.message : fallback);
const people = (count: number) => plural(count, 'person', 'people');

export function CampaignView({ id }: { id: number }) {
  const detail = useQuery({
    queryKey: ['campaign', id],
    queryFn: () => api<CampaignDetail>(`/api/newsletter-campaigns/${id}`),
    // While sending, follow the progress every few seconds.
    refetchInterval: (query) => (query.state.data?.campaign.status === 'sending' ? 3000 : false),
  });

  if (detail.isPending) {
    return (
      <div className="mx-auto grid w-full max-w-6xl gap-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (detail.error || !detail.data) {
    return (
      <div className="mx-auto grid w-full max-w-6xl justify-items-start gap-4">
        <p role="alert" className="text-destructive">{message(detail.error, 'Email not found.')}</p>
        <Button asChild variant="outline"><NavLink href="/newsletter"><ArrowLeft /> All emails</NavLink></Button>
      </div>
    );
  }
  // The form is compared with the latest saved campaign, so refreshes never wipe it or close dialogs.
  return <Campaign key={detail.data.campaign.id} data={detail.data} refetch={() => void detail.refetch()} refetching={detail.isFetching} />;
}

function Campaign({ data, refetch, refetching }: { data: CampaignDetail; refetch: () => void; refetching: boolean }) {
  const router = useNavigate();
  const queryClient = useQueryClient();
  const { campaign, counts, devRedirectTo, testRecipients } = data;
  const id = campaign.id;
  const isDraft = campaign.status === 'draft';

  const [form, setForm] = useState(() => toForm(campaign));
  const savedJson = JSON.stringify(toForm(campaign));
  const dirty = isDraft && JSON.stringify(form) !== savedJson;
  const testedAndSaved = Boolean(campaign.testSentAt) && !dirty;
  useUnsavedGuard(dirty);
  const set = <K extends keyof CampaignForm>(key: K, value: CampaignForm[K]) => setForm((current) => ({ ...current, [key]: value }));

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['campaign', id] });
    void queryClient.invalidateQueries({ queryKey: ['campaigns'] });
  };

  /* Data for drafts: published posts to choose from and who it will go to. */
  const posts = useQuery({
    queryKey: ['blog-posts'],
    queryFn: () => api<{ posts: BlogPostSummary[] }>('/api/blog-posts'),
    enabled: isDraft,
  });
  const publishedPosts = (posts.data?.posts ?? []).filter((post) => post.status === 'published');
  const upcoming = useQuery({
    queryKey: ['campaign-recipients', id],
    queryFn: () => api<{ recipients: string[] }>(`/api/newsletter-campaigns/${id}/recipients`),
    enabled: isDraft,
  });
  const upcomingRecipients = upcoming.data?.recipients ?? [];

  /* Progress for sent campaigns. */
  const deliveries = useQuery({
    queryKey: ['campaign-deliveries', id],
    queryFn: () => api<{ deliveries: Delivery[] }>(`/api/newsletter-campaigns/${id}/deliveries`),
    enabled: !isDraft,
    refetchInterval: campaign.status === 'sending' ? 3000 : false,
  });

  /* Live preview, rendered by the server from the form as it is typed. */
  const previewForm = useDebounced(form, 400);
  const preview = useQuery({
    queryKey: ['campaign-preview', id, previewForm],
    queryFn: () => api<EmailPreview>(`/api/newsletter-campaigns/${id}/preview`, { method: 'POST', body: JSON.stringify(previewForm) }),
    enabled: previewForm.blogPostId !== null,
    placeholderData: keepPreviousData,
    retry: false,
  });
  const [previewWidth, setPreviewWidth] = useState<'desktop' | 'mobile'>('desktop');

  async function saveNow() {
    await api(`/api/newsletter-campaigns/${id}`, { method: 'PUT', body: JSON.stringify(form) });
    invalidate();
  }
  const save = useMutation({
    mutationFn: saveNow,
    onSuccess: () => toast.success('Saved'),
    onError: (error) => toast.error('Not saved', { description: message(error, 'Please try again.') }),
  });

  /* Test email: show exactly what will be sent, then send it. */
  const [testOpen, setTestOpen] = useState(false);
  const testPreview = useMutation({
    mutationFn: async () => {
      if (dirty) await saveNow();
      return api<TestPreview>(`/api/newsletter-campaigns/${id}/test-preview`);
    },
    onMutate: () => setTestOpen(true),
    onError: (error) => {
      setTestOpen(false);
      toast.error('Could not prepare the test', { description: message(error, 'Please try again.') });
    },
  });
  const sendTest = useMutation({
    mutationFn: () => api<{ recipients: string[] }>(`/api/newsletter-campaigns/${id}/test`, { method: 'POST' }),
    onSuccess: (result) => {
      setTestOpen(false);
      invalidate();
      toast.success('Test email sent', { description: result.recipients.join(', ') });
    },
    onError: (error) => toast.error('Test not sent', { description: message(error, 'Please try again.') }),
  });

  /* Review and send. */
  const [reviewOpen, setReviewOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const review = useMutation({
    mutationFn: () => api<{ recipients: string[] }>(`/api/newsletter-campaigns/${id}/recipients`),
    onMutate: () => { setChecked(false); setReviewOpen(true); },
    onError: (error) => toast.error('Could not load the recipients', { description: message(error, 'Please try again.') }),
  });
  const recipients = review.data?.recipients ?? [];
  const send = useMutation({
    mutationFn: () => api(`/api/newsletter-campaigns/${id}/send`, { method: 'POST', body: JSON.stringify({ recipientCount: recipients.length }) }),
    onSuccess: () => {
      setReviewOpen(false);
      toast.success('Sending started', { description: `Going to ${people(recipients.length)}.` });
      invalidate();
    },
    onError: (error) => {
      toast.error('Not sent', { description: message(error, 'Please try again.') });
      // The list may have changed: show the current one.
      if (reviewOpen) review.mutate();
    },
  });

  const resume = useMutation({
    mutationFn: () => api(`/api/newsletter-campaigns/${id}/resume`, { method: 'POST' }),
    onSuccess: invalidate,
    onError: (error) => toast.error('Could not resume', { description: message(error, 'Please try again.') }),
  });

  const [deleteOpen, setDeleteOpen] = useState(false);
  const remove = useMutation({
    mutationFn: () => api(`/api/newsletter-campaigns/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setForm(toForm(campaign));
      void queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Draft deleted');
      router.push('/newsletter');
    },
    onError: (error) => toast.error('Not deleted', { description: message(error, 'Please try again.') }),
  });

  const done = counts.sent + counts.bounced + counts.complained + counts.skipped + counts.failed;
  const progress = campaign.recipientCount ? Math.round((done / campaign.recipientCount) * 100) : 0;
  const status = statusStyle(campaignStatus, campaign.status);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="link" className="px-0 text-muted-foreground">
          <NavLink href="/newsletter"><ArrowLeft /> All emails</NavLink>
        </Button>
        {dirty && <span className="text-sm font-semibold text-status-warning">Unsaved changes</span>}
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-2 text-xs font-extrabold tracking-[0.2em] text-brand-text uppercase">Newsletter email</p>
          <h1 className="font-heading text-3xl font-bold tracking-tight break-words md:text-4xl">{form.subject || 'Newsletter email'}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label={status.label} tone={status.tone} className="max-sm:hidden" />
          <RefreshButton loading={refetching || preview.isFetching} onClick={() => { refetch(); void (isDraft ? upcoming.refetch() : deliveries.refetch()); }} />
          {isDraft && (
            <Button variant="outline" className="rounded-full bg-card" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? <Loader2 className="animate-spin" /> : <Save />} Save
            </Button>
          )}
        </div>
      </div>

      {devRedirectTo && (
        <div role="note" className="mb-5 flex items-start gap-3 rounded-xl border border-status-info/30 bg-status-info-bg p-4 text-sm text-status-info">
          <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p><strong>Development.</strong> Every email from this admin, tests and newsletters, goes only to {devRedirectTo}.</p>
        </div>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div className="grid gap-5">
          {isDraft ? (
            <>
              <Panel icon={PenLine} tone="brand" title="Email" titleId="content-heading" sub="What your subscribers see in their inbox.">
                <Field id="post" label="Blog post" hint="The email links to this post on the website.">
                  <Select value={form.blogPostId ? String(form.blogPostId) : ''} onValueChange={(value) => set('blogPostId', Number(value))}>
                    <SelectTrigger id="post" className="w-full bg-card"><SelectValue placeholder="Choose a published post" /></SelectTrigger>
                    <SelectContent>
                      {publishedPosts.map((post) => <SelectItem key={post.id} value={String(post.id)}>{post.title}</SelectItem>)}
                      {data.post && !publishedPosts.some((post) => post.id === data.post?.id) && (
                        <SelectItem value={String(data.post.id)}>{data.post.title}</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </Field>
                <Field id="subject" label="Subject">
                  <Input id="subject" value={form.subject} onChange={(e) => set('subject', e.target.value)} maxLength={150} />
                </Field>
                <Field id="preview-line" label="Preview line" hint="Shown next to the subject in most inboxes. Leave empty to use the post summary.">
                  <Input id="preview-line" value={form.previewText} onChange={(e) => set('previewText', e.target.value)} maxLength={200} />
                </Field>
                <Field id="note" label="Personal note" hint="Optional. A few words from you above the post summary.">
                  <Textarea id="note" value={form.introduction} onChange={(e) => set('introduction', e.target.value)} rows={4} maxLength={1000} />
                </Field>
              </Panel>

              <Panel icon={Send} tone="success" title="Send" titleId="send-heading" sub="Test it first, then send it to everyone.">
                <ol className="grid gap-4">
                  <Step done={testedAndSaved} icon={testedAndSaved ? Check : FlaskConical} title="1. Send a test email">
                    <p>
                      {testRecipients.length ? `Goes to ${testRecipients.join(', ')}.` : 'No test addresses are set up yet (NEWSLETTER_TEST_TO).'}
                      {' '}
                      {testedAndSaved && campaign.testSentAt ? `Sent ${formatDateTime(campaign.testSentAt)}.` : dirty ? 'Saves your changes first.' : ''}
                    </p>
                    <Button variant="outline" className="justify-self-start bg-card" disabled={!testRecipients.length || !form.blogPostId || testPreview.isPending} onClick={() => testPreview.mutate()}>
                      {testPreview.isPending && !testOpen ? <Loader2 className="animate-spin" /> : <Mail />} {testedAndSaved ? 'Send another test' : 'Send test email'}
                    </Button>
                  </Step>
                  <Step ready={testedAndSaved} icon={Users} title="2. Send to subscribers">
                    <p>
                      {plural(upcomingRecipients.length, 'confirmed subscriber', 'confirmed subscribers')}.
                      {!testedAndSaved && ' Available once the test email has been sent.'}
                    </p>
                    {upcomingRecipients.length > 0 && (
                      <details className="rounded-lg border bg-muted/30 px-3 py-2">
                        <summary className="cursor-pointer text-sm font-semibold">Show who will receive it</summary>
                        <ul className="mt-2 grid max-h-48 gap-1 overflow-y-auto text-sm">
                          {upcomingRecipients.map((address) => <li key={address} className="break-all">{address}</li>)}
                        </ul>
                      </details>
                    )}
                    <Button className="justify-self-start" disabled={!testedAndSaved || !upcomingRecipients.length} onClick={() => review.mutate()}>
                      <Send /> Review and send
                    </Button>
                  </Step>
                </ol>
              </Panel>

              <div className="flex justify-end">
                <Button variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleteOpen(true)}>
                  <Trash2 /> Delete draft
                </Button>
              </div>
            </>
          ) : (
            <>
              <Panel
                icon={campaign.status === 'sent' ? CircleCheck : campaign.status === 'paused' ? CirclePause : Loader2}
                tone={status.tone}
                spin={campaign.status === 'sending'}
                title={campaign.status === 'sent' ? 'Sent' : campaign.status === 'paused' ? 'Paused' : 'Sending…'}
                titleId="progress-heading"
                sub={`${done} of ${campaign.recipientCount ?? 0} handled${campaign.finishedAt ? ` · finished ${formatDateTime(campaign.finishedAt)}` : campaign.startedAt ? ` · started ${formatDateTime(campaign.startedAt)}` : ''}`}
              >
                {campaign.status === 'paused' && (
                  <div role="alert" className="flex items-start gap-3 rounded-xl border border-status-warning/30 bg-status-warning-bg p-4 text-sm text-status-warning">
                    <CirclePause className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <p><strong>Sending stopped.</strong> {campaign.pauseReason ?? 'Something went wrong while sending.'}</p>
                  </div>
                )}
                <Progress value={progress} aria-label="Sending progress" />
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat label="Sent" value={counts.sent} tone="success" />
                  <Stat label="Waiting" value={counts.queued} tone="info" />
                  <Stat label="Bounced" value={counts.bounced} tone="danger" />
                  <Stat label="Spam" value={counts.complained} tone="warning" />
                  {counts.skipped > 0 && <Stat label="Skipped" value={counts.skipped} tone="neutral" />}
                  {counts.failed > 0 && <Stat label="Failed" value={counts.failed} tone="danger" />}
                </dl>
                <p className="text-xs text-muted-foreground">Bounced and spam addresses are never emailed again. Skipped people unsubscribed while it was sending.</p>
                {campaign.status === 'paused' && (
                  <Button className="justify-self-start" disabled={resume.isPending} onClick={() => resume.mutate()}>
                    {resume.isPending ? <Loader2 className="animate-spin" /> : <Play />} Resume sending
                  </Button>
                )}
              </Panel>

              <div className="overflow-hidden rounded-2xl border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="px-5">Email</TableHead>
                      <TableHead className="px-5">Status</TableHead>
                      <TableHead className="hidden px-5 md:table-cell">Sent</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deliveries.data?.deliveries.map((delivery) => {
                      const style = statusStyle(deliveryStatus, delivery.status);
                      return (
                        <TableRow key={delivery.id}>
                          <TableCell className="px-5 py-3 whitespace-normal">
                            <span className="grid">
                              <span className="font-semibold break-all">{delivery.email}</span>
                              {delivery.error && <span className="text-xs text-muted-foreground">{delivery.error}</span>}
                            </span>
                          </TableCell>
                          <TableCell className="px-5"><StatusBadge label={style.label} tone={style.tone} /></TableCell>
                          <TableCell className="hidden px-5 whitespace-nowrap md:table-cell">{formatDateTime(delivery.sentAt)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>

        <section aria-labelledby="preview-heading" className="grid gap-4 rounded-2xl border bg-card p-5 xl:sticky xl:top-20">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <ToneIcon icon={Eye} tone="info" />
              <h2 id="preview-heading" className="text-sm font-extrabold tracking-[0.14em] uppercase">Preview</h2>
            </div>
            <Tabs value={previewWidth} onValueChange={(value) => setPreviewWidth(value as 'desktop' | 'mobile')}>
              <TabsList>
                <TabsTrigger value="desktop"><Monitor /> Desktop</TabsTrigger>
                <TabsTrigger value="mobile"><Smartphone /> Phone</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          {preview.data && (
            <div className="flex items-start gap-3 rounded-xl border bg-background p-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary font-heading font-bold text-primary-foreground italic" aria-hidden>T</span>
              <span className="grid min-w-0 text-sm">
                <span className="font-bold">Tilana van Tonder</span>
                <span className="truncate font-semibold">{preview.data.subject}</span>
                <span className="truncate text-muted-foreground">{preview.data.previewText}</span>
              </span>
            </div>
          )}
          {preview.error && <p className="text-sm text-muted-foreground">{message(preview.error, 'The preview could not be shown.')}</p>}
          <div className={cn('mx-auto w-full overflow-hidden rounded-xl border bg-white transition-[max-width] duration-300', previewWidth === 'mobile' ? 'max-w-[390px]' : 'max-w-full')}>
            {preview.data
              ? <iframe srcDoc={preview.data.html} sandbox="" title="Email preview" className="block h-[42rem] w-full" />
              : <Skeleton className="h-[42rem] w-full rounded-none" />}
          </div>
        </section>
      </div>

      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl">Send a test email</DialogTitle>
            <DialogDescription>This is exactly what will be sent.</DialogDescription>
          </DialogHeader>
          {testPreview.data ? (
            <div className="grid gap-3">
              <dl className="grid gap-1 rounded-xl border bg-muted/30 p-3 text-sm">
                <Envelope label="To">{testPreview.data.recipients.join(', ')}</Envelope>
                <Envelope label="From">{testPreview.data.from}</Envelope>
                <Envelope label="Subject">{testPreview.data.subject}</Envelope>
              </dl>
              {testPreview.data.devRedirectTo && <p className="text-xs text-muted-foreground">Development: only {testPreview.data.devRedirectTo} receives this test.</p>}
              <div className="overflow-hidden rounded-xl border bg-white">
                <iframe srcDoc={testPreview.data.html} sandbox="" title="Test email" className="block h-[50vh] w-full" />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Preparing the test email…</p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTestOpen(false)}>Cancel</Button>
            <Button disabled={!testPreview.data || sendTest.isPending} onClick={() => sendTest.mutate()}>
              {sendTest.isPending ? <Loader2 className="animate-spin" /> : <Mail />}
              Send test to {plural(testPreview.data?.recipients.length ?? 0, 'address', 'addresses')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl">Send to {people(recipients.length)}?</DialogTitle>
            <DialogDescription>Everyone below has confirmed their subscription. This can&apos;t be undone.</DialogDescription>
          </DialogHeader>
          <dl className="grid gap-1 rounded-xl border bg-muted/30 p-3 text-sm">
            <Envelope label="Subject">{form.subject}</Envelope>
          </dl>
          {devRedirectTo && <p className="text-xs text-muted-foreground">Development: these emails all go to {devRedirectTo} instead.</p>}
          {review.isPending
            ? <p className="text-sm text-muted-foreground">Loading recipients…</p>
            : (
              <ul aria-label="Recipients" className="grid max-h-60 gap-1 overflow-y-auto rounded-xl border p-3 text-sm">
                {recipients.map((address) => <li key={address} className="break-all">{address}</li>)}
              </ul>
            )}
          <label className="flex items-center gap-2 text-sm font-medium">
            <Checkbox checked={checked} onCheckedChange={(value) => setChecked(value === true)} />
            I checked the test email and it looks right
          </label>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReviewOpen(false)}>Cancel</Button>
            <Button disabled={!checked || !recipients.length || review.isPending || send.isPending} onClick={() => send.mutate()}>
              {send.isPending ? <Loader2 className="animate-spin" /> : <Send />} Send to {people(recipients.length)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
            <AlertDialogDescription>The draft email is removed. The blog post is not affected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep draft</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" disabled={remove.isPending} onClick={(e) => { e.preventDefault(); remove.mutate(); }}>
              {remove.isPending ? 'Deleting…' : 'Delete draft'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const toneIconClass: Record<StatusTone, string> = {
  neutral: 'bg-status-neutral-bg text-status-neutral',
  brand: 'bg-status-brand-bg text-status-brand',
  success: 'bg-status-success-bg text-status-success',
  warning: 'bg-status-warning-bg text-status-warning',
  danger: 'bg-status-danger-bg text-status-danger',
  info: 'bg-status-info-bg text-status-info',
};

function ToneIcon({ icon: Icon, tone, spin }: { icon: typeof Eye; tone: StatusTone; spin?: boolean }) {
  return (
    <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', toneIconClass[tone])} aria-hidden>
      <Icon className={cn('size-4', spin && 'animate-spin')} />
    </span>
  );
}

function Panel({ icon, tone, spin, title, titleId, sub, children }: {
  icon: typeof Eye;
  tone: StatusTone;
  spin?: boolean;
  title: string;
  titleId: string;
  sub: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={titleId} className="grid gap-4 rounded-2xl border bg-card p-5">
      <div className="flex items-center gap-3">
        <ToneIcon icon={icon} tone={tone} spin={spin} />
        <div>
          <h2 id={titleId} className="text-sm font-extrabold tracking-[0.14em] uppercase">{title}</h2>
          <p className="text-xs text-muted-foreground">{sub}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Step({ done, ready, icon: Icon, title, children }: { done?: boolean; ready?: boolean; icon: typeof Eye; title: string; children: ReactNode }) {
  return (
    <li className={cn('grid grid-cols-[auto_1fr] gap-3 rounded-xl border p-4', done && 'border-status-success/40 bg-status-success-bg/40', ready && 'border-foreground/40')}>
      <span className={cn('grid size-8 place-items-center rounded-full border', done ? 'border-transparent bg-status-success text-background' : 'bg-card')} aria-hidden>
        <Icon className="size-4" />
      </span>
      <div className="grid gap-2 text-sm">
        <p className="font-bold">{title}</p>
        <div className="grid gap-3 text-muted-foreground">{children}</div>
      </div>
    </li>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: StatusTone }) {
  return (
    <div className={cn('rounded-xl p-3', toneIconClass[tone])}>
      <dt className="text-xs font-semibold">{label}</dt>
      <dd className="font-heading text-2xl font-bold">{value.toLocaleString('en-ZA')}</dd>
    </div>
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

function Envelope({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr] gap-2">
      <dt className="font-semibold text-muted-foreground">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}
