import type { LucideIcon } from 'lucide-react';
import type { StatusTone } from '@/lib/status';
import { cn } from '@/lib/utils';

const tones: Record<StatusTone, string> = {
  neutral: 'text-status-neutral bg-status-neutral-bg',
  brand: 'text-status-brand bg-status-brand-bg',
  success: 'text-status-success bg-status-success-bg',
  warning: 'text-status-warning bg-status-warning-bg',
  danger: 'text-status-danger bg-status-danger-bg',
  info: 'text-status-info bg-status-info-bg',
};

/** A status pill: a dot (or icon) and a short label, coloured by tone. */
export function StatusBadge({ label, tone = 'neutral', icon: Icon, className }: {
  label: string;
  tone?: StatusTone;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border border-current/20 px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', tones[tone], className)}>
      {Icon ? <Icon className="size-3.5" aria-hidden /> : <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {label}
    </span>
  );
}
