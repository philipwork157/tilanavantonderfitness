'use client';

import { useMutation } from '@tanstack/react-query';
import { Loader2, Lock, RefreshCw } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api';
import type { AdminProgram } from '@/lib/types';
import { Panel } from './editor-parts';

const PLACEHOLDERS = 4;

/**
 * "Peek inside" on the website, made from the PDF by itself: the cover plus a
 * few blurred inside pages. Nothing to fill in. A PDF without an up-to-date
 * peek (uploaded before peeks existed, or a failed attempt) gets one made as
 * soon as this panel opens.
 */
export function PreviewPanel({ program, onProgram, children }: { program: AdminProgram; onProgram: (program: AdminProgram) => void; children?: ReactNode }) {
  const tried = useRef<number | null>(null);
  const make = useMutation({
    mutationFn: () => api<{ program: AdminProgram }>(`/api/programs/${program.id}/preview`, { method: 'POST' }),
    onSuccess: ({ program: next }) => onProgram(next),
  });

  const version = program.file?.version ?? null;
  const needed = version !== null && !program.preview?.upToDate;
  const { mutate, isPending } = make;
  useEffect(() => {
    // Once per PDF version, so a PDF that can't be drawn doesn't loop.
    if (needed && !isPending && tried.current !== version) {
      tried.current = version;
      mutate();
    }
  }, [needed, isPending, version, mutate]);

  const remake = () => make.mutate(undefined, {
    onSuccess: () => toast.success('Sneak peek made again', { description: 'The website shows the new pictures within a few minutes.' }),
  });

  const preview = program.preview?.upToDate ? program.preview : null;
  const failed = make.isError && !make.isPending;

  return (
    <Panel
      title="Sneak peek on the website"
      titleId="peek-heading"
      hint="What people see under “Take a peek inside”: your lines about the program, next to pictures of the PDF."
    >
      {children}
      <div className="grid gap-1 border-t pt-4">
        <p className="text-sm font-medium">Pictures from the PDF</p>
        <p className="text-xs text-muted-foreground">Made by itself: the cover, plus a few inside pages blurred so the plan can’t be read. A new PDF makes new pictures.</p>
      </div>
      {!program.file ? (
        <p className="text-sm text-muted-foreground">Upload the PDF above and the sneak peek is made from it.</p>
      ) : preview && !make.isPending ? (
        <>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {preview.pages.map((page) => (
              <li key={page.url} className="grid gap-1.5">
                <div className="relative overflow-hidden rounded-lg border bg-muted shadow-xs" style={{ aspectRatio: `${page.width} / ${page.height}` }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- public Supabase image made from the PDF */}
                  <img src={page.url} alt="" loading="lazy" className="size-full object-cover" />
                  {page.blurred && (
                    <span className="absolute inset-0 grid place-items-center" aria-hidden>
                      <span className="grid size-8 place-items-center rounded-full bg-background/85 text-foreground shadow-sm"><Lock className="size-4" /></span>
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {page.blurred ? `Page ${page.page}, blurred` : 'Cover'}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {preview.pageCount} pages in the PDF. Shown under “Take a peek inside” on the program page.
            </p>
            <Button type="button" variant="ghost" size="sm" onClick={remake}>
              <RefreshCw /> Make again
            </Button>
          </div>
        </>
      ) : failed ? (
        <div className="grid gap-3 rounded-lg border border-dashed p-3">
          <p role="alert" className="text-sm text-destructive">
            {make.error instanceof ApiError ? make.error.message : 'The sneak peek could not be made. Please try again.'}
          </p>
          <p className="text-xs text-muted-foreground">The PDF is fine and buyers still receive it. Only the pictures on the website are missing.</p>
          <div><Button type="button" variant="outline" className="bg-card" onClick={() => make.mutate()}><RefreshCw /> Try again</Button></div>
        </div>
      ) : (
        <div className="grid gap-3" aria-live="polite">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-hidden>
            {Array.from({ length: PLACEHOLDERS }, (_, i) => (
              <li key={i} className="aspect-[1/1.414] animate-pulse rounded-lg border bg-muted motion-reduce:animate-none" />
            ))}
          </ul>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Making the sneak peek from the PDF…
          </p>
        </div>
      )}
    </Panel>
  );
}
