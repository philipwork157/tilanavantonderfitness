'use client';

import { useQuery } from '@tanstack/react-query';
import { Inbox, Mail, MessageSquare, type LucideIcon } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { PageHeader } from '@/components/page-header';
import { RefreshButton } from '@/components/refresh-button';
import { StatTile, type TileTone } from '@/components/stat-tile';
import { api } from '@/lib/api';

interface OverviewData {
  inquiries: { active: number; new: number };
  newsletter: { subscribers: number };
}

/** Greeting by the time of day in South Africa. The server renders "Hello"; the browser fills in the rest. */
function greetingNow() {
  const hour = Number(new Intl.DateTimeFormat('en-ZA', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Africa/Johannesburg' }).format(new Date()));
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}
const noSubscribe = () => () => {};
function useGreeting() {
  return useSyncExternalStore(noSubscribe, greetingNow, () => 'Hello');
}

const tiles: { label: string; hint: string; icon: LucideIcon; tone: TileTone; href: string; value: (data: OverviewData) => number }[] = [
  { label: 'New enquiries', hint: 'Waiting for a first reply', icon: Inbox, tone: 'terracotta', href: '/inquiries', value: (d) => d.inquiries.new },
  { label: 'Open enquiries', hint: 'Everything not archived', icon: MessageSquare, tone: 'sand', href: '/inquiries', value: (d) => d.inquiries.active },
  { label: 'Newsletter subscribers', hint: 'Confirmed and subscribed', icon: Mail, tone: 'sage', href: '/newsletter?tab=subscribers', value: (d) => d.newsletter.subscribers },
];

export function Overview({ firstName }: { firstName: string | null }) {
  const greeting = useGreeting();
  const { data, error, isFetching, refetch } = useQuery({
    queryKey: ['overview'],
    queryFn: () => api<OverviewData>('/api/overview'),
  });

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        eyebrow="Overview"
        title={<>{greeting}{firstName ? ',' : '.'} {firstName && <em className="font-medium">{firstName}.</em>}</>}
        description="Here is what is happening on the website."
        actions={<RefreshButton loading={isFetching} onClick={() => refetch()} />}
      />
      {error ? (
        <div role="alert" className="rounded-2xl border-2 border-destructive/40 bg-destructive/10 p-6 text-sm font-medium text-destructive">{error.message}</div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((tile, index) => (
            <StatTile key={tile.label} index={index} href={tile.href} icon={tile.icon} tone={tile.tone} label={tile.label} hint={tile.hint} value={data ? tile.value(data) : undefined} />
          ))}
        </div>
      )}
    </div>
  );
}
