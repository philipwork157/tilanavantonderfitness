import type { ReactNode } from 'react';

/** One small line-icon set for the whole site (works in Astro and React). */
export type IconName =
  | 'dumbbell' | 'stairs' | 'bolt' | 'breath' | 'bowl' | 'shoe' | 'bike'
  | 'toast' | 'plate' | 'bottle' | 'arrow' | 'sun' | 'moon' | 'bag' | 'mail'
  | 'check' | 'close' | 'heart' | 'spark' | 'whatsapp' | 'send' | 'lock'
  | 'egg' | 'pot' | 'steak' | 'clock' | 'users' | 'flame';

const paths: Record<Exclude<IconName, 'whatsapp' | 'send'>, ReactNode> = {
  dumbbell: <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />,
  stairs: <path d="M3.5 19.5h4.5v-4.5h4.5v-4.5h4.5V6h3.5" />,
  bolt: <path d="M13.5 3 5 13.5h6l-1 7.5 8.5-10.5h-6l1-7.5z" />,
  breath: (
    <>
      <path d="M12 3.5v7" />
      <path d="M11 9c-4 0-6.5 3.2-6.5 7 0 2.4 1.3 4 3.2 4 2.2 0 3.3-1.8 3.3-4.6V9z" />
      <path d="M13 9c4 0 6.5 3.2 6.5 7 0 2.4-1.3 4-3.2 4-2.2 0-3.3-1.8-3.3-4.6V9z" />
    </>
  ),
  bowl: (
    <>
      <path d="M3.5 11.5h17a8.5 8.5 0 0 1-17 0z" />
      <path d="M8.5 8c0-1.2 1.2-1.6 1.2-3M12.5 8c0-1.2 1.2-1.6 1.2-3" />
    </>
  ),
  shoe: (
    <>
      <path d="M3 9.5 7 10.5l2 3 5.2 1.6c3 .9 5.9 1.6 6.8 3.4v1H3z" />
      <path d="M3 17h18M9.7 14.2l1.3-1.6M12.2 14.9l1.2-1.6" />
    </>
  ),
  bike: (
    <>
      <circle cx="5.5" cy="16.5" r="3.5" />
      <circle cx="18.5" cy="16.5" r="3.5" />
      <path d="M5.5 16.5 9.5 9h6l3 7.5M9.5 9l3 7.5h-7M14 5.5h2.5l-1 3.5M8 6.5h3" />
    </>
  ),
  toast: (
    <>
      <path d="M6 10.2A3.6 3.6 0 0 1 8.6 4h6.8A3.6 3.6 0 0 1 18 10.2V19a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1z" />
      <path d="M9 13.5c1.2-1 2.4-1 3 0s1.8 1 3 0" />
    </>
  ),
  plate: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4.5" />
      <path d="M2.5 4v5M1 4v3.5a1.5 1.5 0 0 0 3 0V4M21.5 4c-1.5 1-1.5 3.5-1.5 5h1.5V4z" />
    </>
  ),
  egg: (
    <>
      <path d="M12.6 3.6c3.4.3 6.6 2.9 6.9 6.4.3 3-1.6 4.1-2.3 6-.9 2.6-2.7 4.4-5.9 4.4-4 0-7.3-2.9-7.3-7.1 0-3.1 1.6-4.6 3.2-6.1 1.4-1.3 2.9-3.8 5.4-3.6z" />
      <circle cx="11.6" cy="12.4" r="3.1" />
    </>
  ),
  pot: (
    <>
      <path d="M4.5 10.5h15v6a3.5 3.5 0 0 1-3.5 3.5H8a3.5 3.5 0 0 1-3.5-3.5z" />
      <path d="M2.5 10.5h19M9.5 3.5c0 1.2 1 1.6 1 2.8M13.5 3.5c0 1.2 1 1.6 1 2.8" />
    </>
  ),
  steak: (
    <>
      <path d="M3.5 12.6c0-4.7 4-8.1 9.3-8.1 4.3 0 7.7 2.6 7.7 6.3 0 2.3-1.4 3.6-3.4 4.4-1.6.6-2.4 1.4-3.2 2.6-1.1 1.6-2.5 2.2-4.4 2.2-3.5 0-6-3.1-6-7.4z" />
      <path d="M6.4 9.3c1.5-1.8 3.7-2.8 6.3-2.8 2.9 0 5.3 1.4 5.6 3.6" />
      <circle cx="8.6" cy="13.4" r="1.7" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3 19.5c.6-3.3 3-5.2 6-5.2s5.4 1.9 6 5.2M15.5 5.6a3.2 3.2 0 0 1 0 6M17.5 14.6c1.8.6 3.1 2.2 3.5 4.9" />
    </>
  ),
  flame: <path d="M12 21c-3.9 0-6.5-2.6-6.5-6.1 0-3.9 3.3-5.6 3.6-9.4 2.3 1.4 3.4 3.3 3.5 5.4 1-.8 1.6-2 1.7-3.4 2.6 2 4.2 4.6 4.2 7.4 0 3.5-2.6 6.1-6.5 6.1z" />,
  bottle: <path d="M9.5 3h5M10.5 3v3.2L8.5 9.5V20a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V9.5l-2-3.3V3M8.5 13.5h7" />,
  arrow: <path d="M4.5 12h15M13.5 6l6 6-6 6" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.6A8 8 0 0 1 9.4 4a8 8 0 1 0 10.6 10.6z" />,
  bag: (
    <>
      <path d="M5.5 8h13l-1.1 11.2a1.5 1.5 0 0 1-1.5 1.3H8.1a1.5 1.5 0 0 1-1.5-1.3L5.5 8Z" />
      <path d="M9 10V7a3 3 0 0 1 6 0v3" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  heart: <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z" />,
  spark: <path d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7z" />,
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </>
  ),
};

export default function Icon({ name, className, title }: { name: IconName; className?: string; title?: string }) {
  const a11y = title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true as const };
  if (name === 'whatsapp') {
    return (
      <svg viewBox="0 0 32 32" className={className} fill="currentColor" {...a11y}>
        <path d="M16.04 3A12.93 12.93 0 0 0 5.1 22.82L3.27 29l6.34-1.76A12.96 12.96 0 1 0 16.04 3Zm0 23.74a10.74 10.74 0 0 1-5.48-1.5l-.39-.23-3.76 1.04 1-3.66-.25-.38a10.75 10.75 0 1 1 8.88 4.73Zm5.9-8.04c-.32-.16-1.91-.94-2.2-1.05-.3-.11-.51-.16-.73.16-.21.32-.83 1.05-1.02 1.26-.19.22-.38.24-.7.08-.33-.16-1.37-.5-2.6-1.61a9.73 9.73 0 0 1-1.8-2.24c-.2-.32-.02-.5.14-.66.15-.14.32-.38.49-.57.16-.19.21-.32.32-.54.11-.21.05-.4-.03-.57-.08-.16-.73-1.75-1-2.4-.26-.63-.53-.54-.72-.55h-.62c-.22 0-.57.08-.87.4-.3.33-1.13 1.11-1.13 2.7 0 1.59 1.16 3.12 1.32 3.34.16.21 2.28 3.48 5.52 4.88.77.33 1.37.53 1.84.68.77.24 1.48.21 2.03.13.62-.1 1.91-.79 2.18-1.54.27-.76.27-1.4.19-1.54-.08-.13-.3-.21-.62-.38Z" />
      </svg>
    );
  }
  if (name === 'send') {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="currentColor" {...a11y}>
        <path d="m3.4 20.4 17.45-7.48a1 1 0 0 0 0-1.84L3.4 3.6a.95.95 0 0 0-1.3 1.03l.92 5.6L14 12 3.02 13.77l-.92 5.6a.95.95 0 0 0 1.3 1.03Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...a11y}>
      {paths[name]}
    </svg>
  );
}
