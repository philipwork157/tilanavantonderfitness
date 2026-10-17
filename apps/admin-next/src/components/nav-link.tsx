'use client';

import Link from 'next/link';
import type { ComponentProps } from 'react';
import { startNavigation } from '@/lib/navigation-progress';

type NavLinkProps = Omit<ComponentProps<typeof Link>, 'href'> & { href: string };

/** Next.js `Link` that starts the top progress bar on a normal click. Use it for every internal link. */
export function NavLink({ onClick, ...props }: NavLinkProps) {
  return (
    <Link
      {...props}
      onClick={(event) => {
        onClick?.(event);
        const newTab = event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || props.target === '_blank';
        if (!event.defaultPrevented && !newTab) startNavigation(props.href);
      }}
    />
  );
}
