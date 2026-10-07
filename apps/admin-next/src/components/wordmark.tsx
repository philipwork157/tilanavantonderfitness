import { cn } from '@/lib/utils';

/** "TILANA van Tonder", as on the website header. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-baseline gap-2 font-extrabold tracking-[0.18em] uppercase', className)}>
      TILANA
      <span className="font-heading text-[0.85em] font-medium tracking-normal normal-case italic text-brand-text">van Tonder</span>
    </span>
  );
}
