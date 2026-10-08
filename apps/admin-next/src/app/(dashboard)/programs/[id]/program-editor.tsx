'use client';

import { PROGRAM_ILLUSTRATIONS, PROGRAM_TONES } from '@tilana/contracts/admin-programs';
import { slugify } from '@tilana/contracts/blog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArrowLeft, EyeOff, Globe, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { NavLink } from '@/components/nav-link';
import { StatusBadge } from '@/components/status-badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api';
import { useNavigate } from '@/lib/navigation-progress';
import { formatRand, illustrationLabels, toneClass, toneLabels } from '@/lib/programs';
import { programStatus, statusStyle } from '@/lib/status';
import type { AdminProgram } from '@/lib/types';
import { useUnsavedGuard } from '@/lib/use-unsaved-guard';
import { cn } from '@/lib/utils';
import { Field, Panel } from './editor-parts';
import { VolumeCard } from './volume-card';

const message = (error: unknown, fallback: string) => (error instanceof ApiError ? error.message : fallback);

function toForm(program: AdminProgram) {
  return {
    name: program.name,
    slug: program.slug,
    title: program.title,
    summary: program.summary,
    description: program.description,
    audience: program.audience,
    tags: program.tags.join(', '),
    tone: program.tone,
    illustration: program.illustration,
    series: program.series,
    step: program.step,
    marker: program.marker,
    sortOrder: String(program.sortOrder),
  };
}
type ProgramForm = ReturnType<typeof toForm>;

function toPayload(form: ProgramForm) {
  return {
    ...form,
    tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
    step: form.series === 'strength' ? form.step ?? 1 : null,
    sortOrder: Math.max(0, Math.round(Number(form.sortOrder) || 0)),
  };
}

export function ProgramEditor({ id }: { id: number }) {
  const { data, error, isPending } = useQuery({
    queryKey: ['program', id],
    queryFn: () => api<{ program: AdminProgram }>(`/api/programs/${id}`),
  });

  if (isPending) {
    return (
      <div className="mx-auto grid w-full max-w-6xl gap-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="mx-auto grid w-full max-w-6xl justify-items-start gap-4">
        <p role="alert" className="text-destructive">{message(error, 'Program not found.')}</p>
        <Button asChild variant="outline"><NavLink href="/programs"><ArrowLeft /> All programs</NavLink></Button>
      </div>
    );
  }
  return <EditorForm initial={data.program} />;
}

function EditorForm({ initial }: { initial: AdminProgram }) {
  const router = useNavigate();
  const queryClient = useQueryClient();
  const [program, setProgram] = useState(initial);
  const [form, setForm] = useState(() => toForm(initial));
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(toForm(initial)));
  const [deleteOpen, setDeleteOpen] = useState(false);
  const dirty = JSON.stringify(form) !== savedJson;
  const status = statusStyle(programStatus, program.status);
  const slugLocked = program.publishedAt !== null;
  useUnsavedGuard(dirty);

  const set = <K extends keyof ProgramForm>(key: K, value: ProgramForm[K]) => setForm((current) => ({ ...current, [key]: value }));

  /** Keeps unsaved text edits when only volumes changed on the server. */
  function applyVolumes(next: AdminProgram) {
    setProgram(next);
    queryClient.setQueryData(['program', next.id], { program: next });
    void queryClient.invalidateQueries({ queryKey: ['programs'] });
  }

  function applyServerProgram(next: AdminProgram) {
    applyVolumes(next);
    const nextForm = toForm(next);
    setForm(nextForm);
    setSavedJson(JSON.stringify(nextForm));
  }

  async function saveNow() {
    const result = await api<{ program: AdminProgram }>(`/api/programs/${program.id}`, { method: 'PUT', body: JSON.stringify(toPayload(form)) });
    applyServerProgram(result.program);
  }

  const save = useMutation({
    mutationFn: saveNow,
    onSuccess: () => toast.success('Saved'),
    onError: (error) => toast.error('Not saved', { description: message(error, 'Please try again.') }),
  });

  const changeStatus = useMutation({
    mutationFn: async (next: AdminProgram['status']) => {
      if (dirty) await saveNow();
      return api<{ program: AdminProgram }>(`/api/programs/${program.id}/status`, { method: 'POST', body: JSON.stringify({ status: next }) });
    },
    onSuccess: (result, next) => {
      applyServerProgram(result.program);
      const notes = {
        published: ['Published', 'It appears on the website within about 5 minutes.'],
        draft: ['Moved to drafts', 'It disappears from the website within about 5 minutes.'],
        archived: ['Archived', 'Hidden from the website. Past orders keep it.'],
      } as const;
      toast.success(notes[next][0], { description: notes[next][1] });
    },
    onError: (error) => toast.error('Not changed', { description: message(error, 'Please try again.') }),
  });

  const addVolume = useMutation({
    mutationFn: () => api<{ program: AdminProgram }>(`/api/programs/${program.id}/volumes`, { method: 'POST' }),
    onSuccess: ({ program: next }) => { applyVolumes(next); toast.success('Volume added', { description: 'Upload its PDF, then put it up for sale.' }); },
    onError: (error) => toast.error('Not added', { description: message(error, 'Please try again.') }),
  });

  const remove = useMutation({
    mutationFn: () => api(`/api/programs/${program.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setSavedJson(JSON.stringify(form));
      void queryClient.invalidateQueries({ queryKey: ['programs'] });
      toast.success('Program deleted');
      router.push('/programs');
    },
    onError: (error) => toast.error('Not deleted', { description: message(error, 'Please try again.') }),
  });

  const busy = save.isPending || changeStatus.isPending;
  const cheapest = program.volumes.filter((volume) => volume.isAvailable).map((volume) => volume.priceCents).sort((a, b) => a - b)[0];

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="link" className="px-0 text-muted-foreground">
          <NavLink href="/programs"><ArrowLeft /> All programs</NavLink>
        </Button>
        {dirty && <span className="text-sm font-semibold text-status-warning">Unsaved changes</span>}
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-2 text-xs font-extrabold tracking-[0.2em] text-brand-text uppercase">Program</p>
          <h1 className="font-heading text-3xl font-bold tracking-tight break-words md:text-4xl">{form.name || 'Untitled program'}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label={status.label} tone={status.tone} className="max-sm:hidden" />
          <Button variant="outline" className="rounded-full bg-card" disabled={!dirty || busy} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />} Save
          </Button>
          {program.status === 'published' ? (
            <Button variant="ghost" className="rounded-full" disabled={busy} onClick={() => changeStatus.mutate('draft')}>
              <EyeOff /> Unpublish
            </Button>
          ) : (
            <Button className="rounded-full" disabled={busy} onClick={() => changeStatus.mutate('published')}>
              {changeStatus.isPending ? <Loader2 className="animate-spin" /> : <Globe />} Publish
            </Button>
          )}
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid gap-5">
          <Panel title="On the website" titleId="content-heading">
            <div className="grid gap-4 md:grid-cols-2">
              <Field id="name" label="Name">
                <Input id="name" value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={60} className="h-11 text-lg font-semibold" />
              </Field>
              <Field id="audience" label="Who it is for" hint="Shown under the name, e.g. “New or returning”.">
                <Input id="audience" value={form.audience} onChange={(e) => set('audience', e.target.value)} maxLength={80} />
              </Field>
            </div>
            <Field id="title" label="Headline" hint="The big line on the program page, e.g. “Build a confident foundation.”">
              <Input id="title" value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={120} />
            </Field>
            <Field id="summary" label="Summary" hint="One or two sentences for the program cards on the home page.">
              <Textarea id="summary" value={form.summary} onChange={(e) => set('summary', e.target.value)} rows={2} maxLength={240} />
            </Field>
            <Field id="description" label="Description" hint="The full description on the programs page.">
              <Textarea id="description" value={form.description} onChange={(e) => set('description', e.target.value)} rows={5} maxLength={1200} />
            </Field>
            <Field id="tags" label="Tags" hint="Separate with commas, at most 6. E.g. Strength, Home or gym.">
              <Input id="tags" value={form.tags} onChange={(e) => set('tags', e.target.value)} maxLength={300} />
            </Field>
          </Panel>

          <Panel title="Volumes" titleId="volumes-heading" hint="What people buy. Each volume has its own price and the PDF that is emailed after payment.">
            {program.volumes.map((volume) => (
              <VolumeCard
                key={volume.id}
                volume={volume}
                onProgram={applyVolumes}
                canDelete={program.volumes.length > 1 || program.status !== 'published'}
              />
            ))}
            <Button type="button" variant="outline" className="justify-self-start bg-card" disabled={addVolume.isPending} onClick={() => addVolume.mutate()}>
              {addVolume.isPending ? <Loader2 className="animate-spin" /> : <Plus />} Add volume {program.volumes.length + 1}
            </Button>
          </Panel>
        </div>

        <aside className="grid gap-5">
          <Panel title="Preview" titleId="preview-heading" hint="Roughly how the card looks on the website.">
            <div className="overflow-hidden rounded-xl border">
              <div className={cn('grid gap-1 border-b px-4 py-4', toneClass[form.tone])}>
                <span className="text-[0.62rem] font-extrabold tracking-[0.16em] uppercase opacity-80">{form.marker || '\u00a0'}</span>
                <span className="font-heading text-2xl font-bold italic">{form.name || 'Name'}</span>
                <span className="text-xs font-semibold opacity-80">{form.audience}</span>
              </div>
              <div className="grid gap-2 bg-card p-4 text-sm">
                <span className="font-bold">{form.title || 'Headline'}</span>
                <span className="text-muted-foreground">{form.summary || 'Summary'}</span>
                <span className="font-extrabold">{cheapest ? formatRand(cheapest) : 'Not for sale yet'}</span>
              </div>
            </div>
          </Panel>

          <Panel title="Look and place" titleId="look-heading">
            <Field id="tone" label="Colour">
              <Select value={form.tone} onValueChange={(value) => set('tone', value as ProgramForm['tone'])}>
                <SelectTrigger id="tone" className="w-full bg-card"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROGRAM_TONES.map((tone) => (
                    <SelectItem key={tone} value={tone}>
                      <span className={cn('size-3.5 rounded-full border', toneClass[tone])} aria-hidden /> {toneLabels[tone]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field id="illustration" label="Picture">
              <Select value={form.illustration} onValueChange={(value) => set('illustration', value as ProgramForm['illustration'])}>
                <SelectTrigger id="illustration" className="w-full bg-card"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROGRAM_ILLUSTRATIONS.map((item) => <SelectItem key={item} value={item}>{illustrationLabels[item]}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field id="series" label="Group">
              <Select value={form.series} onValueChange={(value) => setForm((current) => ({ ...current, series: value as ProgramForm['series'], step: value === 'strength' ? current.step ?? 1 : null }))}>
                <SelectTrigger id="series" className="w-full bg-card"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="strength">The strength series</SelectItem>
                  <SelectItem value="focus">Focus program</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {form.series === 'strength' && (
              <Field id="step" label="Step in the series">
                <Select value={String(form.step ?? 1)} onValueChange={(value) => set('step', Number(value))}>
                  <SelectTrigger id="step" className="w-full bg-card"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Step 1 (one plate)</SelectItem>
                    <SelectItem value="2">Step 2 (two plates)</SelectItem>
                    <SelectItem value="3">Step 3 (three plates)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            )}
            <Field id="marker" label="Label on the colour panel" hint="Short, e.g. “Start here” or “Pelvic floor”.">
              <Input id="marker" value={form.marker} onChange={(e) => set('marker', e.target.value)} maxLength={40} />
            </Field>
            <Field id="sort" label="Order" hint="Lower numbers come first on the website.">
              <Input id="sort" type="number" min={0} max={10000} value={form.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} />
            </Field>
          </Panel>

          <Panel title="Web address" titleId="slug-heading" hint={slugLocked ? 'Fixed once a program has been published, so links and baskets keep working.' : 'Used in links and in each volume’s address.'}>
            <Field id="slug" label="Address">
              <Input id="slug" value={form.slug} onChange={(e) => set('slug', e.target.value)} maxLength={60} disabled={slugLocked} />
            </Field>
            {!slugLocked && form.slug !== slugify(form.name) && (
              <Button variant="link" size="sm" className="justify-self-start px-0" onClick={() => set('slug', slugify(form.name))}>Match the name</Button>
            )}
          </Panel>

          {program.status === 'published' ? (
            <Panel title="Archive" titleId="archive-heading" hint="Takes the program off the website but keeps it for past orders.">
              <Button variant="outline" className="bg-card" disabled={busy} onClick={() => changeStatus.mutate('archived')}>
                <Archive /> Archive program
              </Button>
            </Panel>
          ) : (
            <Panel title="Delete" titleId="delete-heading" hint="Removes the program and its volumes. Uploaded PDFs stay in storage." danger>
              <Button variant="outline" className="border-destructive/50 bg-card text-destructive hover:bg-destructive/10" onClick={() => setDeleteOpen(true)}>
                <Trash2 /> Delete program
              </Button>
            </Panel>
          )}
        </aside>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{program.name}”?</AlertDialogTitle>
            <AlertDialogDescription>The program and its volumes will be removed. This can&apos;t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep program</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" disabled={remove.isPending} onClick={(e) => { e.preventDefault(); remove.mutate(); }}>
              {remove.isPending ? 'Deleting…' : 'Delete program'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
