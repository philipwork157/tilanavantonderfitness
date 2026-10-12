'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './api';

export type AutosaveStatus = 'saved' | 'waiting' | 'saving' | 'error';

/**
 * Saves the editor by itself a moment after typing stops, so nothing is lost
 * and nobody has to remember the Save button. `current` and `saved` are the
 * form now and as last saved (any comparable text, e.g. JSON); `save` sends
 * the form as it is at that moment. A failed save waits for the next change
 * (no retry loop) and its message is shown, e.g. "Write the post." for a
 * published post that would no longer be complete.
 *
 * Explicit actions (Save, Publish, Delete, photo upload) call `settle()` first,
 * so an autosave never answers after them with older data.
 */
export function useAutosave({ current, saved, enabled, save, delay = 1500 }: {
  current: string;
  saved: string;
  enabled: boolean;
  save: () => Promise<void>;
  delay?: number;
}): { status: AutosaveStatus; error: string | null; settle: () => Promise<void> } {
  const saveRef = useRef(save);
  const running = useRef<Promise<void> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ text: string; for: string } | null>(null);

  useEffect(() => {
    saveRef.current = save;
  });

  const dirty = current !== saved;
  useEffect(() => {
    // `saving` is a dependency so a change typed during a save is picked up when it ends.
    if (!dirty || !enabled || saving) return;
    const timer = window.setTimeout(() => {
      setSaving(true);
      const attempt = current;
      running.current = saveRef.current()
        .then(() => setError(null))
        .catch((reason: unknown) => {
          setError({ text: reason instanceof ApiError ? reason.message : 'Please check your connection.', for: attempt });
        })
        .finally(() => {
          running.current = null;
          setSaving(false);
        });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [current, dirty, enabled, saving, delay]);

  const settle = useCallback(async () => {
    if (running.current) await running.current;
  }, []);

  if (saving) return { status: 'saving', error: null, settle };
  if (!dirty) return { status: 'saved', error: null, settle };
  if (error && error.for === current) return { status: 'error', error: error.text, settle };
  return { status: 'waiting', error: null, settle };
}
