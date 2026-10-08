'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Switch } from '@/components/ui/switch';
import { api, ApiError } from '@/lib/api';
import type { AdminVolume } from '@/lib/types';

const message = (error: unknown, fallback: string) => (error instanceof ApiError ? error.message : fallback);

/**
 * Switches a whole volume on or off for the website. Turning it off asks
 * first, because every program in it disappears from the website.
 */
export function VolumeSwitch({ volume }: { volume: Pick<AdminVolume, 'id' | 'name' | 'isActive'> }) {
  const queryClient = useQueryClient();
  const id = useId();
  const [confirmOff, setConfirmOff] = useState(false);

  const change = useMutation({
    mutationFn: (isActive: boolean) =>
      api<{ volume: AdminVolume }>(`/api/volumes/${volume.id}`, { method: 'PUT', body: JSON.stringify({ name: volume.name, isActive }) }),
    onSuccess: (_result, isActive) => {
      setConfirmOff(false);
      void queryClient.invalidateQueries({ queryKey: ['volumes'] });
      void queryClient.invalidateQueries({ queryKey: ['volume', volume.id] });
      void queryClient.invalidateQueries({ queryKey: ['program'] });
      toast.success(isActive ? `${volume.name} is on the website` : `${volume.name} is off the website`, {
        description: isActive
          ? 'Its programs with a PDF show within about 5 minutes.'
          : 'Its programs disappear within about 5 minutes. Nothing was deleted.',
      });
    },
    onError: (error) => toast.error('Not changed', { description: message(error, 'Please try again.') }),
  });

  return (
    <>
      <label htmlFor={id} className="flex items-center gap-3 text-sm font-semibold">
        <Switch
          id={id}
          checked={volume.isActive}
          disabled={change.isPending}
          onCheckedChange={(next) => (next ? change.mutate(true) : setConfirmOff(true))}
        />
        {volume.isActive ? 'On' : 'Off'}
        <span className="sr-only"> ({volume.name} on the website)</span>
      </label>
      <ConfirmDialog
        open={confirmOff}
        onOpenChange={setConfirmOff}
        title={`Take ${volume.name} off the website?`}
        description={`All ${volume.name} programs disappear from the website and can no longer be bought. Nothing is deleted: switch it back on any time, and past buyers can still get their PDFs.`}
        confirmLabel="Switch off"
        pendingLabel="Switching off…"
        cancelLabel="Keep it on"
        pending={change.isPending}
        onConfirm={() => change.mutate(false)}
      />
    </>
  );
}
