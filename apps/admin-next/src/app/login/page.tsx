import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAdmin } from '@/server/auth/admin';
import { safeRedirectPath } from '@/lib/safe-redirect';
import { LoginView } from './login-view';

export const metadata: Metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeRedirectPath((await searchParams).next);
  // Already signed in: straight to the dashboard. Config or database problems show the form instead.
  const admin = await getAdmin().catch(() => null);
  if (admin) redirect(next);
  return <LoginView next={next} />;
}
