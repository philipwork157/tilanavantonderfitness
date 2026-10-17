import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppSidebar } from '@/components/app-sidebar';
import { ThemeToggle } from '@/components/theme-toggle';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { getAdmin } from '@/server/auth/admin';

// Rendered per request: the signed-in admin decides what (and whether) to show.
export const dynamic = 'force-dynamic';

/** Every dashboard page checks the admin on the server before anything renders. */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const admin = await getAdmin().catch(() => null);
  if (!admin) redirect('/login');

  return (
    <SidebarProvider>
      <AppSidebar user={admin} />
      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur md:px-6">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-5" />
          <span className="text-xs font-extrabold tracking-[0.18em] uppercase text-muted-foreground">Admin</span>
          <div className="ml-auto"><ThemeToggle /></div>
        </header>
        <div className="flex-1 p-4 md:p-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
