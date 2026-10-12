import { CircleCheck, Loader2 } from 'lucide-react';

/**
 * "All changes saved" / "Unsaved changes" / "Saving…" next to an editor's
 * buttons. Nothing saves by itself: changes are kept only when Save (or
 * Publish) is pressed, and leaving with unsaved changes asks first.
 */
export function SaveStatus({ dirty, saving }: { dirty: boolean; saving: boolean }) {
  return (
    <span role="status" className="inline-flex items-center gap-1.5 text-sm">
      {saving
        ? <><Loader2 aria-hidden className="size-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none" /><span className="text-muted-foreground">Saving…</span></>
        : dirty
          ? <span className="font-semibold text-status-warning">Unsaved changes</span>
          : <><CircleCheck aria-hidden className="size-4 shrink-0 text-status-success" /><span className="text-muted-foreground">All changes saved</span></>}
    </span>
  );
}
