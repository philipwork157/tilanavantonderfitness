import { useEffect, useRef, useState } from 'react';

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
};

declare global {
  interface Window { turnstile?: TurnstileApi }
}

const siteKey = import.meta.env.PUBLIC_TURNSTILE_SITE_KEY ?? '';

/**
 * Cloudflare Turnstile spam check for a React form. The script is loaded once
 * by the site layout (explicit render); this draws the widget into `ref` and
 * keeps the latest token. `ref` is a callback ref, so the widget is drawn
 * again whenever its box is shown again (e.g. "Send another message" after
 * the thank-you screen). Without a site key (local development) it is off.
 */
export function useTurnstile(action: string) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const widget = useRef<string | null>(null);
  const [token, setToken] = useState('');

  useEffect(() => {
    if (!siteKey || !element) return;
    let cancelled = false;
    let timer: number | undefined;
    const draw = (attempt = 0) => {
      if (cancelled) return;
      const api = window.turnstile;
      if (!api) {
        if (attempt < 100) timer = window.setTimeout(() => draw(attempt + 1), 150);
        return;
      }
      try {
        widget.current = api.render(element, {
          sitekey: siteKey,
          action,
          theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
          callback: (value: string) => setToken(value),
          'expired-callback': () => setToken(''),
          'error-callback': () => setToken(''),
        });
      }
      catch (error) {
        // A Turnstile problem must never take the whole form down with it.
        console.error('Security check could not be shown.', error);
      }
    };
    draw();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
      // The old token belongs to the removed widget.
      setToken('');
    };
  }, [action, element]);

  return {
    enabled: Boolean(siteKey),
    ref: setElement,
    token,
    reset() {
      setToken('');
      if (widget.current) window.turnstile?.reset(widget.current);
    },
  };
}
