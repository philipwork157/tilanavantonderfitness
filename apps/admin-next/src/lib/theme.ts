'use client';

import { useSyncExternalStore } from 'react';
import { THEME_KEY, type ThemeChoice } from './theme-script';

/**
 * Light/dark theme without a library. The choice ('light', 'dark' or
 * 'system') is kept in localStorage; the <head> script in app/layout.tsx
 * applies it before the page paints, so there is no flash.
 */
export type { ThemeChoice };
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const onSystem = () => { if (readChoice() === 'system') apply('system'); };
  media.addEventListener('change', onSystem);
  return () => {
    listeners.delete(onChange);
    media.removeEventListener('change', onSystem);
  };
}

function readChoice(): ThemeChoice {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

function apply(choice: ThemeChoice) {
  const dark = choice === 'dark' || (choice === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const root = document.documentElement;
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
  listeners.forEach((listener) => listener());
}

/** The theme actually showing ('light' or 'dark'), and a setter. */
export function useTheme() {
  const resolvedTheme = useSyncExternalStore(
    subscribe,
    () => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'),
    () => 'light',
  ) as 'light' | 'dark';

  function setTheme(choice: ThemeChoice) {
    try {
      if (choice === 'system') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, choice);
    } catch {
      // Storage blocked: the theme still changes for this page view.
    }
    apply(choice);
  }

  return { resolvedTheme, setTheme };
}
