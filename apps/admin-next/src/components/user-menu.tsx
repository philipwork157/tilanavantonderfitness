'use client';

import type { AdminUser } from '@tilana/contracts/admin-auth';
import { ChevronsUpDown, LogOut, Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';
import { api } from '@/lib/api';
import { useNavigate } from '@/lib/navigation-progress';
import { useTheme } from '@/lib/theme';

function displayName(user: AdminUser) {
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
}

function initials(user: AdminUser) {
  const name = [user.firstName, user.lastName].filter(Boolean);
  const source = name.length ? name : [user.email];
  return source.map((part) => part?.[0] ?? '').join('').slice(0, 2).toUpperCase();
}

export function UserMenu({ user }: { user: AdminUser }) {
  const router = useNavigate();
  const { isMobile } = useSidebar();
  const { resolvedTheme, setTheme } = useTheme();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      toast.error('Could not reach the server, but you are signed out on this browser.');
    }
    router.replace('/login');
    router.refresh();
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
              <Avatar className="size-8 rounded-lg border-2 border-foreground">
                <AvatarFallback className="rounded-lg bg-tone-sage text-xs font-bold text-on-tone">{initials(user)}</AvatarFallback>
              </Avatar>
              <span className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-bold">{displayName(user)}</span>
                <span className="truncate text-xs text-muted-foreground">{user.email}</span>
              </span>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side={isMobile ? 'bottom' : 'right'} align="end" sideOffset={8} className="min-w-56 rounded-xl">
            <DropdownMenuLabel className="font-normal">
              <span className="block truncate text-sm font-bold">{displayName(user)}</span>
              <span className="block truncate text-xs text-muted-foreground">{user.roles.join(' · ')}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
              {resolvedTheme === 'dark' ? <Sun /> : <Moon />}
              {resolvedTheme === 'dark' ? 'Light mode' : 'Dark mode'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={signOut} disabled={signingOut}>
              <LogOut /> {signingOut ? 'Signing out…' : 'Sign out'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
