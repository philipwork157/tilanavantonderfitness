'use client';

import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function RefreshButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <Button variant="outline" className="rounded-full bg-card" onClick={onClick} disabled={loading}>
      <RefreshCw className={cn(loading && 'animate-spin')} aria-hidden /> Refresh
    </Button>
  );
}
