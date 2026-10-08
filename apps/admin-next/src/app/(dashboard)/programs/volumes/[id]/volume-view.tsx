'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CircleAlert, Dumbbell, FileCheck2, Globe, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { BackLink } from '@/components/back-link';
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
import { formatRand, parseRand, toneClass } from '@/lib/programs';
import type { AdminProgram, AdminVolume } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ProgramSwitch } from '../../program-switch';
import { VolumeSwitch } from '../../volume-switch';

const message = (error: unknown, fallback: string) => (error instanceof ApiError ? error.message : fallback);

/** One volume: its website switch and its programs. */
export function VolumeView({ id }: { id: number }) {
  const router = useNavigate();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('399');
  const priceCents = parseRand(price);

  const { data, error, isPending, isFetching, refetch } = useQuery({
    queryKey: ['volume', id],
    queryFn: () => api<{ volume: AdminVolume; programs: AdminProgram[] }>(`/api/volumes/${id}`),
  });

  const create = useMutation({
    mutationFn: () => api<{ id: number }>('/api/programs', {
      method: 'POST',
      body: JSON.stringify({ volumeId: id, name: name.trim(), priceCents }),
    }),
    onSuccess: ({ id: programId }) => {
      setCreateOpen(false);
      setName('');
      void queryClient.invalidateQueries({ queryKey: ['volumes'] });
      void queryClient.invalidateQueries({ queryKey: ['volume', id] });
      router.push(`/programs/${programId}`);
    },
  });

  const remove = useMutation({
    mutationFn: () => api(`/api/volumes/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['volumes'] });
      toast.success('Volume deleted');
      router.push('/programs');
    },
    onError: (err) => toast.error('Not deleted', { description: message(err, 'Please try again.') }),
  });

  if (error) {
    return (
      <div className="mx-auto grid w-full max-w-6xl justify-items-start gap-4">
        <p role="alert" className="text-destructive">{message(error, 'Volume not found.')}</p>
        <Button asChild variant="outline"><NavLink href="/programs"><ArrowLeft /> All volumes</NavLink></Button>
      </div>
    );
  }

  const volume = data?.volume;
  const programs = data?.programs ?? [];

  function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim().length >= 2 && priceCents !== null) create.mutate();
  }

  const addButton = (
    <Button className="rounded-full" disabled={!volume} onClick={() => { create.reset(); setCreateOpen(true); }}>
      <Plus /> Add program
    </Button>
  );

  return (
    <div className="mx-auto w-full max-w-6xl">
      <BackLink href="/programs" className="mb-5">All volumes</BackLink>

      <PageHeader
        eyebrow="Programs"
        title={volume?.name ?? 'Volume'}
        description="Every program here is on the website once it has a PDF, while this volume is switched on."
        actions={<><RefreshButton loading={isFetching} onClick={() => refetch()} />{addButton}</>}
      />

      {volume && (
        <section aria-labelledby="volume-website" className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card p-5">
          <div className="grid gap-1">
            <h2 id="volume-website" className="flex items-center gap-2 font-semibold"><Globe className="size-4" aria-hidden /> Show {volume.name} on the website</h2>
            <p className="text-sm text-muted-foreground">
              {volume.isActive
                ? `On: ${volume.liveCount} of ${volume.programCount} program${volume.programCount === 1 ? '' : 's'} on the website${volume.liveCount < volume.programCount ? ' (the others need a PDF or are switched off)' : ''}.`
                : 'Off: none of these programs are on the website. Switch it on when they are ready.'}
            </p>
          </div>
          <VolumeSwitch volume={volume} />
        </section>
      )}

      {!isPending && programs.length === 0 ? (
        <EmptyState icon={Dumbbell} title="No programs yet" description="Add the first program in this volume: a name and a price, then its text and PDF.">
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {addButton}
            <Button variant="outline" className="rounded-full border-destructive/50 bg-card text-destructive hover:bg-destructive/10" onClick={() => setDeleteOpen(true)}>
              <Trash2 /> Delete this volume
            </Button>
          </div>
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {isPending && Array.from({ length: 3 }, (_, i) => <li key={i}><Skeleton className="h-56 rounded-2xl" /></li>)}
          {programs.map((program) => <ProgramCard key={program.id} program={program} />)}
        </ul>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <form onSubmit={submit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle className="font-heading text-2xl">New program in {volume?.name}</DialogTitle>
              <DialogDescription>Start with a name and a price. Then add the text and upload the PDF; it shows on the website once the PDF is there.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
              <div className="grid gap-2">
                <Label htmlFor="new-name">Name</Label>
                <Input id="new-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Beginner" maxLength={60} autoFocus />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="new-price">Price (R)</Label>
                <Input id="new-price" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" aria-invalid={priceCents === null} />
              </div>
            </div>
            {create.error && <p role="alert" className="text-sm text-destructive">{message(create.error, 'Could not add the program.')}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={name.trim().length < 2 || priceCents === null || create.isPending}>{create.isPending ? 'Adding…' : 'Add program'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {volume && (
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title={`Delete ${volume.name}?`}
          description="This empty volume is removed. This can’t be undone."
          confirmLabel="Delete volume"
          cancelLabel="Keep volume"
          pending={remove.isPending}
          onConfirm={() => remove.mutate()}
        />
      )}
    </div>
  );
}

function ProgramCard({ program }: { program: AdminProgram }) {
  // The card opens the program; the switch sits in its own footer (a switch
  // inside a link would be invalid HTML and would open the page on click).
  return (
    <li className="grid overflow-hidden rounded-2xl border bg-card transition-shadow has-[a:hover]:shadow-[4px_4px_0_var(--hard-shadow)] motion-reduce:transition-none">
      <NavLink
        href={`/programs/${program.id}`}
        className="group grid focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
      >
        <div className={cn('grid gap-1 border-b px-5 py-4', toneClass[program.tone], !program.isActive && 'opacity-60')}>
          <span className="text-[0.68rem] font-extrabold tracking-[0.16em] uppercase opacity-80">
            {program.series === 'strength' ? `Strength series · step ${program.step}` : 'Focus program'}
          </span>
          <span className="font-heading text-2xl font-bold italic">{program.name}</span>
          {program.audience && <span className="text-xs font-semibold opacity-80">{program.audience}</span>}
        </div>
        <div className="grid content-start gap-3 px-5 pt-4 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            {program.onWebsite
              ? <StatusBadge label="On the website" tone="success" icon={Globe} />
              : <StatusBadge label={program.isActive ? 'Not on the website' : 'Switched off'} tone="neutral" />}
            {program.file
              ? <StatusBadge label="PDF ready" tone="success" icon={FileCheck2} />
              : <StatusBadge label="PDF missing" tone="warning" icon={CircleAlert} />}
          </div>
          <p className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Price</span>
            <span className="font-semibold tabular-nums">{formatRand(program.priceCents)}</span>
          </p>
        </div>
      </NavLink>
      <div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-5 py-2.5">
        <span className="text-sm text-muted-foreground">Show on the website</span>
        <ProgramSwitch program={program} />
      </div>
    </li>
  );
}
