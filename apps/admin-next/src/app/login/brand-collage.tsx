'use client';

import { Mail, MessageSquare, Star } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Decorative collage for the login brand panel: little cards for what lives in
 * the admin (a blog post, an enquiry, a newsletter going out, a program stamp).
 * They drop in one by one, then float gently. Hidden from screen readers.
 */
export function BrandCollage({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('pointer-events-none relative h-[34rem] w-[26rem] select-none', className)}>
      <Piece className="top-6 left-0 z-10 w-64" rotate={-5} delay={0.35} float={7}>
        <Card>
          <div className="relative h-28 overflow-hidden rounded-lg border-2 border-foreground bg-tone-sage">
            <svg viewBox="0 0 220 96" className="absolute inset-0 size-full" preserveAspectRatio="none">
              <circle cx="168" cy="30" r="14" className="fill-tone-sand stroke-foreground" strokeWidth="2" />
              <path d="M0 96 L0 70 Q40 40 82 64 T160 58 Q196 50 220 66 L220 96 Z" className="fill-tone-caramel stroke-foreground" strokeWidth="2" />
              <path d="M0 96 L0 84 Q60 68 120 82 T220 80 L220 96 Z" className="fill-tone-terracotta stroke-foreground" strokeWidth="2" />
            </svg>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="rounded-full bg-status-success-bg px-2 py-0.5 text-[10px] font-bold text-status-success">Published</span>
            <span className="text-[10px] text-muted-foreground">Blog</span>
          </div>
          <p className="mt-2 font-heading text-lg leading-tight font-bold">Strong, not perfect.</p>
          <Lines widths={['w-full', 'w-3/4']} />
        </Card>
      </Piece>

      <Piece className="top-[13.75rem] right-0 z-20 w-60" rotate={4} delay={0.55} float={8.5}>
        <Card>
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full border-2 border-foreground bg-tone-sand text-xs font-bold text-on-tone">A</span>
            <span className="grid min-w-0">
              <span className="text-xs font-bold">New enquiry</span>
              <span className="text-[10px] text-muted-foreground">Private training</span>
            </span>
            <MessageSquare className="ml-auto size-4 text-muted-foreground" />
          </div>
          <Lines widths={['w-full', 'w-11/12', 'w-2/3']} />
          <span className="mt-3 inline-flex rounded-full bg-primary px-3 py-1 text-[10px] font-extrabold tracking-[0.14em] text-primary-foreground uppercase">Reply</span>
        </Card>
      </Piece>

      <Piece className="top-[24rem] left-6 z-30 w-64" rotate={-2} delay={0.75} float={6.5}>
        <Card>
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg border-2 border-foreground bg-tone-caramel text-on-tone">
              <Mail className="size-4" />
            </span>
            <span className="grid">
              <span className="text-xs font-bold">Sunday letter</span>
              <span className="text-[10px] text-muted-foreground">Newsletter</span>
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <SendingBar />
          </div>
          <p className="mt-1.5 text-[10px] font-semibold text-muted-foreground">Sending to subscribers</p>
        </Card>
      </Piece>

      <Piece className="top-0 right-4 z-40" rotate={12} delay={1} float={9}>
        <Stamp />
      </Piece>

      <Piece className="right-2 bottom-1 z-40" rotate={0} delay={1.25} float={7.5}>
        <span className="flex items-center gap-2 rounded-full border-2 border-on-tone bg-card px-3 py-1.5 text-[11px] font-bold text-card-foreground shadow-[3px_3px_0_var(--on-tone)]">
          <span className="size-2 rounded-full bg-status-success" />
          +3 new subscribers
        </span>
      </Piece>
    </div>
  );
}

/** Drops in at its tilt, then bobs up and down on its own rhythm. */
function Piece({ className, rotate, delay, float, children }: {
  className: string;
  rotate: number;
  delay: number;
  float: number;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={cn('absolute', className)}
      initial={reduce ? false : { opacity: 0, y: 40, rotate: rotate - 10, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, rotate, scale: 1 }}
      transition={{ type: 'spring', stiffness: 140, damping: 16, delay }}
    >
      <motion.div
        animate={reduce ? undefined : { y: [0, -9, 0] }}
        transition={{ duration: float, repeat: Infinity, ease: 'easeInOut', delay: delay + 0.8 }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-on-tone bg-card p-3.5 text-card-foreground shadow-[5px_5px_0_var(--on-tone)]">
      {children}
    </div>
  );
}

function Lines({ widths }: { widths: string[] }) {
  return (
    <div className="mt-2 grid gap-1.5">
      {widths.map((width, index) => <span key={index} className={cn('h-1.5 rounded-full bg-muted', width)} />)}
    </div>
  );
}

/** The newsletter progress bar fills, pauses, and starts again. */
function SendingBar() {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className="h-full origin-left rounded-full bg-primary"
      initial={{ scaleX: reduce ? 0.72 : 0 }}
      animate={reduce ? undefined : { scaleX: [0, 0.72, 1, 1] }}
      transition={{ duration: 6, times: [0, 0.55, 0.8, 1], repeat: Infinity, delay: 1.4, ease: 'easeInOut' }}
    />
  );
}

/** Round "Programs · Volume one" seal, turning slowly. */
function Stamp() {
  const reduce = useReducedMotion();
  return (
    <div className="relative grid size-28 place-items-center rounded-full border-2 border-on-tone bg-tone-sage text-on-tone shadow-[4px_4px_0_var(--on-tone)]">
      <motion.svg
        viewBox="0 0 100 100"
        className="absolute inset-0 size-full"
        animate={reduce ? undefined : { rotate: 360 }}
        transition={{ duration: 28, repeat: Infinity, ease: 'linear' }}
      >
        <defs>
          <path id="collage-stamp-ring" d="M50 50 m-36 0 a36 36 0 1 1 72 0 a36 36 0 1 1 -72 0" />
        </defs>
        <text className="fill-current text-[10.5px] font-extrabold tracking-[0.2em] uppercase">
          <textPath href="#collage-stamp-ring" textLength="224" lengthAdjust="spacing">Programs · Volume one ·</textPath>
        </text>
      </motion.svg>
      <span className="flex gap-0.5">
        <Star className="size-3 fill-current" />
        <Star className="size-4 -translate-y-1 fill-current" />
        <Star className="size-3 fill-current" />
      </span>
    </div>
  );
}
