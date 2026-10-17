'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId } from 'react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { api, ApiError } from '@/lib/api';
import type { AdminProgram } from '@/lib/types';
import { cn } from '@/lib/utils';

const message = (error: unknown, fallback: string) => (error instanceof ApiError ? error.message : fallback);

/**
 * One program's own website switch. Quick on purpose: switching off asks
 * nothing (nothing is deleted) and the toast offers to undo it.
 */
export function ProgramSwitch({ program, onChange, className }: {
  program: Pick<AdminProgram, 'id' | 'name' | 'isActive' | 'volume'>;
  /** Called with the updated program, e.g. to refresh an open editor. */
  onChange?: (program: AdminProgram) => void;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const id = useId();

  const change = useMutation({
    mutationFn: (isActive: boolean) =>
      api<{ program: AdminProgram }>(`/api/programs/${program.id}/website`, { method: 'PUT', body: JSON.stringify({ isActive }) }),
    onSuccess: ({ program: next }, isActive) => {
      queryClient.setQueryData(['program', next.id], { program: next });
      void queryClient.invalidateQueries({ queryKey: ['volume', next.volume.id] });
      void queryClient.invalidateQueries({ queryKey: ['volumes'] });
      onChange?.(next);
      toast.success(isActive ? `${next.name} is switched on` : `${next.name} is off the website`, {
        description: isActive
          ? (next.onWebsite ? 'It shows on the website within about 5 minutes.' : `Not on the website yet: ${next.offWebsiteReason}`)
          : 'It disappears within about 5 minutes and can no longer be bought. Nothing was deleted.',
        action: { label: 'Undo', onClick: () => change.mutate(!isActive) },
      });
    },
    onError: (error) => toast.error('Not changed', { description: message(error, 'Please try again.') }),
  });

  return (
    <label htmlFor={id} className={cn('inline-flex w-fit cursor-pointer items-center gap-2.5 text-sm font-semibold', className)}>
      <Switch id={id} checked={program.isActive} disabled={change.isPending} onCheckedChange={(next) => change.mutate(next)} />
      {program.isActive ? 'On' : 'Off'}
      <span className="sr-only"> ({program.name} on the website)</span>
    </label>
  );
}
