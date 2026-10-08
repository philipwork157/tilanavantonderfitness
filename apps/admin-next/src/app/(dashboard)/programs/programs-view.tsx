'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Layers, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/empty-state';
import { NavLink } from '@/components/nav-link';
import { PageHeader } from '@/components/page-header';
import { RefreshButton } from '@/components/refresh-button';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, ApiError } from '@/lib/api';
import { useNavigate } from '@/lib/navigation-progress';
import type { AdminVolume } from '@/lib/types';
import { VolumeSwitch } from './volume-switch';

const message = (error: unknown, fallback: string) => (error instanceof ApiError ? error.message : fallback);

/** Programs → the volumes. Each volume holds its own programs and can be switched on or off. */
export function ProgramsView() {
  const router = useNavigate();
  const queryClient = useQueryClient();
  const { data, isPending, isFetching, refetch } = useQuery({
    queryKey: ['volumes'],
    queryFn: () => api<{ volumes: AdminVolume[] }>('/api/volumes'),
  });
  const volumes = data?.volumes ?? [];

  const create = useMutation({
    mutationFn: () => api<{ volume: AdminVolume }>('/api/volumes', { method: 'POST' }),
    onSuccess: ({ volume }) => {
      void queryClient.invalidateQueries({ queryKey: ['volumes'] });
      toast.success(`${volume.name} added`, { description: 'It is switched off until you are ready. Add its programs first.' });
      router.push(`/programs/volumes/${volume.id}`);
    },
    onError: (error) => toast.error('Not added', { description: message(error, 'Please try again.') }),
  });

  const addButton = (
    <Button className="rounded-full" disabled={create.isPending} onClick={() => create.mutate()}>
      {create.isPending ? <Loader2 className="animate-spin" /> : <Plus />} Add new volume
    </Button>
  );

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        eyebrow="Shop"
        title="Programs"
        description="Programs are grouped in volumes. Open a volume to add its programs. A volume’s programs are on the website while it is switched on."
        actions={<><RefreshButton loading={isFetching} onClick={() => refetch()} />{addButton}</>}
      />

      {!isPending && volumes.length === 0 ? (
        <EmptyState icon={Layers} title="No volumes yet" description="Add Volume 1, then add its programs.">
          <div className="mt-3">{addButton}</div>
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="px-5">Volume</TableHead>
                <TableHead className="hidden px-5 sm:table-cell">Programs</TableHead>
                <TableHead className="px-5">On the website</TableHead>
                <TableHead className="w-10 px-3"><span className="sr-only">Open</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending && Array.from({ length: 2 }, (_, i) => (
                <TableRow key={i}><TableCell colSpan={4} className="px-5 py-4"><Skeleton className="h-10 w-full" /></TableCell></TableRow>
              ))}
              {volumes.map((volume) => (
                <TableRow key={volume.id} className="cursor-pointer" onClick={() => router.push(`/programs/volumes/${volume.id}`)}>
                  <TableCell className="px-5 py-4">
                    <NavLink
                      href={`/programs/volumes/${volume.id}`}
                      className="grid rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="font-heading text-lg font-bold">{volume.name}</span>
                      <span className="text-xs text-muted-foreground sm:hidden">{programSummary(volume)}</span>
                    </NavLink>
                  </TableCell>
                  <TableCell className="hidden px-5 text-sm sm:table-cell">{programSummary(volume)}</TableCell>
                  <TableCell className="px-5">
                    <VolumeSwitch volume={volume} />
                  </TableCell>
                  <TableCell className="px-3 text-muted-foreground"><ChevronRight className="size-4" aria-hidden /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function programSummary(volume: AdminVolume): string {
  if (volume.programCount === 0) return 'No programs yet';
  const programs = `${volume.programCount} program${volume.programCount === 1 ? '' : 's'}`;
  const missing = volume.programCount - volume.readyCount;
  return missing ? `${programs} · ${missing} without a PDF` : `${programs} · all with a PDF`;
}
