import { StatusBadge } from '@/components/status-badge';
import { formatRand } from '@/lib/programs';
import type { AdminOrder } from '@/lib/types';

/**
 * The order at a glance inside a dialog: who bought it, the order number,
 * one line per program (name, then volume) and, when given, the amount.
 */
export function OrderSummary({ order, amountLabel }: { order: AdminOrder; amountLabel?: string }) {
  const count = order.programs.length;
  return (
    <div className="grid overflow-hidden rounded-xl border bg-card text-sm">
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="font-semibold">{order.buyer}</p>
          <p className="truncate text-xs text-muted-foreground">{order.email}</p>
        </div>
        <div className="grid shrink-0 justify-items-end gap-1">
          <span className="font-mono text-xs font-semibold tracking-wide">{order.orderNumber}</span>
          {order.testPayment && <StatusBadge label="Test" tone="warning" />}
        </div>
      </div>

      <div className="border-t px-4 py-3">
        <p className="mb-2 text-[0.68rem] font-extrabold tracking-[0.14em] text-muted-foreground uppercase">
          {count} program{count === 1 ? '' : 's'}
        </p>
        <ul className="grid max-h-44 gap-1.5 overflow-y-auto pr-1">
          {order.programs.map((label) => {
            const [name, volume] = label.split(' · ');
            return (
              <li key={label} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate font-medium">{name}</span>
                {volume && <span className="shrink-0 text-xs text-muted-foreground">{volume}</span>}
              </li>
            );
          })}
        </ul>
      </div>

      {amountLabel && (
        <div className="flex items-baseline justify-between gap-3 border-t bg-muted/40 px-4 py-3">
          <span className="font-semibold">{amountLabel}</span>
          <span className="font-heading text-2xl font-bold tabular-nums">{formatRand(order.totalCents)}</span>
        </div>
      )}
    </div>
  );
}
