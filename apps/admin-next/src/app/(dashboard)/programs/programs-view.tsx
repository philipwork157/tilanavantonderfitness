'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { CircleAlert, Dumbbell, FileCheck2, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { EmptyState } from '@/components/empty-state';
import { NavLink } from '@/components/nav-link';
import { PageHeader } from '@/components/page-header';
import { RefreshButton } from '@/components/refresh-button';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import { useNavigate } from '@/lib/navigation-progress';
import { formatRand, toneClass } from '@/lib/programs';
import { programStatus, statusStyle } from '@/lib/status';
import type { AdminProgram } from '@/lib/types';
import { cn } from '@/lib/utils';

export function ProgramsView() {
  const router = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');

  const { data, isPending, isFetching, refetch } = useQuery({
    queryKey: ['programs'],
    queryFn: () => api<{ programs: AdminProgram[] }>('/api/programs'),
  });
  const programs = data?.programs ?? [];

  const create = useMutation({
    mutationFn: (newName: string) => api<{ id: number }>('/api/programs', { method: 'POST', body: JSON.stringify({ name: newName }) }),
    onSuccess: ({ id }) => {
      setCreateOpen(false);
      setName('');
      router.push(`/programs/${id}`);
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate(name.trim());
  }

  const newButton = (
    <Button className="rounded-full" onClick={() => { create.reset(); setCreateOpen(true); }}>
      <Plus /> New program
    </Button>
  );

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        eyebrow="Shop"
        title="Programs"
        description="What people can buy on the website. Each volume has a price and the PDF that is emailed to the buyer after payment."
        actions={<><RefreshButton loading={isFetching} onClick={() => refetch()} />{newButton}</>}
      />

      {!isPending && programs.length === 0 ? (
        <EmptyState icon={Dumbbell} title="No programs yet" description="Create the first program. It stays a draft until you publish it.">
          <div className="mt-3">{newButton}</div>
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {isPending && Array.from({ length: 3 }, (_, i) => <li key={i}><Skeleton className="h-64 rounded-2xl" /></li>)}
          {programs.map((program) => <ProgramCard key={program.id} program={program} />)}
        </ul>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <form onSubmit={submit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle className="font-heading text-2xl">New program</DialogTitle>
              <DialogDescription>Start with a name. Volume 1 is added for you, ready for its PDF.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="new-name">Name</Label>
              <Input id="new-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mobility" maxLength={60} autoFocus />
              {create.error && <p role="alert" className="text-sm text-destructive">{create.error instanceof ApiError ? create.error.message : 'Could not create the program.'}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={name.trim().length < 2 || create.isPending}>{create.isPending ? 'Creating…' : 'Create draft'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProgramCard({ program }: { program: AdminProgram }) {
  const status = statusStyle(programStatus, program.status);
  const missingPdf = program.volumes.filter((volume) => !volume.file).length;
  return (
    <li>
      <NavLink
        href={`/programs/${program.id}`}
        className="group grid h-full overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-[4px_4px_0_var(--hard-shadow)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none"
      >
        <div className={cn('grid gap-1 border-b px-5 py-4', toneClass[program.tone])}>
          <span className="text-[0.68rem] font-extrabold tracking-[0.16em] uppercase opacity-80">
            {program.series === 'strength' ? `Strength series · step ${program.step}` : 'Focus program'}
          </span>
          <span className="font-heading text-2xl font-bold italic">{program.name}</span>
          {program.audience && <span className="text-xs font-semibold opacity-80">{program.audience}</span>}
        </div>
        <div className="grid content-start gap-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={status.label} tone={status.tone} />
            {missingPdf > 0
              ? <StatusBadge label={missingPdf === 1 ? 'PDF missing' : `${missingPdf} PDFs missing`} tone="warning" icon={CircleAlert} />
              : <StatusBadge label="PDF ready" tone="success" icon={FileCheck2} />}
          </div>
          <ul className="grid gap-1.5 text-sm">
            {program.volumes.map((volume) => (
              <li key={volume.id} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate">Volume {volume.volumeNumber}</span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {formatRand(volume.priceCents)}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">{volume.isAvailable ? 'for sale' : 'not for sale'}</span>
                </span>
              </li>
            ))}
            {program.volumes.length === 0 && <li className="text-muted-foreground">No volumes yet</li>}
          </ul>
        </div>
      </NavLink>
    </li>
  );
}
