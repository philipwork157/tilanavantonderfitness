'use client';

import type { InquiryView } from '@tilana/contracts/admin-inquiries';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, ArrowUpRight, Inbox, MailX, Reply } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { RefreshButton } from '@/components/refresh-button';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { formatDate, formatDateTime, plural } from '@/lib/format';
import { formatRand } from '@/lib/programs';
import { NavLink } from '@/components/nav-link';
import type { AdminOrder } from '@/lib/types';
import { inquiryStatus, orderDeliveryStatus, orderRefundStatus, orderStatus, statusStyle } from '@/lib/status';

interface Inquiry {
  id: number;
  name: string;
  email: string;
  interestLabel: string;
  message: string;
  /** Order, payment or refund enquiries only. */
  orderTopic: string | null;
  orderTopicLabel: string | null;
  orderNumber: string | null;
  purchaseEmail: string | null;
  status: string;
  privacyAcceptedAt: string;
  notifiedAt: string | null;
  notificationError: string | null;
  createdAt: string;
}

interface OrderMatch {
  matchedBy: 'order-number' | 'email' | 'none';
  orderNumberNotFound: boolean;
  orders: AdminOrder[];
}

function replyLink(inquiry: Inquiry) {
  const about = inquiry.orderTopicLabel
    ? `${inquiry.orderNumber ? `${inquiry.orderNumber}: ` : ''}${inquiry.orderTopicLabel}`
    : `your enquiry about ${inquiry.interestLabel}`;
  return `mailto:${inquiry.email}?subject=${encodeURIComponent(`Re: ${about}`)}`;
}

export function InquiriesView() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<InquiryView>('active');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data, isPending, isFetching, refetch } = useQuery({
    queryKey: ['inquiries', view],
    queryFn: () => api<{ inquiries: Inquiry[] }>(`/api/inquiries?view=${view}`),
  });
  const rows = data?.inquiries ?? [];
  const selected = rows.find((row) => row.id === selectedId) ?? null;

  /** Archive hides an enquiry from the active list; restore brings it back. Nothing is deleted. */
  const archive = useMutation({
    mutationFn: ({ inquiry, archived }: { inquiry: Inquiry; archived: boolean }) =>
      api(`/api/inquiries/${inquiry.id}`, { method: 'PATCH', body: JSON.stringify({ status: archived ? 'archived' : 'new' }) }),
    onSuccess: (_result, { inquiry, archived }) => {
      if (selectedId === inquiry.id) setSelectedId(null);
      toast.success(archived ? 'Enquiry archived' : 'Enquiry restored', { description: inquiry.name });
      void queryClient.invalidateQueries({ queryKey: ['inquiries'] });
      void queryClient.invalidateQueries({ queryKey: ['overview'] });
    },
    onError: () => toast.error('Could not update the enquiry', { description: 'Please try again.' }),
  });
  const busyId = archive.isPending ? archive.variables?.inquiry.id : null;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        eyebrow="Website"
        title="Inquiries"
        description="Messages from the website contact form."
        actions={<RefreshButton loading={isFetching} onClick={() => refetch()} />}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={view} onValueChange={(value) => setView(value as InquiryView)}>
          <TabsList>
            <TabsTrigger value="active"><Inbox /> Active</TabsTrigger>
            <TabsTrigger value="archived"><Archive /> Archived</TabsTrigger>
          </TabsList>
        </Tabs>
        {rows.length > 0 && <p className="text-sm text-muted-foreground tabular-nums">{plural(rows.length, 'inquiry', 'inquiries')}</p>}
      </div>

      {!isPending && rows.length === 0 ? (
        <EmptyState
          icon={view === 'archived' ? Archive : Inbox}
          title={view === 'archived' ? 'Nothing archived' : 'No inquiries yet'}
          description={view === 'archived'
            ? 'Archived enquiries are kept here. Restore one to move it back to Active.'
            : 'Messages sent through the website contact form will appear here.'}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="hidden px-5 md:table-cell">Received</TableHead>
                <TableHead className="px-5">Name</TableHead>
                <TableHead className="hidden px-5 md:table-cell">Interested in</TableHead>
                <TableHead className="px-5">Status</TableHead>
                <TableHead className="w-12 px-3"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending && Array.from({ length: 4 }, (_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5} className="px-5 py-4"><Skeleton className="h-9 w-full" /></TableCell>
                </TableRow>
              ))}
              {rows.map((inquiry) => {
                const status = statusStyle(inquiryStatus, inquiry.status);
                const archived = inquiry.status === 'archived';
                return (
                  <TableRow key={inquiry.id} className="cursor-pointer" onClick={() => setSelectedId(inquiry.id)}>
                    <TableCell className="hidden px-5 py-4 whitespace-nowrap md:table-cell">{formatDateTime(inquiry.createdAt)}</TableCell>
                    <TableCell className="px-5 py-4 whitespace-normal">
                      <button
                        type="button"
                        className="grid text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                        onClick={(event) => { event.stopPropagation(); setSelectedId(inquiry.id); }}
                      >
                        <span className="font-semibold">{inquiry.name}</span>
                        <span className="text-sm text-muted-foreground">{inquiry.email}</span>
                        <span className="text-xs text-muted-foreground md:hidden">{formatDateTime(inquiry.createdAt)}</span>
                      </button>
                    </TableCell>
                    <TableCell className="hidden px-5 py-4 whitespace-normal md:table-cell">
                      <span className="grid">
                        <span>{inquiry.orderTopicLabel ?? inquiry.interestLabel}</span>
                        {inquiry.orderTopicLabel && <span className="text-xs text-muted-foreground">{inquiry.orderNumber ?? 'No order number'}</span>}
                      </span>
                    </TableCell>
                    <TableCell className="px-5 py-4">
                      <div className="flex flex-wrap gap-1">
                        <StatusBadge label={status.label} tone={status.tone} />
                        {inquiry.notificationError && <StatusBadge label="Email not sent" tone="danger" icon={MailX} />}
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-4 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={busyId === inquiry.id}
                        aria-label={archived ? `Restore enquiry from ${inquiry.name}` : `Archive enquiry from ${inquiry.name}`}
                        onClick={(event) => { event.stopPropagation(); archive.mutate({ inquiry, archived: !archived }); }}
                      >
                        {archived ? <ArchiveRestore /> : <Archive />}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Sheet open={selected !== null} onOpenChange={(open) => { if (!open) setSelectedId(null); }}>
        <SheetContent className="w-full sm:max-w-lg">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="font-heading text-2xl">{selected.name}</SheetTitle>
                <SheetDescription>Received {formatDateTime(selected.createdAt)}</SheetDescription>
              </SheetHeader>
              <dl className="grid flex-1 content-start gap-5 overflow-y-auto px-4">
                <Detail label="Email"><a className="text-brand-text underline underline-offset-4" href={`mailto:${selected.email}`}>{selected.email}</a></Detail>
                <Detail label="Interested in">{selected.interestLabel}</Detail>
                {selected.orderTopicLabel && (
                  <>
                    <Detail label="Needs help with"><span className="font-semibold">{selected.orderTopicLabel}</span></Detail>
                    <Detail label="Order number">{selected.orderNumber ?? <span className="text-muted-foreground">Not given</span>}</Detail>
                    {selected.purchaseEmail && selected.purchaseEmail !== selected.email && <Detail label="Bought with">{selected.purchaseEmail}</Detail>}
                    <Detail label="Order"><InquiryOrder inquiry={selected} /></Detail>
                  </>
                )}
                <Detail label="Privacy policy accepted">{formatDateTime(selected.privacyAcceptedAt)}</Detail>
                <Detail label="Email to Tilana">
                  {selected.notifiedAt
                    ? `Sent ${formatDateTime(selected.notifiedAt)}`
                    : <span className="text-destructive">Not sent{selected.notificationError ? `: ${selected.notificationError}` : ''}</span>}
                </Detail>
                <Detail label="Message">
                  {selected.message
                    ? <span className="whitespace-pre-wrap leading-relaxed">{selected.message}</span>
                    : <span className="text-muted-foreground">No message. The topic says what they need.</span>}
                </Detail>
              </dl>
              <SheetFooter className="flex-row flex-wrap">
                <Button asChild className="rounded-full">
                  <a href={replyLink(selected)}><Reply /> Reply by email</a>
                </Button>
                <Button
                  variant="outline"
                  className="rounded-full"
                  disabled={busyId === selected.id}
                  onClick={() => archive.mutate({ inquiry: selected, archived: selected.status !== 'archived' })}
                >
                  {selected.status === 'archived' ? <><ArchiveRestore /> Restore</> : <><Archive /> Archive</>}
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** The order this enquiry is about: by its order number, or else the latest orders for their email. */
function InquiryOrder({ inquiry }: { inquiry: Inquiry }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ['inquiry-order', inquiry.id],
    queryFn: () => api<{ match: OrderMatch | null }>(`/api/inquiries/${inquiry.id}`),
  });
  if (isPending) return <Skeleton className="h-20 w-full" />;
  if (isError || !data?.match) return <span className="text-muted-foreground">Could not look up the order.</span>;
  const { match } = data;
  return (
    <div className="grid gap-2">
      {match.orderNumberNotFound && (
        <p className="text-sm text-status-warning">No order {inquiry.orderNumber} exists{match.orders.length ? '. These orders use their email:' : '.'}</p>
      )}
      {match.matchedBy === 'email' && !match.orderNumberNotFound && (
        <p className="text-sm text-muted-foreground">{match.orders.length === 1 ? 'Found by their email:' : `Latest ${match.orders.length} orders for their email:`}</p>
      )}
      {match.matchedBy === 'none' && (
        <p className="text-sm text-muted-foreground">No orders for {inquiry.purchaseEmail ?? inquiry.email}. They may have bought with another email; ask them for the order number.</p>
      )}
      {match.orders.map((order) => {
        const status = statusStyle(orderStatus, order.status);
        const delivery = order.status === 'paid' ? statusStyle(orderDeliveryStatus, order.deliveryStatus) : null;
        const refund = order.refundStatus && order.refundStatus !== 'processed' ? statusStyle(orderRefundStatus, order.refundStatus) : null;
        return (
          <div key={order.orderNumber} className="grid gap-1.5 rounded-xl border bg-muted/30 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold tabular-nums">{order.orderNumber}</span>
              <span className="font-semibold tabular-nums">{formatRand(order.totalCents)}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              <StatusBadge label={status.label} tone={status.tone} />
              {delivery && <StatusBadge label={delivery.label} tone={delivery.tone} />}
              {refund && <StatusBadge label={refund.label} tone={refund.tone} />}
              {order.testPayment && <StatusBadge label="Test" tone="neutral" />}
            </div>
            <p className="text-muted-foreground">{order.programs.join(', ') || 'No programs'} · {formatDate(order.paidAt ?? order.createdAt)}</p>
            {order.email !== inquiry.email && <p className="text-xs text-muted-foreground">Bought with {order.email}</p>}
            <NavLink href={`/sales?q=${encodeURIComponent(order.orderNumber)}`} className="inline-flex items-center gap-1 justify-self-start font-semibold text-brand-text underline underline-offset-4">
              Open in Sales <ArrowUpRight className="size-3.5" aria-hidden />
            </NavLink>
          </div>
        );
      })}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="mb-1 text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}
