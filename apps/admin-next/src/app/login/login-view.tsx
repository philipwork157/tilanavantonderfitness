'use client';

import { adminLoginRequestSchema } from '@tilana/contracts/admin-auth';
import { Eye, EyeOff, Loader2, LockKeyhole } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useState, type SubmitEvent } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Wordmark } from '@/components/wordmark';
import { api, ApiError } from '@/lib/api';
import { useNavigate } from '@/lib/navigation-progress';
import { BrandCollage } from './brand-collage';

export function LoginView({ next }: { next: string }) {
  const router = useNavigate();
  const reduce = useReducedMotion();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = adminLoginRequestSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError('Enter your email address and password.');
      return;
    }
    setPending(true);
    setError('');
    try {
      await api('/api/auth/login', { method: 'POST', body: JSON.stringify(parsed.data) });
      router.replace(next);
      router.refresh();
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'Sign-in failed. Please try again.');
      setPending(false);
    }
  }

  const rise = (delay: number) => ({
    initial: reduce ? false : { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] as const },
  });

  return (
    <main className="grid min-h-svh lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel (large screens) */}
      <section className="@container relative hidden overflow-hidden border-r-2 border-foreground/90 bg-tone-terracotta text-on-tone lg:flex lg:flex-col lg:justify-between lg:p-12">
        <motion.div {...rise(0)}><Wordmark className="text-lg" /></motion.div>
        <div className="relative z-10 max-w-md">
          <motion.p {...rise(0.1)} className="mb-4 text-xs font-extrabold tracking-[0.22em] uppercase">Admin</motion.p>
          <motion.h1 {...rise(0.18)} className="font-heading text-6xl leading-[0.95] font-bold tracking-tight">
            Behind the <em className="font-medium">scenes.</em>
          </motion.h1>
          <motion.p {...rise(0.26)} className="mt-6 max-w-sm text-base leading-relaxed opacity-85">
            Enquiries, newsletters, blog posts and programs, all in one calm place.
          </motion.p>
        </div>
        <motion.p {...rise(0.34)} className="text-xs font-bold tracking-[0.2em] uppercase opacity-80">Real · Raw · Honest</motion.p>
        {/* Soft decorative rings */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -right-24 -bottom-24 size-[28rem] rounded-full border-2 border-current opacity-15"
          animate={reduce ? undefined : { scale: [1, 1.04, 1] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div aria-hidden className="pointer-events-none absolute -right-8 -bottom-8 size-[18rem] rounded-full border-2 border-dashed border-current opacity-20" />
        {/* A peek at what lives inside, when the panel is wide enough to keep it clear of the text. */}
        <BrandCollage className="absolute top-1/2 right-[4%] hidden origin-right -translate-y-1/2 scale-[0.72] @min-[40rem]:block @min-[44rem]:scale-[0.85] @min-[52rem]:scale-100" />
      </section>

      {/* Sign-in form */}
      <section className="relative flex flex-col items-center justify-center px-5 py-12 sm:px-10">
        <div className="absolute top-4 right-4"><ThemeToggle /></div>
        <motion.div {...rise(0.05)} className="w-full max-w-sm">
          <Wordmark className="mb-10 text-base lg:hidden" />
          <div className="mb-8">
            <span className="mb-5 grid size-12 place-items-center rounded-2xl border-2 border-foreground bg-card shadow-[4px_4px_0_var(--hard-shadow)]">
              <LockKeyhole className="size-5" aria-hidden />
            </span>
            <h2 className="font-heading text-4xl font-bold tracking-tight">Welcome back.</h2>
            <p className="mt-2 text-sm text-muted-foreground">Sign in with your admin email and password.</p>
          </div>

          <form onSubmit={submit} noValidate className="grid gap-5">
            <div className="grid gap-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email" type="email" autoComplete="username" required autoFocus
                value={email} onChange={(e) => setEmail(e.target.value)}
                className="h-11 bg-card" placeholder="you@example.com"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  className="h-11 bg-card pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-md text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {error && (
              <motion.p
                role="alert"
                initial={reduce ? false : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
              >
                {error}
              </motion.p>
            )}

            <Button type="submit" size="lg" disabled={pending} className="h-11 rounded-full text-xs font-extrabold tracking-[0.16em] uppercase">
              {pending ? <><Loader2 className="animate-spin" /> Signing in…</> : 'Sign in'}
            </Button>
          </form>
        </motion.div>
      </section>
    </main>
  );
}
