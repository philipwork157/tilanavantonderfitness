import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * The page's address on the website, made by the server from the title or name:
 * it follows the title until the page is published, then stays fixed so links
 * people shared keep working. Read-only, nothing to type.
 */
export function WebAddress({ path, live, noun }: { path: string; live: boolean; noun: string }) {
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium">Web address</span>
      <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm break-all text-muted-foreground select-all">{path}</p>
      <p className="text-xs text-muted-foreground">
        {live
          ? `Fixed now that the ${noun} is on the website, so links people shared keep working.`
          : `Made from the name when you save, until the ${noun} is first published. After that it never changes.`}
      </p>
    </div>
  );
}

/** "View on the website" for a page that is live. */
export function ViewOnWebsite({ href }: { href: string | null }) {
  if (!href) return null;
  return (
    <Button asChild variant="ghost" className="rounded-full">
      <a href={href} target="_blank" rel="noreferrer">View on website <ExternalLink /></a>
    </Button>
  );
}
