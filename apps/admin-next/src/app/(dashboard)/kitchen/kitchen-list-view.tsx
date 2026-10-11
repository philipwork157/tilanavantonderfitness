'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { ChefHat, Clock, Flame, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { EmptyState } from '@/components/empty-state';
import { NavLink } from '@/components/nav-link';
import { PageHeader } from '@/components/page-header';
import { RefreshButton } from '@/components/refresh-button';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { api, ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useNavigate } from '@/lib/navigation-progress';
import type { RecipeSummary } from '@/lib/types';
import { RecipeArt } from './recipe-art';

type Filter = 'all' | 'published' | 'draft';

/** Kitchen: the recipes on the website's /kitchen pages. */
export function KitchenListView() {
  const router = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');

  const { data, error, isPending, isFetching, refetch } = useQuery({
    queryKey: ['recipes'],
    queryFn: () => api<{ recipes: RecipeSummary[] }>('/api/recipes'),
  });
  const all = data?.recipes ?? [];
  const shown = filter === 'all' ? all : all.filter((recipe) => recipe.status === filter);
  const live = all.filter((recipe) => recipe.status === 'published').length;

  const create = useMutation({
    mutationFn: (newTitle: string) => api<{ id: number }>('/api/recipes', { method: 'POST', body: JSON.stringify({ title: newTitle }) }),
    onSuccess: ({ id }) => {
      setCreateOpen(false);
      setTitle('');
      router.push(`/kitchen/${id}`);
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate(title.trim());
  }

  const newRecipeButton = (
    <Button className="rounded-full" onClick={() => { create.reset(); setCreateOpen(true); }}>
      <Plus /> New recipe
    </Button>
  );

  return (
    <div className="w-full">
      <PageHeader
        eyebrow="Website"
        title="Kitchen"
        description="Recipes for the Kitchen page. Published recipes appear on the website within about five minutes."
        actions={<><RefreshButton loading={isFetching} onClick={() => refetch()} />{newRecipeButton}</>}
      />

      {error ? (
        <div role="alert" className="rounded-2xl border-2 border-destructive/40 bg-destructive/10 p-6 text-sm font-medium text-destructive">
          The recipes could not be loaded: {error instanceof ApiError ? error.message : 'please try again.'}
        </div>
      ) : !isPending && all.length === 0 ? (
        <EmptyState icon={ChefHat} title="No recipes yet" description="Add the first recipe. It stays a draft until you publish it.">
          <div className="mt-3">{newRecipeButton}</div>
        </EmptyState>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <ToggleGroup type="single" variant="outline" value={filter} onValueChange={(value) => value && setFilter(value as Filter)} className="bg-card" aria-label="Show">
              <ToggleGroupItem value="all" className="px-4">All</ToggleGroupItem>
              <ToggleGroupItem value="published" className="px-4">On the website</ToggleGroupItem>
              <ToggleGroupItem value="draft" className="px-4">Drafts</ToggleGroupItem>
            </ToggleGroup>
            {!isPending && <p className="text-sm text-muted-foreground">{live} of {all.length} on the website</p>}
          </div>

          {shown.length === 0 && !isPending ? (
            <p className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">No recipes here yet.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {isPending && Array.from({ length: 4 }, (_, index) => (
                <li key={index} className="overflow-hidden rounded-2xl border bg-card"><Skeleton className="aspect-[4/3] w-full rounded-none" /><div className="grid gap-2 p-4"><Skeleton className="h-5 w-3/4" /><Skeleton className="h-4 w-1/2" /></div></li>
              ))}
              {shown.map((recipe) => (
                <li key={recipe.id}>
                  <NavLink
                    href={`/kitchen/${recipe.id}`}
                    className="group grid h-full overflow-hidden rounded-2xl border-2 border-foreground bg-card transition-shadow hover:shadow-[5px_5px_0_var(--hard-shadow)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <div className="relative">
                      <RecipeArt imageUrl={recipe.imageUrl} tone={recipe.tone} icon={recipe.icon} protein={recipe.proteinG} className="aspect-[4/3] border-b-2 border-foreground" />
                      <span className="absolute top-3 left-3 rounded-full bg-card/95 px-2.5 py-1 text-[11px] font-bold tracking-wide uppercase">{recipe.meal}</span>
                    </div>
                    <div className="grid content-start gap-2 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge label={recipe.status === 'published' ? 'On the website' : 'Draft'} tone={recipe.status === 'published' ? 'success' : 'neutral'} />
                        {recipe.sample && <StatusBadge label="Sample" tone="info" />}
                      </div>
                      <h2 className="font-heading text-xl leading-tight font-bold break-words">{recipe.title}</h2>
                      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><Clock className="size-3.5" aria-hidden />{recipe.prepMinutes + recipe.cookMinutes} min</span>
                        <span className="inline-flex items-center gap-1"><Flame className="size-3.5" aria-hidden />{recipe.kcal} kcal</span>
                        <span>{recipe.status === 'published' && recipe.publishedAt ? `Published ${formatDate(recipe.publishedAt)}` : `Edited ${formatDate(recipe.updatedAt)}`}</span>
                      </p>
                    </div>
                  </NavLink>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <form onSubmit={submit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle className="font-heading text-2xl">New recipe</DialogTitle>
              <DialogDescription>Start with the name. You can change everything later.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="new-title">Recipe name</Label>
              <Input id="new-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Chicken, rice & veg bowl" maxLength={120} autoFocus />
              {create.error && <p role="alert" className="text-sm text-destructive">{create.error instanceof ApiError ? create.error.message : 'Could not create the recipe.'}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={title.trim().length < 3 || create.isPending}>{create.isPending ? 'Creating…' : 'Create draft'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
