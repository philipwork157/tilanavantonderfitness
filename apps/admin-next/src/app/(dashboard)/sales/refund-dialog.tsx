'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api';
import { formatRand } from '@/lib/programs';
import type { AdminOrder } from '@/lib/types';
import { OrderSummary } from './order-summary';

/**
 * Refund a whole order through Paystack. Asks first (money goes back and it
 * can't be undone) and wants a short reason for the records.
 */
export function RefundDialog({ order, onOpenChange }: { order: AdminOrder | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={Boolean(order)} onOpenChange={onOpenChange}>
      <DialogContent>
        {order && <RefundForm key={order.orderNumber} order={order} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function RefundForm({ order, onDone }: { order: AdminOrder; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const valid = reason.trim().length >= 3;

  const refund = useMutation({
    mutationFn: () => api<{ status: string; refundStatus: string | null }>(`/api/orders/${order.orderNumber}/refund`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason.trim() }),
    }),
    onSuccess: ({ status }) => {
      toast.success(status === 'refunded' ? 'Refunded' : 'Refund requested', {
        description: status === 'refunded'
          ? `${formatRand(order.totalCents)} is on its way back to ${order.buyer}.`
          : 'Paystack is processing it. The order shows “Refunded” once Paystack confirms, and the buyer gets an email.',
      });
      void queryClient.invalidateQueries({ queryKey: ['sales'] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      onDone();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (valid && !refund.isPending) refund.mutate();
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle className="font-heading text-2xl">Refund this order?</DialogTitle>
        <DialogDescription>The full amount goes back to the card or account the buyer paid with. This can’t be undone.</DialogDescription>
      </DialogHeader>
      <OrderSummary order={order} amountLabel="Refund amount" />
      {order.testPayment && (
        <p className="rounded-lg border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-xs font-medium text-status-warning">
          Test payment: no real money moves.
        </p>
      )}
      <div className="grid gap-2">
        <Label htmlFor="refund-reason">Reason</Label>
        <Textarea id="refund-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={300} placeholder="e.g. Bought the wrong program by mistake" />
        <p className="text-xs text-muted-foreground">For your records and Paystack’s. The buyer does not see it.</p>
      </div>
      {refund.error && (
        <p role="alert" className="text-sm text-destructive">
          {refund.error instanceof ApiError ? refund.error.message : 'The refund could not be started. Please try again.'}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone} disabled={refund.isPending}>Keep the payment</Button>
        <Button type="submit" variant="destructive" disabled={!valid || refund.isPending}>
          {refund.isPending && <Loader2 className="animate-spin" />}
          {refund.isPending ? 'Refunding…' : `Refund ${formatRand(order.totalCents)}`}
        </Button>
      </DialogFooter>
    </form>
  );
}
