import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** Friendly placeholder for an empty list. */
export function EmptyState({ icon: Icon, title, description, children }: {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <section aria-label={title} className="grid justify-items-center gap-2 rounded-2xl border bg-card px-6 py-14 text-center">
      <span className="mb-2 grid size-12 place-items-center rounded-full bg-secondary text-brand-text" aria-hidden>
        <Icon className="size-5" />
      </span>
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="max-w-[40ch] text-sm text-muted-foreground">{description}</p>
      {children}
    </section>
  );
}
