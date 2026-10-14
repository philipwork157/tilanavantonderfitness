'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Mail, Search, ShoppingBag, TriangleAlert, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { useDeferredValue, useState } from 'react';
import { EmptyState } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { formatRand } from '@/lib/programs';
import { orderDeliveryStatus, orderRefundStatus, orderStatus, statusStyle } from '@/lib/status';
import type { AdminOrder } from '@/lib/types';
import { RefundDialog } from './refund-dialog';
import { ResendDialog } from './resend-dialog';

/**
 * The latest orders, or (while searching) any order by number, email or name,
 * with "Email PDFs again" and "Refund" on paid orders and "Mark as checked"
 * on orders that need a person.
 */
export function OrdersSection({ recent, loading, period }: { recent: AdminOrder[] | undefined; loading: boolean; period: string }) {
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query.trim());
  const searching = deferred.length >= 2;
  const search = useQuery({
    queryKey: ['orders', deferred],
    queryFn: () => api<{ orders: AdminOrder[] }>(`/api/orders?q=${encodeURIComponent(deferred)}`),
    enabled: searching,
    placeholderData: (previous) => previous,
  });
  const [resending, setResending] = useState<AdminOrder | null>(null);
  const [refunding, setRefunding] = useState<AdminOrder | null>(null);
  // Orders whose refund was just requested: their Refund button hides at once,
  // before the list reloads, so it can't be clicked again. It comes back only
  // if Paystack later reports the refund failed.
  const [refundRequested, setRefundRequested] = useState<ReadonlySet<string>>(new Set());
  const queryClient = useQueryClient();
  const markChecked = useMutation({
    mutationFn: (orderNumber: string) => api(`/api/orders/${orderNumber}/review`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Marked as checked');
      void queryClient.invalidateQueries({ queryKey: ['sales'] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: () => toast.error('Not changed', { description: 'Please try again.' }),
  });

  const rows = searching ? search.data?.orders : recent;
  const pending = searching ? search.isPending : loading;

  return (
    <section aria-labelledby="sales-orders">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <h2 id="sales-orders" className="text-sm font-extrabold tracking-[0.14em] uppercase">{searching ? 'Search results' : 'Latest orders'}</h2>
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Order number, email or name"
            aria-label="Find an order by order number, email or name"
            className="bg-card pl-9"
          />
        </div>
      </div>

      {!pending && rows?.length === 0 ? (
        searching
          ? <EmptyState icon={Search} title="No orders found" description={`Nothing matches “${deferred}”. Try the order number (TV-…) or part of the email address.`} />
          : <EmptyState icon={ShoppingBag} title="No orders yet" description={`Nobody has checked out in the last ${period}. Search to find older orders.`} />
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="px-5">Order</TableHead>
                <TableHead className="hidden px-5 md:table-cell">Programs</TableHead>
                <TableHead className="hidden px-5 text-right sm:table-cell">Amount</TableHead>
                <TableHead className="px-5">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending && Array.from({ length: 3 }, (_, i) => (
                <TableRow key={i}><TableCell colSpan={4} className="px-5 py-4"><Skeleton className="h-10 w-full" /></TableCell></TableRow>
              ))}
              {!pending && rows?.map((order) => {
                const status = statusStyle(orderStatus, order.status);
                const delivery = statusStyle(orderDeliveryStatus, order.deliveryStatus);
                const refund = order.status === 'paid' && order.refundStatus && order.refundStatus !== 'processed' ? statusStyle(orderRefundStatus, order.refundStatus) : null;
                return (
                  <TableRow key={order.orderNumber}>
                    <TableCell className="px-5 py-3 whitespace-normal">
                      <span className="grid">
                        <span className="font-semibold">{order.buyer} <span className="font-normal text-muted-foreground">· {order.orderNumber}</span></span>
                        <span className="text-xs break-words text-muted-foreground">{order.email} · {formatDateTime(order.paidAt ?? order.createdAt)}</span>
                        <span className="text-xs text-muted-foreground md:hidden">{order.programs.join(', ')}<span className="font-semibold text-foreground sm:hidden"> · {formatRand(order.totalCents)}</span></span>
                      </span>
                    </TableCell>
                    <TableCell className="hidden px-5 text-sm whitespace-normal md:table-cell">{order.programs.join(', ')}</TableCell>
                    <TableCell className="hidden px-5 text-right tabular-nums sm:table-cell">
                      <span className="block font-semibold">{formatRand(order.totalCents)}</span>
                      {order.feeCents !== null && <span className="block text-xs text-muted-foreground">fee {formatRand(order.feeCents)}</span>}
                    </TableCell>
                    <TableCell className="px-5 py-3 whitespace-normal">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge label={status.label} tone={status.tone} />
                        {order.status === 'paid' && <StatusBadge label={delivery.label} tone={delivery.tone} />}
                        {refund && <StatusBadge label={refund.label} tone={refund.tone} />}
                        {order.reviewNote && <StatusBadge label="Needs review" tone="warning" icon={TriangleAlert} />}
                        {order.testPayment && <StatusBadge label="Test" tone="warning" />}
                      </span>
                      {order.deliveryError && order.deliveryStatus !== 'sent' && <span className="mt-1 block text-xs text-destructive">{order.deliveryError}</span>}
                      {order.reviewNote && <span className="mt-1 block max-w-md text-xs text-status-warning">{order.reviewNote}</span>}
                      {order.status === 'refunded' && order.refundReason && <span className="mt-1 block text-xs text-muted-foreground">Refund: {order.refundReason}</span>}
                      <span className="mt-2 flex flex-wrap gap-1.5">
                        {order.status === 'paid' && (
                          <Button variant="outline" size="sm" onClick={() => setResending(order)}>
                            <Mail aria-hidden /> Email PDFs again
                          </Button>
                        )}
                        {order.status === 'paid' && order.refundStatus !== 'pending' && !(refundRequested.has(order.orderNumber) && order.refundStatus !== 'failed') && (
                          <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setRefunding(order)}>
                            <Undo2 aria-hidden /> Refund
                          </Button>
                        )}
                        {order.reviewNote && (
                          <Button variant="ghost" size="sm" disabled={markChecked.isPending} onClick={() => markChecked.mutate(order.orderNumber)}>
                            <Check aria-hidden /> Mark as checked
                          </Button>
                        )}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <ResendDialog order={resending} onOpenChange={(open) => { if (!open) setResending(null); }} />
      <RefundDialog
        order={refunding}
        onOpenChange={(open) => { if (!open) setRefunding(null); }}
        onRequested={(orderNumber) => setRefundRequested(previous => new Set(previous).add(orderNumber))}
      />
    </section>
  );
}
