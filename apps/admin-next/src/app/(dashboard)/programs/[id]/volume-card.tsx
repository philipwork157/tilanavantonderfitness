'use client';

import { MAX_PROGRAM_PDF_BYTES } from '@tilana/contracts/admin-programs';
import { useMutation } from '@tanstack/react-query';
import { Download, FileText, Loader2, Mail, Save, Trash2, Upload } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { api, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { formatBytes, formatRand, parseRand } from '@/lib/programs';
import type { AdminProgram, AdminProgramVolume } from '@/lib/types';

const message = (error: unknown, fallback: string) => (error instanceof ApiError ? error.message : fallback);
const priceText = (cents: number) => formatRand(cents).replace(/^R/, '').replace(/\s/g, '');

/** One volume: its name, price, whether it is for sale, and its PDF. */
export function VolumeCard({ volume, onProgram, canDelete }: {
  volume: AdminProgramVolume;
  onProgram: (program: AdminProgram) => void;
  canDelete: boolean;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(volume.name);
  const [price, setPrice] = useState(() => priceText(volume.priceCents));
  const [available, setAvailable] = useState(volume.isAvailable);
  const priceCents = parseRand(price);
  const dirty = name !== volume.name || priceCents !== volume.priceCents || available !== volume.isAvailable;
  const idBase = `volume-${volume.id}`;

  function reset(next: AdminProgram) {
    const fresh = next.volumes.find((item) => item.id === volume.id);
    if (fresh) {
      setName(fresh.name);
      setPrice(priceText(fresh.priceCents));
      setAvailable(fresh.isAvailable);
    }
    onProgram(next);
  }

  const save = useMutation({
    mutationFn: (body: { name: string; priceCents: number; isAvailable: boolean }) =>
      api<{ program: AdminProgram }>(`/api/program-volumes/${volume.id}`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: ({ program }) => { reset(program); toast.success('Volume saved'); },
    onError: (error) => toast.error('Not saved', { description: message(error, 'Please try again.') }),
  });

  const upload = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append('file', file);
      return api<{ program: AdminProgram }>(`/api/program-volumes/${volume.id}/file`, { method: 'POST', body });
    },
    onSuccess: ({ program }) => { onProgram(program); toast.success('PDF uploaded', { description: 'New orders and resends get this version.' }); },
    onError: (error) => toast.error('Upload failed', { description: message(error, 'Please try again.') }),
  });

  const testEmail = useMutation({
    mutationFn: () => api<{ recipients: string[] }>(`/api/program-volumes/${volume.id}/test-email`, { method: 'POST' }),
    onSuccess: ({ recipients }) => toast.success('Test email sent', { description: `Sent to ${recipients.join(', ')} with the PDF attached.` }),
    onError: (error) => toast.error('Test email not sent', { description: message(error, 'Please try again.') }),
  });

  const remove = useMutation({
    mutationFn: () => api<{ program: AdminProgram }>(`/api/program-volumes/${volume.id}`, { method: 'DELETE' }),
    onSuccess: ({ program }) => { onProgram(program); toast.success('Volume removed'); },
    onError: (error) => toast.error('Not removed', { description: message(error, 'Please try again.') }),
  });

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.type && file.type !== 'application/pdf') {
      toast.error('Not a PDF', { description: 'Please choose the program as a PDF file.' });
      return;
    }
    if (file.size > MAX_PROGRAM_PDF_BYTES) {
      toast.error('PDF too large', { description: 'PDFs must be 15 MB or smaller so they fit in an email. Try exporting with smaller images.' });
      return;
    }
    upload.mutate(file);
  }

  return (
    <article aria-labelledby={`${idBase}-title`} className="grid gap-4 rounded-xl border bg-background/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${idBase}-title`} className="font-heading text-lg font-bold">Volume {volume.volumeNumber}</h3>
        <span className="text-xs break-all text-muted-foreground">/{volume.slug}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
        <div className="grid gap-2">
          <Label htmlFor={`${idBase}-name`}>Name in basket and emails</Label>
          <Input id={`${idBase}-name`} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${idBase}-price`}>Price</Label>
          <div className="flex items-center rounded-md border bg-card focus-within:ring-2 focus-within:ring-ring/40">
            <span className="pl-3 text-sm text-muted-foreground" aria-hidden>R</span>
            <Input id={`${idBase}-price`} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} aria-invalid={priceCents === null} className="border-0 pl-1 shadow-none focus-visible:ring-0" />
          </div>
        </div>
      </div>
      {priceCents === null && <p role="alert" className="-mt-2 text-xs text-destructive">Type the price in rand, for example 399 or 399.50.</p>}

      <div className="grid gap-3 rounded-lg border border-dashed p-3">
        {volume.file ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-status-success-bg text-status-success" aria-hidden><FileText className="size-5" /></span>
            <div className="grid min-w-0 flex-1 text-sm">
              <span className="font-semibold break-all">{volume.file.name}</span>
              <span className="text-xs text-muted-foreground">{formatBytes(volume.file.sizeBytes)} · version {volume.file.version} · uploaded {formatDateTime(volume.file.uploadedAt)}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No PDF yet. Upload the program the buyer receives by email (PDF, up to 15 MB).</p>
        )}
        <input ref={fileInput} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={choose} aria-label={`Choose the PDF for volume ${volume.volumeNumber}`} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="bg-card" disabled={upload.isPending} onClick={() => fileInput.current?.click()}>
            {upload.isPending ? <Loader2 className="animate-spin" /> : <Upload />} {volume.file ? 'Replace PDF' : 'Upload PDF'}
          </Button>
          {volume.file && (
            <>
              <Button asChild variant="ghost">
                <a href={`/api/program-volumes/${volume.id}/file`} download><Download /> Download</a>
              </Button>
              <Button type="button" variant="ghost" disabled={testEmail.isPending} onClick={() => testEmail.mutate()}>
                {testEmail.isPending ? <Loader2 className="animate-spin" /> : <Mail />} Send me a test email
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label htmlFor={`${idBase}-available`} className="flex items-center gap-3 text-sm font-semibold">
          <Switch id={`${idBase}-available`} checked={available} onCheckedChange={setAvailable} disabled={!volume.file} />
          {available ? 'For sale on the website' : 'Not for sale'}
        </label>
        <div className="flex flex-wrap gap-2">
          {canDelete && (
            <Button type="button" variant="ghost" className="text-destructive hover:bg-destructive/10" disabled={remove.isPending} onClick={() => remove.mutate()}>
              <Trash2 /> Remove
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            className="bg-card"
            disabled={!dirty || priceCents === null || name.trim().length < 2 || save.isPending}
            onClick={() => priceCents !== null && save.mutate({ name: name.trim(), priceCents, isAvailable: available })}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />} Save volume
          </Button>
        </div>
      </div>
      {!volume.file && <p className="-mt-2 text-xs text-muted-foreground">A volume can go on sale once its PDF is uploaded.</p>}
    </article>
  );
}
