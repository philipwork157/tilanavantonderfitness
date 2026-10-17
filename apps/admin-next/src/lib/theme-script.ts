/** Shared by the server layout and the browser theme hook (no 'use client' here). */
export const THEME_KEY = 'tilana-admin-theme';
export type ThemeChoice = 'light' | 'dark' | 'system';

/** Runs inline in <head> before React loads. Keep it small and dependency-free. */
export const themeScript = `(function(){try{var c=localStorage.getItem('${THEME_KEY}');var d=c==='dark'||(c!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light'}catch(e){}})()`;
