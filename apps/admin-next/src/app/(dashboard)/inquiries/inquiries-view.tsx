'use client';

import type { InquiryView } from '@tilana/contracts/admin-inquiries';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Inbox, MailX, Reply } from 'lucide-react';
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
import { formatDateTime, plural } from '@/lib/format';
import { inquiryStatus, statusStyle } from '@/lib/status';

interface Inquiry {
  id: number;
  name: string;
  email: string;
  interestLabel: string;
  message: string;
  status: string;
  privacyAcceptedAt: string;
  notifiedAt: string | null;
  notificationError: string | null;
  createdAt: string;
}

function replyLink(inquiry: Inquiry) {
  return `mailto:${inquiry.email}?subject=${encodeURIComponent(`Re: your enquiry about ${inquiry.interestLabel}`)}`;
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
                    <TableCell className="hidden px-5 py-4 md:table-cell">{inquiry.interestLabel}</TableCell>
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
                <Detail label="Privacy policy accepted">{formatDateTime(selected.privacyAcceptedAt)}</Detail>
                <Detail label="Email to Tilana">
                  {selected.notifiedAt
                    ? `Sent ${formatDateTime(selected.notifiedAt)}`
                    : <span className="text-destructive">Not sent{selected.notificationError ? `: ${selected.notificationError}` : ''}</span>}
                </Detail>
                <Detail label="Message"><span className="whitespace-pre-wrap leading-relaxed">{selected.message}</span></Detail>
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

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="mb-1 text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}
