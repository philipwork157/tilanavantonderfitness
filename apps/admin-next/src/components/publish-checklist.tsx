import { CircleCheck, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * "Before you can publish": what is still missing, ticked off while typing,
 * so publishing never ends in a surprise error. Shown on drafts only.
 */
export function PublishChecklist({ items }: { items: { label: string; done: boolean }[] }) {
  const ready = items.every((item) => item.done);
  return (
    <section aria-labelledby="checklist-heading" className={cn('grid gap-3 rounded-2xl border p-5', ready ? 'border-status-success/40 bg-status-success-bg' : 'bg-card')}>
      <h2 id="checklist-heading" className="text-sm font-extrabold tracking-[0.14em] uppercase">{ready ? 'Ready to publish' : 'Before you can publish'}</h2>
      {ready && <p className="-mt-1 text-xs text-status-success">Everything is filled in. Press Publish when you are happy with it.</p>}
      <ul className="grid gap-2 text-sm">
        {items.map((item) => (
          <li key={item.label} className={cn('flex items-start gap-2', item.done ? 'text-muted-foreground' : 'font-medium')}>
            {item.done
              ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-status-success" aria-hidden />
              : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />}
            <span>{item.label}<span className="sr-only">{item.done ? ' (done)' : ' (still to do)'}</span></span>
          </li>
        ))}
      </ul>
    </section>
  );
}
