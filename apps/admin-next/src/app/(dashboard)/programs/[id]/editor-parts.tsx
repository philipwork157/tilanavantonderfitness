import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';

export function Panel({ title, titleId, hint, danger, children }: {
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

export function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
