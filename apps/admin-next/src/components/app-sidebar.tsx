'use client';

import type { AdminUser } from '@tilana/contracts/admin-auth';
import { ChartNoAxesCombined, Dumbbell, Globe, LayoutDashboard, Loader2, Mail, MessageSquare, Newspaper, type LucideIcon } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { NavLink } from '@/components/nav-link';
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail, useSidebar,
} from '@/components/ui/sidebar';
import { UserMenu } from '@/components/user-menu';
import { Wordmark } from '@/components/wordmark';
import { usePendingNavigation } from '@/lib/navigation-progress';

const navigation: { title: string; href: string; icon: LucideIcon }[] = [
  { title: 'Overview', href: '/', icon: LayoutDashboard },
  { title: 'Inquiries', href: '/inquiries', icon: MessageSquare },
  { title: 'Newsletter', href: '/newsletter', icon: Mail },
  { title: 'Blog', href: '/blog', icon: Newspaper },
  { title: 'Programs', href: '/programs', icon: Dumbbell },
  { title: 'Sales', href: '/sales', icon: ChartNoAxesCombined },
  { title: 'Website', href: '/website', icon: Globe },
];

const isActive = (pathname: string, href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`));

export function AppSidebar({ user }: { user: AdminUser }) {
  const pathname = usePathname();
  const pending = usePendingNavigation();
  // While a page loads, highlight where the admin is going, not where they were.
  const current = pending ? pending.split('?')[0] : pathname;
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-16 justify-center border-b px-4 group-data-[collapsible=icon]:px-2">
        <NavLink href="/" className="flex items-center gap-2" aria-label="Tilana admin home">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary font-heading text-base font-bold text-primary-foreground italic">T</span>
          <Wordmark className="text-xs group-data-[collapsible=icon]:hidden" />
        </NavLink>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Admin</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item) => {
                const loading = pending !== null && isActive(current, item.href) && !isActive(pathname, item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive(current, item.href)} tooltip={item.title} aria-busy={loading || undefined}>
                      {/* On phones the menu is a drawer: close it after choosing a page. */}
                      <NavLink href={item.href} onClick={() => { if (isMobile) setOpenMobile(false); }}>
                        {/* The icon turns into a spinner while that page loads (same size, so nothing shifts). */}
                        {loading ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <item.icon />}
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t">
        <UserMenu user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
