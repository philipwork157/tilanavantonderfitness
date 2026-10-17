'use client';

import { MAX_PROGRAM_PDF_BYTES } from '@tilana/contracts/admin-programs';
import { useMutation } from '@tanstack/react-query';
import { Download, FileText, Loader2, Mail, Upload } from 'lucide-react';
import { useRef, type ChangeEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { formatBytes } from '@/lib/programs';
import type { AdminProgram } from '@/lib/types';

const message = (error: unknown, fallback: string) => (error instanceof ApiError ? error.message : fallback);

/** The PDF the buyer receives by email: upload, replace, download and a test email. */
export function PdfPanel({ program, onProgram }: { program: AdminProgram; onProgram: (program: AdminProgram) => void }) {
  const fileInput = useRef<HTMLInputElement>(null);

  const upload = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append('file', file);
      return api<{ program: AdminProgram }>(`/api/programs/${program.id}/file`, { method: 'POST', body });
    },
    onSuccess: ({ program: next }) => {
      onProgram(next);
      toast.success('PDF uploaded', {
        description: next.onWebsite
          ? 'It is on the website with a new sneak peek. New orders and resends get this version.'
          : next.offWebsiteReason ?? undefined,
      });
    },
    onError: (error) => toast.error('Upload failed', { description: message(error, 'Please try again.') }),
  });

  const testEmail = useMutation({
    mutationFn: () => api<{ recipients: string[] }>(`/api/programs/${program.id}/test-email`, { method: 'POST' }),
    onSuccess: ({ recipients }) => toast.success('Test email sent', { description: `Sent to ${recipients.join(', ')} with the PDF attached.` }),
    onError: (error) => toast.error('Test email not sent', { description: message(error, 'Please try again.') }),
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
    <div className="grid gap-3 rounded-lg border border-dashed p-3">
      {program.file ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-status-success-bg text-status-success" aria-hidden><FileText className="size-5" /></span>
          <div className="grid min-w-0 flex-1 text-sm">
            <span className="font-semibold break-all">{program.file.name}</span>
            <span className="text-xs text-muted-foreground">{formatBytes(program.file.sizeBytes)} · version {program.file.version} · uploaded {formatDateTime(program.file.uploadedAt)}</span>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No PDF yet. Upload the program the buyer receives by email (PDF, up to 15 MB). It shows on the website once the PDF is here.</p>
      )}
      <input ref={fileInput} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={choose} aria-label={`Choose the PDF for ${program.name}`} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="bg-card" disabled={upload.isPending} onClick={() => fileInput.current?.click()}>
          {upload.isPending ? <Loader2 className="animate-spin" /> : <Upload />} {program.file ? 'Replace PDF' : 'Upload PDF'}
        </Button>
        {program.file && (
          <>
            <Button asChild variant="ghost">
              <a href={`/api/programs/${program.id}/file`} download><Download /> Download</a>
            </Button>
            <Button type="button" variant="ghost" disabled={testEmail.isPending} onClick={() => testEmail.mutate()}>
              {testEmail.isPending ? <Loader2 className="animate-spin" /> : <Mail />} Send me a test email
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
