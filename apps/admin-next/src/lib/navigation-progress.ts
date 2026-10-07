'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useSyncExternalStore } from 'react';

/**
 * Tracks the page the admin is navigating to, so the top progress bar and the
 * sidebar can react the moment a link is clicked instead of when the server
 * answers. Cleared by <NavigationProgress> as soon as the address changes.
 */
let target: string | null = null;
let safety: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

/** Marks a navigation to `href` as started. Ignores other sites and the current page. */
export function startNavigation(href: string) {
  const url = new URL(href, window.location.href);
  if (url.origin !== window.location.origin) return;
  const next = url.pathname + url.search;
  if (next === window.location.pathname + window.location.search) return;
  target = next;
  clearTimeout(safety);
  // Never spin forever if a navigation is dropped (for example an error page).
  safety = setTimeout(finishNavigation, 15_000);
  emit();
}

export function finishNavigation() {
  clearTimeout(safety);
  if (target === null) return;
  target = null;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Path (with query) of the page being loaded, or null when idle. */
export function usePendingNavigation() {
  return useSyncExternalStore(subscribe, () => target, () => null);
}

/** `router.push` / `router.replace` that also start the progress bar. */
export function useNavigate() {
  const router = useRouter();
  return useMemo(() => ({
    push: (href: string) => { startNavigation(href); router.push(href); },
    replace: (href: string) => { startNavigation(href); router.replace(href); },
    refresh: () => router.refresh(),
  }), [router]);
}
