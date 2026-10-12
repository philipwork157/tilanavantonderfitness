import { CircleCheck, Loader2, TriangleAlert } from 'lucide-react';
import type { AutosaveStatus as Status } from '@/lib/use-autosave';

/**
 * "All changes saved" / "Saving…" / why it could not save, next to the
 * editor's buttons. Screen readers only hear when it is saved or failed, not
 * every pause in typing.
 */
export function AutosaveStatus({ status, error }: { status: Status; error: string | null }) {
  return (
    <span className="inline-flex max-w-80 items-center gap-1.5 text-sm">
      <span aria-hidden className="inline-flex items-center gap-1.5">
        {status === 'saved' && <><CircleCheck className="size-4 shrink-0 text-status-success" /><span className="text-muted-foreground">All changes saved</span></>}
        {status === 'saving' && <><Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none" /><span className="text-muted-foreground">Saving…</span></>}
        {status === 'waiting' && <span className="font-semibold text-status-warning">Saving soon…</span>}
        {status === 'error' && <><TriangleAlert className="size-4 shrink-0 text-status-warning" /><span className="font-semibold text-status-warning">Not saved yet: {error}</span></>}
      </span>
      <span role="status" className="sr-only">
        {status === 'saved' ? 'All changes saved' : status === 'error' ? `Not saved yet: ${error}` : ''}
      </span>
    </span>
  );
}
