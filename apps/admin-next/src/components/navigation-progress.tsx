'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { finishNavigation, usePendingNavigation } from '@/lib/navigation-progress';

/** Thin brand-coloured bar along the top of the window while the next page loads. */
export function NavigationProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const loading = usePendingNavigation() !== null;

  // The address changed, so the new page (or its loading skeleton) is on screen.
  useEffect(() => { finishNavigation(); }, [pathname, search]);

  return (
    <>
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]">
        <div className="nav-progress h-full origin-left bg-primary shadow-[0_0_10px_var(--primary)]" data-loading={loading} />
      </div>
      <p role="status" className="sr-only">{loading ? 'Loading page' : ''}</p>
    </>
  );
}
