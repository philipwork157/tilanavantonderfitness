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
 * keeps the latest token. Without a site key (local development) it is off.
 */
export function useTurnstile(action: string) {
  const ref = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [token, setToken] = useState('');

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;
    let timer: number | undefined;
    const draw = (attempt = 0) => {
      if (cancelled || !ref.current) return;
      const api = window.turnstile;
      if (!api) {
        if (attempt < 100) timer = window.setTimeout(() => draw(attempt + 1), 150);
        return;
      }
      try {
        widget.current = api.render(ref.current, {
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
    };
  }, [action]);

  return {
    enabled: Boolean(siteKey),
    ref,
    token,
    reset() {
      setToken('');
      if (widget.current) window.turnstile?.reset(widget.current);
    },
  };
}
