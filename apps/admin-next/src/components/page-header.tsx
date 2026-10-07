import type { ReactNode } from 'react';

/** Top of every admin page: small label, serif title, optional description and actions. */
export function PageHeader({ eyebrow, title, description, actions }: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 md:mb-8">
      <div className="min-w-0">
        {eyebrow && <p className="mb-2 text-xs font-extrabold tracking-[0.2em] text-brand-text uppercase">{eyebrow}</p>}
        <h1 className="font-heading text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
