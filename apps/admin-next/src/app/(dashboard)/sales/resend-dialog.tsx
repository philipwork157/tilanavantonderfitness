'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiError } from '@/lib/api';
import type { AdminOrder } from '@/lib/types';
import { OrderSummary } from './order-summary';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * "Email the PDFs again" for a paid order: the same delivery email, with the
 * PDFs attached, to the buyer or to a corrected address.
 */
export function ResendDialog({ order, onOpenChange }: { order: AdminOrder | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={Boolean(order)} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Keyed so the form starts fresh for every order. */}
        {order && <ResendForm key={order.orderNumber} order={order} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function ResendForm({ order, onDone }: { order: AdminOrder; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState(order.email);
  const valid = emailPattern.test(email.trim());
  const changed = email.trim().toLowerCase() !== order.email;

  const resend = useMutation({
    mutationFn: () => api<{ sentTo: string }>(`/api/orders/${order.orderNumber}/resend`, {
      method: 'POST',
      body: JSON.stringify({ email: changed ? email.trim() : '' }),
    }),
    onSuccess: ({ sentTo }) => {
      toast.success('PDFs sent', { description: `Emailed to ${sentTo}.` });
      void queryClient.invalidateQueries({ queryKey: ['sales'] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      onDone();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (valid && !resend.isPending) resend.mutate();
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle className="font-heading text-2xl">Email the PDFs again</DialogTitle>
        <DialogDescription>The buyer gets the same email as after paying, with the PDFs attached.</DialogDescription>
      </DialogHeader>
      <OrderSummary order={order} />
      <div className="grid gap-2">
        <Label htmlFor="resend-email">Send to</Label>
        <Input id="resend-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!valid} autoComplete="off" />
        <p className="text-xs text-muted-foreground">
          {changed
            ? 'A different address: use it if the buyer mistyped theirs. The order keeps the original address.'
            : 'The address the buyer used at checkout.'}
        </p>
      </div>
      {resend.error && (
        <p role="alert" className="text-sm text-destructive">
          {resend.error instanceof ApiError ? resend.error.message : 'The PDFs could not be sent. Please try again.'}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone} disabled={resend.isPending}>Cancel</Button>
        <Button type="submit" disabled={!valid || resend.isPending}>
          {resend.isPending && <Loader2 className="animate-spin" />}
          {resend.isPending ? 'Sending…' : 'Send PDFs'}
        </Button>
      </DialogFooter>
    </form>
  );
}
