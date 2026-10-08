'use client';

import { ArrowUpRight, type LucideIcon } from 'lucide-react';
import { animate, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { NavLink } from '@/components/nav-link';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export type TileTone = 'terracotta' | 'sand' | 'sage' | 'caramel';

const toneClass: Record<TileTone, string> = {
  terracotta: 'bg-tone-terracotta',
  sand: 'bg-tone-sand',
  sage: 'bg-tone-sage',
  caramel: 'bg-tone-caramel',
};

/** Counts up to the value once it loads (skipped for reduced motion). */
function CountUp({ value, format = (n: number) => n.toLocaleString('en-ZA') }: { value: number; format?: (value: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (reduce) {
      node.textContent = format(value);
      return;
    }
    const controls = animate(0, value, {
      duration: 0.9,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => { node.textContent = format(Math.round(latest)); },
    });
    return () => controls.stop();
  }, [value, reduce, format]);
  return <span ref={ref}>{format(0)}</span>;
}

const MotionLink = motion.create(NavLink);

/** A big number with a label, linking to the list it counts. */
export function StatTile({ href, icon: Icon, tone, label, hint, value, format, index = 0, compact }: {
  href: string;
  icon: LucideIcon;
  tone: TileTone;
  label: string;
  hint: string;
  value: number | undefined;
  /** How the number is written, e.g. as rand. Keep it stable (module level). */
  format?: (value: number) => string;
  index?: number;
  compact?: boolean;
}) {
  const reduce = useReducedMotion();
  return (
    <MotionLink
      href={href}
      initial={reduce ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: index * 0.07, ease: [0.22, 1, 0.36, 1] }}
      whileHover={reduce ? undefined : { x: -3, y: -3 }}
      className={cn(
        'group relative flex flex-col justify-between overflow-hidden rounded-2xl border-2 border-foreground bg-card p-5 transition-shadow',
        'hover:shadow-[6px_6px_0_var(--hard-shadow)] focus-visible:shadow-[6px_6px_0_var(--hard-shadow)] focus-visible:outline-none',
        compact ? 'min-h-36' : 'min-h-44',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className={cn('grid size-11 place-items-center rounded-xl border-2 border-foreground text-on-tone', toneClass[tone])}>
          <Icon className="size-5" aria-hidden />
        </span>
        <ArrowUpRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
      </div>
      <div>
        <div className={cn('font-heading leading-none font-bold tracking-tight', compact ? 'text-4xl' : 'text-5xl')}>
          {value === undefined ? <Skeleton className="h-10 w-16" /> : <CountUp value={value} format={format} />}
        </div>
        <p className="mt-3 text-sm font-bold">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
    </MotionLink>
  );
}
