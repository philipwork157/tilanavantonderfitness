'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Hourglass, MailX, Plus, Send, Users } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { EmptyState } from '@/components/empty-state';
import { NavLink } from '@/components/nav-link';
import { PageHeader } from '@/components/page-header';
import { RefreshButton } from '@/components/refresh-button';
import { StatTile } from '@/components/stat-tile';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useNavigate } from '@/lib/navigation-progress';
import { campaignStatus, statusStyle, subscriberStatus } from '@/lib/status';
import type { BlogPostSummary, CampaignSummary, Subscriber, SubscriberView } from '@/lib/types';

const views: SubscriberView[] = ['subscribed', 'pending', 'unsubscribed', 'suppressed'];

const emptySubscribers: Record<SubscriberView, { title: string; description: string }> = {
  subscribed: { title: 'No subscribers yet', description: 'People who sign up on the website and confirm their email appear here.' },
  pending: { title: 'Nobody waiting', description: 'People who signed up but have not clicked the confirmation link yet appear here.' },
  unsubscribed: { title: 'Nobody has unsubscribed', description: 'People who use the unsubscribe link appear here.' },
  suppressed: { title: 'No bounces or complaints', description: 'Addresses that bounced or marked an email as spam are never emailed again.' },
};

function subscriberDate(row: Subscriber) {
  const date = row.status === 'subscribed' ? row.confirmedAt
    : row.status === 'unsubscribed' ? row.unsubscribedAt
      : row.status === 'pending' ? row.consentedAt
        : row.suppressedAt;
  return formatDateTime(date);
}

export function NewsletterView() {
  const router = useRouter();
  const navigate = useNavigate();
  const pathname = usePathname();
  const params = useSearchParams();
  const queryClient = useQueryClient();

  // Tab and filter live in the address bar, so links and the back button work.
  const tab = params.get('tab') === 'subscribers' ? 'subscribers' : 'emails';
  const view = views.find((value) => value === params.get('view')) ?? 'subscribed';
  const go = (next: { tab?: string; view?: SubscriberView }) => {
    const query = new URLSearchParams();
    if (next.tab === 'subscribers') query.set('tab', 'subscribers');
    if (next.tab === 'subscribers' && next.view && next.view !== 'subscribed') query.set('view', next.view);
    router.replace(query.size ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const campaigns = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api<{ campaigns: CampaignSummary[]; subscriberCount: number }>('/api/newsletter-campaigns'),
  });
  const subscribers = useQuery({
    queryKey: ['subscribers', view],
    queryFn: () => api<{ subscribers: Subscriber[]; counts: Record<SubscriberView, number> }>(`/api/newsletter-subscribers?view=${view}`),
  });
  const counts = subscribers.data?.counts;
  const campaignRows = campaigns.data?.campaigns ?? [];
  const sentCampaigns = campaignRows.filter((campaign) => campaign.status === 'sent').length;
  const waiting = campaignRows.length - sentCampaigns;

  /* New email */
  const [createOpen, setCreateOpen] = useState(false);
  const [postId, setPostId] = useState<string>('');
  const posts = useQuery({
    queryKey: ['blog-posts'],
    queryFn: () => api<{ posts: BlogPostSummary[] }>('/api/blog-posts'),
    enabled: createOpen,
  });
  const published = (posts.data?.posts ?? []).filter((post) => post.status === 'published');
  const create = useMutation({
    mutationFn: () => api<{ id: number }>('/api/newsletter-campaigns', { method: 'POST', body: JSON.stringify({ blogPostId: Number(postId) }) }),
    onSuccess: ({ id }) => {
      void queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      navigate.push(`/newsletter/${id}`);
    },
  });
  function openCreate() {
    create.reset();
    setPostId('');
    setCreateOpen(true);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (postId) create.mutate();
  }

  const refreshing = campaigns.isFetching || subscribers.isFetching;
  const newEmailButton = <Button className="rounded-full" onClick={openCreate}><Plus /> New email</Button>;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        eyebrow="Email"
        title="Newsletter"
        description="Share blog posts with the people who signed up on the website."
        actions={<><RefreshButton loading={refreshing} onClick={() => { void campaigns.refetch(); void subscribers.refetch(); }} />{newEmailButton}</>}
      />

      <section aria-label="Newsletter summary" className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile compact index={0} href="/newsletter?tab=subscribers" icon={Users} tone="sage" label={counts?.subscribed === 1 ? 'Subscriber' : 'Subscribers'} value={counts?.subscribed} hint="Confirmed and receiving emails" />
        <StatTile compact index={1} href="/newsletter?tab=subscribers&view=pending" icon={Hourglass} tone="sand" label="Waiting" value={counts?.pending} hint="Signed up, not confirmed yet" />
        <StatTile compact index={2} href="/newsletter" icon={Send} tone="terracotta" label="Emails sent" value={campaigns.data ? sentCampaigns : undefined} hint={waiting ? `${waiting} not sent yet` : 'Nothing waiting'} />
        <StatTile compact index={3} href="/newsletter?tab=subscribers&view=suppressed" icon={MailX} tone="caramel" label="Bounced or spam" value={counts?.suppressed} hint="Never emailed again" />
      </section>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={(value) => go({ tab: value })}>
          <TabsList>
            <TabsTrigger value="emails"><Send /> Emails</TabsTrigger>
            <TabsTrigger value="subscribers"><Users /> Subscribers</TabsTrigger>
          </TabsList>
        </Tabs>
        {tab === 'subscribers' && (
          <Select value={view} onValueChange={(value) => go({ tab: 'subscribers', view: value as SubscriberView })}>
            <SelectTrigger className="w-60 bg-card" aria-label="Show subscribers"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="subscribed">Subscribed ({counts?.subscribed ?? 0})</SelectItem>
              <SelectItem value="pending">Waiting ({counts?.pending ?? 0})</SelectItem>
              <SelectItem value="unsubscribed">Unsubscribed ({counts?.unsubscribed ?? 0})</SelectItem>
              <SelectItem value="suppressed">Bounced or spam ({counts?.suppressed ?? 0})</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {tab === 'emails' ? (
        !campaigns.isPending && campaignRows.length === 0 ? (
          <EmptyState icon={Send} title="No newsletter emails yet" description="Choose a published blog post to share with your subscribers. You can preview it and send yourself a test first.">
            <div className="mt-3">{newEmailButton}</div>
          </EmptyState>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="px-5">Email</TableHead>
                  <TableHead className="px-5">Status</TableHead>
                  <TableHead className="hidden px-5 md:table-cell">Recipients</TableHead>
                  <TableHead className="hidden px-5 lg:table-cell">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.isPending && <LoadingRows columns={4} />}
                {campaignRows.map((campaign) => {
                  const status = statusStyle(campaignStatus, campaign.status);
                  return (
                    <TableRow key={campaign.id} className="cursor-pointer" onClick={() => navigate.push(`/newsletter/${campaign.id}`)}>
                      <TableCell className="px-5 py-4 whitespace-normal">
                        <NavLink href={`/newsletter/${campaign.id}`} className="grid rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" onClick={(e) => e.stopPropagation()}>
                          <span className="font-semibold">{campaign.subject}</span>
                          {campaign.postTitle !== campaign.subject && <span className="text-xs text-muted-foreground">{campaign.postTitle ?? 'Blog post removed'}</span>}
                        </NavLink>
                      </TableCell>
                      <TableCell className="px-5"><StatusBadge label={status.label} tone={status.tone} /></TableCell>
                      <TableCell className="hidden px-5 whitespace-nowrap md:table-cell">
                        {campaign.status === 'draft' ? <span className="text-muted-foreground">Not sent</span> : `${campaign.sentCount} of ${campaign.recipientCount ?? 0}`}
                      </TableCell>
                      <TableCell className="hidden px-5 whitespace-nowrap lg:table-cell">{formatDateTime(campaign.finishedAt ?? campaign.startedAt ?? campaign.updatedAt)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )
      ) : !subscribers.isPending && (subscribers.data?.subscribers.length ?? 0) === 0 ? (
        <EmptyState icon={Users} title={emptySubscribers[view].title} description={emptySubscribers[view].description} />
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="px-5">Email</TableHead>
                <TableHead className="px-5">Status</TableHead>
                <TableHead className="hidden px-5 md:table-cell">Since</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscribers.isPending && <LoadingRows columns={3} />}
              {subscribers.data?.subscribers.map((row) => {
                const status = statusStyle(subscriberStatus, row.status);
                return (
                  <TableRow key={row.id}>
                    <TableCell className="px-5 py-3 whitespace-normal">
                      <span className="grid">
                        <span className="font-semibold break-all">{row.email}</span>
                        {row.suppressionReason && <span className="text-xs text-muted-foreground">{row.suppressionReason}</span>}
                      </span>
                    </TableCell>
                    <TableCell className="px-5"><StatusBadge label={status.label} tone={status.tone} /></TableCell>
                    <TableCell className="hidden px-5 whitespace-nowrap md:table-cell">{subscriberDate(row)}</TableCell>
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
              <DialogTitle className="font-heading text-2xl">New newsletter email</DialogTitle>
              <DialogDescription>Choose the blog post to share. You can change the subject and add a short note next.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="campaign-post">Blog post</Label>
              <Select value={postId} onValueChange={setPostId}>
                <SelectTrigger id="campaign-post" className="w-full"><SelectValue placeholder={posts.isPending ? 'Loading posts…' : 'Choose a published post'} /></SelectTrigger>
                <SelectContent>
                  {published.map((post) => <SelectItem key={post.id} value={String(post.id)}>{post.title}</SelectItem>)}
                </SelectContent>
              </Select>
              {!posts.isPending && published.length === 0 && <p className="text-xs text-muted-foreground">Only published posts can be sent.</p>}
              {create.error && <p role="alert" className="text-sm text-destructive">{create.error instanceof ApiError ? create.error.message : 'Could not create the email.'}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={!postId || create.isPending}>{create.isPending ? 'Creating…' : 'Create draft'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LoadingRows({ columns }: { columns: number }) {
  return Array.from({ length: 3 }, (_, i) => (
    <TableRow key={i}><TableCell colSpan={columns} className="px-5 py-4"><Skeleton className="h-9 w-full" /></TableCell></TableRow>
  ));
}
