import { Skeleton } from '@/components/ui/skeleton';

/**
 * Shown by the route `loading.tsx` files the instant a page is clicked, while
 * the server checks the session and renders the page. Shapes follow the real
 * pages so nothing jumps when they arrive.
 */
export function PageSkeleton({ variant, label, wide = false }: { variant: 'tiles' | 'table' | 'editor'; label: string; wide?: boolean }) {
  return (
    <div className={wide ? 'w-full' : 'mx-auto w-full max-w-6xl'} aria-busy="true">
      <p role="status" className="sr-only">Loading {label}</p>
      {variant === 'editor' ? <EditorSkeleton /> : (
        <>
          <HeaderSkeleton />
          {variant === 'tiles' ? <TilesSkeleton /> : <TableSkeleton />}
        </>
      )}
    </div>
  );
}

function HeaderSkeleton() {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 md:mb-8">
      <div className="grid gap-3">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-9 w-56 md:h-10 md:w-72" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <Skeleton className="h-9 w-28 rounded-full" />
    </div>
  );
}

function TilesSkeleton() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((tile) => (
        <div key={tile} className="flex min-h-44 flex-col justify-between rounded-2xl border-2 border-border bg-card p-5">
          <Skeleton className="size-11 rounded-xl" />
          <div className="grid gap-3">
            <Skeleton className="h-10 w-16" />
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-44" />
          </div>
        </div>
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Skeleton className="h-9 w-56 rounded-lg" />
        <Skeleton className="h-4 w-20" />
      </div>
      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="flex gap-6 border-b px-5 py-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-32" />
          <Skeleton className="ml-auto h-3 w-16" />
        </div>
        {[0, 1, 2, 3, 4].map((row) => (
          <div key={row} className="flex items-center gap-4 border-b px-5 py-4 last:border-b-0">
            <Skeleton className="size-10 shrink-0 rounded-lg" />
            <div className="grid flex-1 gap-2">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </>
  );
}

function EditorSkeleton() {
  return (
    <>
      <Skeleton className="mb-6 h-4 w-24" />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-9 w-64 md:h-10 md:w-96" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24 rounded-full" />
          <Skeleton className="h-9 w-28 rounded-full" />
        </div>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid gap-5">
          <div className="grid gap-4 rounded-2xl border bg-card p-5">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-16 w-full" />
          </div>
          <div className="grid gap-4 rounded-2xl border bg-card p-5">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-72 w-full" />
          </div>
        </div>
        <div className="grid gap-4 rounded-2xl border bg-card p-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="aspect-[4/3] w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
    </>
  );
}
