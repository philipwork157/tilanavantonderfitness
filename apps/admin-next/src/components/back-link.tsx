import { ArrowLeft } from 'lucide-react';
import { NavLink } from '@/components/nav-link';
import { cn } from '@/lib/utils';

/** "← Volume 1": the way back to the list a page belongs to, flush with the page's left edge. */
export function BackLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <NavLink
      href={href}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        className,
      )}
    >
      <ArrowLeft className="size-4" aria-hidden /> {children}
    </NavLink>
  );
}
