'use client';

import {
  MAX_RECIPE_INGREDIENTS, MAX_RECIPE_STEPS, MAX_RECIPE_TAGS, RECIPE_ICONS, RECIPE_MEALS, RECIPE_TONES,
  type RecipeMeal,
} from '@tilana/contracts/kitchen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown, ArrowLeft, ArrowUp, EyeOff, Globe, Loader2, Plus, Save, Trash2, TriangleAlert, Upload, X,
} from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { SaveStatus } from '@/components/save-status';
import { BackLink } from '@/components/back-link';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { MarkdownEditor } from '@/components/markdown-editor';
import { NavLink } from '@/components/nav-link';
import { StatusBadge } from '@/components/status-badge';
import { PublishChecklist } from '@/components/publish-checklist';
import { ViewOnWebsite, WebAddress } from '@/components/web-address';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api';
import { useNavigate } from '@/lib/navigation-progress';
import type { AdminRecipe, BlogPostSummary } from '@/lib/types';
import { useUnsavedGuard } from '@/lib/use-unsaved-guard';
import { cn } from '@/lib/utils';
import { RecipeArt, recipeIcons, recipeTones } from '../recipe-art';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/** Common units, offered as suggestions (any text is allowed). */
const UNITS = ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'cups', 'slice', 'slices', 'clove', 'cloves', 'pinch', 'handful', 'can', 'tin'];
const NO_POST = 'none';

let keySeed = 0;
const newKey = () => `row-${(keySeed += 1)}`;

interface IngredientRow { key: string; qty: string; unit: string; item: string; note: string }
interface StepRow { key: string; text: string }

/** Editable copy of a recipe. Numbers stay text while typing; dates are yyyy-mm-dd in South African time. */
function toForm(recipe: AdminRecipe) {
  return {
    title: recipe.title,
    description: recipe.description,
    meal: recipe.meal,
    prepMinutes: String(recipe.prepMinutes),
    cookMinutes: String(recipe.cookMinutes),
    servings: String(recipe.servings),
    kcal: String(recipe.kcal),
    proteinG: String(recipe.proteinG),
    carbsG: String(recipe.carbsG),
    fatG: String(recipe.fatG),
    proteinNote: recipe.proteinNote,
    ingredients: recipe.ingredients.map((row): IngredientRow => ({
      key: newKey(), qty: row.qty === undefined ? '' : String(row.qty), unit: row.unit ?? '', item: row.item, note: row.note ?? '',
    })),
    steps: recipe.steps.map((text): StepRow => ({ key: newKey(), text })),
    tags: recipe.tags,
    notesMarkdown: recipe.notesMarkdown,
    tone: recipe.tone,
    icon: recipe.icon,
    imageAlt: recipe.imageAlt ?? '',
    blogPostId: recipe.blogPostId,
    sample: recipe.sample,
    publishedOn: recipe.publishedAt
      ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg' }).format(new Date(recipe.publishedAt))
      : '',
  };
}
type RecipeForm = ReturnType<typeof toForm>;

/** Compares forms without the list keys, which change on every load. */
const comparable = (form: RecipeForm) => JSON.stringify({
  ...form,
  ingredients: form.ingredients.map(({ key: _key, ...row }) => row),
  steps: form.steps.map((step) => step.text),
});

const whole = (value: string) => {
  const number = Math.round(Number(value.replace(',', '.')));
  return Number.isFinite(number) && number > 0 ? number : 0;
};

function toPayload(form: RecipeForm) {
  return {
    title: form.title,
    description: form.description,
    meal: form.meal,
    prepMinutes: whole(form.prepMinutes),
    cookMinutes: whole(form.cookMinutes),
    servings: Math.max(1, whole(form.servings)),
    kcal: whole(form.kcal),
    proteinG: whole(form.proteinG),
    carbsG: whole(form.carbsG),
    fatG: whole(form.fatG),
    proteinNote: form.proteinNote,
    ingredients: form.ingredients
      .filter((row) => row.item.trim() || row.qty.trim() || row.unit.trim() || row.note.trim())
      .map((row) => {
        const qty = Number(row.qty.replace(',', '.'));
        return {
          ...(row.qty.trim() && Number.isFinite(qty) && qty > 0 ? { qty } : {}),
          ...(row.unit.trim() ? { unit: row.unit.trim() } : {}),
          item: row.item.trim(),
          ...(row.note.trim() ? { note: row.note.trim() } : {}),
        };
      }),
    steps: form.steps.map((step) => step.text.trim()).filter(Boolean),
    tags: form.tags,
    notesMarkdown: form.notesMarkdown,
    tone: form.tone,
    icon: form.icon,
    imageAlt: form.imageAlt,
    blogPostId: form.blogPostId,
    sample: form.sample,
    // Midday in South Africa keeps the chosen calendar day in every timezone.
    publishedAt: form.publishedOn ? `${form.publishedOn}T12:00:00+02:00` : null,
  };
}

const message = (error: unknown, fallback: string) => (error instanceof ApiError ? error.message : fallback);

export function RecipeEditor({ id }: { id: number }) {
  const { data, error, isPending } = useQuery({
    queryKey: ['recipe', id],
    queryFn: () => api<{ recipe: AdminRecipe }>(`/api/recipes/${id}`),
  });

  if (isPending) {
    return (
      <div className="grid w-full gap-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="grid w-full justify-items-start gap-4">
        <p role="alert" className="text-destructive">{message(error, 'Recipe not found.')}</p>
        <Button asChild variant="outline"><NavLink href="/kitchen"><ArrowLeft /> All recipes</NavLink></Button>
      </div>
    );
  }
  return <EditorForm initial={data.recipe} />;
}

function EditorForm({ initial }: { initial: AdminRecipe }) {
  const router = useNavigate();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [recipe, setRecipe] = useState(initial);
  const [form, setForm] = useState(() => toForm(initial));
  const [saved, setSaved] = useState(() => comparable(toForm(initial)));
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [removePhotoOpen, setRemovePhotoOpen] = useState(false);
  const dirty = comparable(form) !== saved;
  const isPublished = recipe.status === 'published';
  useUnsavedGuard(dirty);
  // The latest form and saved marker, for code that runs after a request.
  const formRef = useRef(form);
  const savedRef = useRef(saved);
  useEffect(() => {
    formRef.current = form;
    savedRef.current = saved;
  });

  const posts = useQuery({
    queryKey: ['blog-posts'],
    queryFn: () => api<{ posts: BlogPostSummary[] }>('/api/blog-posts'),
  });

  const set = <K extends keyof RecipeForm>(key: K, value: RecipeForm[K]) => setForm((current) => ({ ...current, [key]: value }));

  /**
   * Takes the server's copy after a save. The form is only replaced when
   * nothing was typed while the request ran (`sent` is what was sent);
   * otherwise the newer typing stays, still unsaved.
   */
  function applyServerRecipe(next: AdminRecipe, sent: RecipeForm = formRef.current) {
    setRecipe(next);
    if (comparable(formRef.current) === comparable(sent)) {
      const nextForm = toForm(next);
      setForm(nextForm);
      setSaved(comparable(nextForm));
    } else {
      setSaved(comparable(sent));
    }
    queryClient.setQueryData(['recipe', next.id], { recipe: next });
    void queryClient.invalidateQueries({ queryKey: ['recipes'] });
  }

  async function saveNow(): Promise<AdminRecipe> {
    const snapshot = formRef.current;
    const result = await api<{ recipe: AdminRecipe }>(`/api/recipes/${recipe.id}`, { method: 'PUT', body: JSON.stringify(toPayload(snapshot)) });
    applyServerRecipe(result.recipe, snapshot);
    return result.recipe;
  }

  /** Saves first when there is anything unsaved. */
  async function saveIfNeeded() {
    if (comparable(formRef.current) !== savedRef.current) await saveNow();
  }

  const save = useMutation({
    mutationFn: saveNow,
    onSuccess: () => toast.success('Saved'),
    onError: (error) => toast.error('Not saved', { description: message(error, 'Please try again.') }),
  });

  const changeStatus = useMutation({
    mutationFn: async (status: 'draft' | 'published') => {
      await saveIfNeeded();
      return api<{ recipe: AdminRecipe }>(`/api/recipes/${recipe.id}/status`, { method: 'POST', body: JSON.stringify({ status }) });
    },
    onSuccess: (result, status) => {
      applyServerRecipe(result.recipe);
      toast.success(status === 'published' ? 'Published' : 'Moved to drafts', {
        description: status === 'published' ? 'It appears on the Kitchen page within about 5 minutes.' : 'It disappears from the website within about 5 minutes.',
      });
    },
    onError: (error) => toast.error('Not published yet', { description: message(error, 'Please try again.') }),
  });

  const photo = useMutation({
    mutationFn: async (file: File | null) => {
      if (!file) return api<{ recipe: AdminRecipe }>(`/api/recipes/${recipe.id}/image`, { method: 'DELETE' });
      const body = new FormData();
      body.append('file', file);
      return api<{ recipe: AdminRecipe }>(`/api/recipes/${recipe.id}/image`, { method: 'POST', body });
    },
    onSuccess: (result, file) => {
      setRecipe(result.recipe);
      queryClient.setQueryData(['recipe', recipe.id], { recipe: result.recipe });
      void queryClient.invalidateQueries({ queryKey: ['recipes'] });
      if (file) toast.success('Photo updated');
      else { setRemovePhotoOpen(false); toast.success('Photo removed', { description: 'The website shows the drawing instead.' }); }
    },
    onError: (error) => toast.error('Upload failed', { description: message(error, 'Please try another photo.') }),
  });

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error('Photo too large', { description: 'Please choose a photo smaller than 10 MB.' });
      return;
    }
    photo.mutate(file);
  }

  const remove = useMutation({
    mutationFn: async () => {
      return api(`/api/recipes/${recipe.id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      setSaved(comparable(form));
      void queryClient.invalidateQueries({ queryKey: ['recipes'] });
      toast.success('Recipe deleted');
      router.push('/kitchen');
    },
    onError: (error) => toast.error('Not deleted', { description: message(error, 'Please try again.') }),
  });

  const busy = save.isPending || changeStatus.isPending || photo.isPending;

  const servings = Math.max(1, whole(form.servings));

  return (
    <div className="w-full">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <BackLink href="/kitchen">All recipes</BackLink>
        <SaveStatus dirty={dirty} saving={save.isPending} />
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-2 text-xs font-extrabold tracking-[0.2em] text-brand-text uppercase">Kitchen recipe</p>
          <h1 className="font-heading text-3xl font-bold tracking-tight break-words md:text-4xl">{form.title || 'Untitled recipe'}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label={isPublished ? 'On the website' : 'Draft'} tone={isPublished ? 'success' : 'neutral'} className="max-sm:hidden" />
          <ViewOnWebsite href={recipe.publicUrl} />
          <Button variant="outline" className="rounded-full bg-card" disabled={!dirty || busy} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />} Save
          </Button>
          {isPublished ? (
            <Button variant="ghost" className="rounded-full" disabled={busy} onClick={() => changeStatus.mutate('draft')}>
              <EyeOff /> Unpublish
            </Button>
          ) : (
            <Button className="rounded-full" disabled={busy} onClick={() => changeStatus.mutate('published')}>
              {changeStatus.isPending ? <Loader2 className="animate-spin" /> : <Globe />} Publish
            </Button>
          )}
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="grid min-w-0 gap-5">
          <Panel>
            <Field id="title" label="Recipe name">
              <Input id="title" value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={120} className="h-11 text-lg font-semibold" />
            </Field>
            <Field id="description" label="Short description" hint="Shown on the recipe card and under the title. One sentence.">
              <Textarea id="description" value={form.description} onChange={(e) => set('description', e.target.value)} rows={2} maxLength={240} />
            </Field>
          </Panel>

          <Panel title="Ingredients" titleId="ingredients-heading" hint={`Amounts for ${servings} serving${servings === 1 ? '' : 's'}. Visitors can scale them on the website. Leave the amount empty for things like “salt and pepper”.`}>
            <Ingredients rows={form.ingredients} onChange={(rows) => set('ingredients', rows)} />
          </Panel>

          <Panel title="Method" titleId="method-heading" hint="One step per box, in order.">
            <Steps rows={form.steps} onChange={(rows) => set('steps', rows)} />
          </Panel>

          <Panel title="Tilana’s notes" titleId="notes-heading" hint="Shown under the method: tips, swaps, why you love it. A quote at the top becomes the large quote.">
            <MarkdownEditor value={form.notesMarkdown} onChange={(markdown) => set('notesMarkdown', markdown)} labelledBy="notes-heading" />
          </Panel>
        </div>

        <aside className="grid min-w-0 gap-5">
          {!isPublished && (
            <PublishChecklist items={[
              { label: 'A recipe name', done: form.title.trim().length >= 3 },
              { label: 'A short description', done: form.description.trim().length >= 10 },
              { label: 'At least one ingredient', done: form.ingredients.some((row) => row.item.trim()) },
              { label: 'At least one step in the method', done: form.steps.some((step) => step.text.trim()) },
              { label: 'Nutrition per serving', done: whole(form.kcal) > 0 && whole(form.proteinG) + whole(form.carbsG) + whole(form.fatG) > 0 },
              { label: 'The protein part', done: form.proteinNote.trim().length >= 10 },
              ...(recipe.imageUrl ? [{ label: 'A description of the photo', done: form.imageAlt.trim().length > 0 }] : []),
            ]} />
          )}
          <Panel title="Card" titleId="card-heading" hint="How the recipe looks on the Kitchen page.">
            <div className="overflow-hidden rounded-2xl border-2 border-foreground">
              <RecipeArt imageUrl={recipe.imageUrl} imageAlt={form.imageAlt} tone={form.tone} icon={form.icon} protein={whole(form.proteinG)} className="aspect-[4/3]" />
              <div className="grid gap-1 border-t-2 border-foreground bg-card p-3">
                <span className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase">{form.meal}</span>
                <span className="font-heading text-lg leading-tight font-bold">{form.title || 'Untitled recipe'}</span>
              </div>
            </div>
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={choosePhoto} aria-label="Choose a recipe photo" />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="bg-card" disabled={photo.isPending} onClick={() => fileInput.current?.click()}>
                {photo.isPending ? <Loader2 className="animate-spin" /> : <Upload />} {recipe.imageUrl ? 'Replace photo' : 'Upload photo'}
              </Button>
              {recipe.imageUrl && <Button variant="ghost" disabled={photo.isPending} onClick={() => setRemovePhotoOpen(true)}>Remove</Button>}
            </div>
            {recipe.imageUrl ? (
              <Field id="alt" label="Photo description" hint="Describe the photo for people using screen readers.">
                <Textarea id="alt" value={form.imageAlt} onChange={(e) => set('imageAlt', e.target.value)} rows={2} maxLength={250} />
              </Field>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">No photo yet, so the website shows a drawing. JPG, PNG or WebP up to 10 MB.</p>
                <ChoiceRow label="Drawing">
                  {RECIPE_ICONS.map((icon) => {
                    const Icon = recipeIcons[icon].icon;
                    return (
                      <ChoiceButton key={icon} selected={form.icon === icon} label={recipeIcons[icon].label} onClick={() => set('icon', icon)}>
                        <Icon className="size-5" aria-hidden />
                      </ChoiceButton>
                    );
                  })}
                </ChoiceRow>
              </>
            )}
            <ChoiceRow label="Colour">
              {RECIPE_TONES.map((tone) => (
                <ChoiceButton key={tone} selected={form.tone === tone} label={recipeTones[tone].label} onClick={() => set('tone', tone)}>
                  <span className={cn('size-6 rounded-full border', recipeTones[tone].className)} aria-hidden />
                </ChoiceButton>
              ))}
            </ChoiceRow>
          </Panel>

          <Panel title="Details" titleId="details-heading">
            <Field id="meal" label="Meal">
              <Select value={form.meal} onValueChange={(value) => set('meal', value as RecipeMeal)}>
                <SelectTrigger id="meal" className="w-full bg-card"><SelectValue /></SelectTrigger>
                <SelectContent>{RECIPE_MEALS.map((meal) => <SelectItem key={meal} value={meal}>{meal}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <NumberField id="prep" label="Prep (min)" value={form.prepMinutes} onChange={(value) => set('prepMinutes', value)} />
              <NumberField id="cook" label="Cook (min)" value={form.cookMinutes} onChange={(value) => set('cookMinutes', value)} />
              <NumberField id="servings" label="Serves" value={form.servings} onChange={(value) => set('servings', value)} />
            </div>
            <Tags tags={form.tags} onChange={(tags) => set('tags', tags)} />
          </Panel>

          <Panel title="Nutrition per serving" titleId="nutrition-heading" hint="Estimates are fine. The website says they are a guide.">
            <div className="grid grid-cols-2 gap-3">
              <NumberField id="kcal" label="Energy (kcal)" value={form.kcal} onChange={(value) => set('kcal', value)} />
              <NumberField id="protein" label="Protein (g)" value={form.proteinG} onChange={(value) => set('proteinG', value)} />
              <NumberField id="carbs" label="Carbs (g)" value={form.carbsG} onChange={(value) => set('carbsG', value)} />
              <NumberField id="fat" label="Fat (g)" value={form.fatG} onChange={(value) => set('fatG', value)} />
            </div>
            <EnergyCheck kcal={whole(form.kcal)} protein={whole(form.proteinG)} carbs={whole(form.carbsG)} fat={whole(form.fatG)} />
            <Field id="protein-note" label="The protein part" hint="One or two sentences on the protein in this meal, or how to add more.">
              <Textarea id="protein-note" value={form.proteinNote} onChange={(e) => set('proteinNote', e.target.value)} rows={3} maxLength={400} />
            </Field>
          </Panel>

          <Panel title="Settings" titleId="settings-heading">
            <Field id="from-post" label="From the blog" hint="Links the recipe to a post (shown while that post is published).">
              <Select value={form.blogPostId ? String(form.blogPostId) : NO_POST} onValueChange={(value) => set('blogPostId', value === NO_POST ? null : Number(value))}>
                <SelectTrigger id="from-post" className="w-full bg-card"><SelectValue placeholder="No blog post" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_POST}>No blog post</SelectItem>
                  {posts.data?.posts.map((post) => (
                    <SelectItem key={post.id} value={String(post.id)}>{post.title}{post.status === 'draft' ? ' (draft)' : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="flex items-start justify-between gap-4">
              <div className="grid gap-1">
                <Label htmlFor="sample">Sample recipe</Label>
                <p className="text-xs text-muted-foreground">Shows “A simple version of a meal I mention on the blog. My own recipe and photos are on their way.” Switch off once it is your own recipe.</p>
              </div>
              <Switch id="sample" checked={form.sample} onCheckedChange={(checked) => set('sample', checked)} />
            </div>
            <Field id="published-on" label="Publish date" hint={isPublished ? 'Newest recipes are shown first.' : 'Leave empty to use the day you publish.'}>
              <Input id="published-on" type="date" value={form.publishedOn} onChange={(e) => set('publishedOn', e.target.value)} />
            </Field>
            <WebAddress path={`/kitchen/${recipe.slug}`} live={isPublished} noun="recipe" />
          </Panel>

          <Panel title="Delete" titleId="delete-heading" hint="Removes the recipe and its photo for good." danger>
            <Button variant="outline" className="border-destructive/50 bg-card text-destructive hover:bg-destructive/10" onClick={() => setDeleteOpen(true)}>
              <Trash2 /> Delete recipe
            </Button>
          </Panel>
        </aside>
      </div>

      <ConfirmDialog
        open={removePhotoOpen}
        onOpenChange={setRemovePhotoOpen}
        title="Remove the photo?"
        description="The photo is deleted from storage. The website shows the drawing until you upload a new photo."
        confirmLabel="Remove photo"
        pendingLabel="Removing…"
        cancelLabel="Keep photo"
        pending={photo.isPending}
        onConfirm={() => photo.mutate(null)}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete “${recipe.title}”?`}
        description="The recipe and its photo will be removed from the admin and the website. This can’t be undone."
        confirmLabel="Delete recipe"
        cancelLabel="Keep recipe"
        pending={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}

/* ── Lists ── */

/** Moves the item at `from` one place up or down. */
function move<T>(rows: T[], from: number, by: -1 | 1): T[] {
  const to = from + by;
  if (to < 0 || to >= rows.length) return rows;
  const next = [...rows];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}

function RowTools({ index, count, label, onMove, onRemove }: { index: number; count: number; label: string; onMove: (by: -1 | 1) => void; onRemove: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Button type="button" size="icon" variant="ghost" className="size-8" disabled={index === 0} onClick={() => onMove(-1)} aria-label={`Move ${label} up`}><ArrowUp /></Button>
      <Button type="button" size="icon" variant="ghost" className="size-8" disabled={index === count - 1} onClick={() => onMove(1)} aria-label={`Move ${label} down`}><ArrowDown /></Button>
      <Button type="button" size="icon" variant="ghost" className="size-8 text-muted-foreground hover:text-destructive" onClick={onRemove} aria-label={`Remove ${label}`}><X /></Button>
    </div>
  );
}

function Ingredients({ rows, onChange }: { rows: IngredientRow[]; onChange: (rows: IngredientRow[]) => void }) {
  const update = (index: number, patch: Partial<IngredientRow>) => onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  return (
    <div className="grid gap-3">
      {rows.length > 0 && (
        <div className="hidden grid-cols-[5rem_6rem_minmax(0,1.4fr)_minmax(0,1fr)_6.5rem] gap-2 px-1 text-xs font-bold text-muted-foreground md:grid" aria-hidden>
          <span>Amount</span><span>Unit</span><span>Ingredient</span><span>Note</span><span />
        </div>
      )}
      <ol className="grid gap-3 md:gap-2">
        {rows.map((row, index) => {
          const name = row.item.trim() || `ingredient ${index + 1}`;
          // Example text only in a new, empty row, so it is never mistaken for a real amount or note.
          const fresh = !row.item && !row.qty && !row.unit && !row.note;
          return (
            <li key={row.key} className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2 rounded-xl border bg-muted/30 p-2 md:grid-cols-[5rem_6rem_minmax(0,1.4fr)_minmax(0,1fr)_6.5rem] md:items-center md:rounded-none md:border-0 md:bg-transparent md:p-0">
              <Input aria-label={`Amount for ${name}`} inputMode="decimal" placeholder={fresh ? '300' : undefined} value={row.qty} onChange={(e) => update(index, { qty: e.target.value })} className="bg-card" />
              <Input aria-label={`Unit for ${name}`} list="recipe-units" placeholder={fresh ? 'g' : undefined} value={row.unit} maxLength={20} onChange={(e) => update(index, { unit: e.target.value })} className="bg-card" />
              <Input aria-label={`Ingredient ${index + 1}`} placeholder={fresh ? 'chicken breast' : undefined} value={row.item} maxLength={80} onChange={(e) => update(index, { item: e.target.value })} className="col-span-2 bg-card md:col-span-1" />
              <Input aria-label={`Note for ${name}`} placeholder={fresh ? 'cut into strips' : undefined} value={row.note} maxLength={80} onChange={(e) => update(index, { note: e.target.value })} className="col-span-2 bg-card md:col-span-1" />
              <div className="col-span-2 flex justify-end md:col-span-1">
                <RowTools index={index} count={rows.length} label={name} onMove={(by) => onChange(move(rows, index, by))} onRemove={() => onChange(rows.filter((_, i) => i !== index))} />
              </div>
            </li>
          );
        })}
      </ol>
      <datalist id="recipe-units">{UNITS.map((unit) => <option key={unit} value={unit} />)}</datalist>
      <Button type="button" variant="outline" className="justify-self-start bg-card" disabled={rows.length >= MAX_RECIPE_INGREDIENTS}
        onClick={() => onChange([...rows, { key: newKey(), qty: '', unit: '', item: '', note: '' }])}>
        <Plus /> Add ingredient
      </Button>
    </div>
  );
}

function Steps({ rows, onChange }: { rows: StepRow[]; onChange: (rows: StepRow[]) => void }) {
  return (
    <div className="grid gap-3">
      <ol className="grid gap-3">
        {rows.map((row, index) => (
          <li key={row.key} className="grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-2 sm:grid-cols-[2rem_minmax(0,1fr)_auto]">
            <span className="mt-1.5 grid size-7 place-items-center rounded-full bg-tone-terracotta text-sm font-bold" aria-hidden>{index + 1}</span>
            <Textarea aria-label={`Step ${index + 1}`} value={row.text} rows={2} maxLength={600}
              onChange={(e) => onChange(rows.map((step, i) => (i === index ? { ...step, text: e.target.value } : step)))} />
            <div className="col-start-2 flex justify-end sm:col-start-auto">
              <RowTools index={index} count={rows.length} label={`step ${index + 1}`} onMove={(by) => onChange(move(rows, index, by))} onRemove={() => onChange(rows.filter((_, i) => i !== index))} />
            </div>
          </li>
        ))}
      </ol>
      <Button type="button" variant="outline" className="justify-self-start bg-card" disabled={rows.length >= MAX_RECIPE_STEPS}
        onClick={() => onChange([...rows, { key: newKey(), text: '' }])}>
        <Plus /> Add step
      </Button>
    </div>
  );
}

function Tags({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const tag = draft.trim().slice(0, 30);
    if (tag && !tags.some((existing) => existing.toLowerCase() === tag.toLowerCase()) && tags.length < MAX_RECIPE_TAGS) onChange([...tags, tag]);
    setDraft('');
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      add();
    }
  };
  return (
    <div className="grid gap-2">
      <Label htmlFor="tags">Tags</Label>
      {tags.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <li key={tag} className="inline-flex items-center gap-1 rounded-full bg-secondary py-1 pr-1 pl-3 text-xs font-semibold">
              {tag}
              <button type="button" className="grid size-5 place-items-center rounded-full hover:bg-background" onClick={() => onChange(tags.filter((t) => t !== tag))} aria-label={`Remove tag ${tag}`}>
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input id="tags" value={draft} placeholder="High protein" maxLength={30} disabled={tags.length >= MAX_RECIPE_TAGS} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKeyDown} />
        <Button type="button" variant="outline" className="bg-card" disabled={!draft.trim() || tags.length >= MAX_RECIPE_TAGS} onClick={add}>Add</Button>
      </div>
      <p className="text-xs text-muted-foreground">Up to {MAX_RECIPE_TAGS}, for example “Quick” or “Vegetarian”. Press Enter to add.</p>
    </div>
  );
}

/** Protein and carbs give 4 kcal a gram, fat 9: a gentle warning when the numbers don't add up. */
function EnergyCheck({ kcal, protein, carbs, fat }: { kcal: number; protein: number; carbs: number; fat: number }) {
  const fromMacros = protein * 4 + carbs * 4 + fat * 9;
  if (!kcal || !fromMacros) return null;
  const off = Math.abs(fromMacros - kcal) / kcal;
  return off > 0.15 ? (
    <p className="flex items-start gap-2 rounded-lg bg-status-warning-bg px-3 py-2 text-xs text-status-warning">
      <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
      Protein, carbs and fat add up to about {Math.round(fromMacros)} kcal, not {kcal}. Worth a second look.
    </p>
  ) : (
    <p className="text-xs text-muted-foreground">Protein gives {Math.round((protein * 4 / fromMacros) * 100)}% of the energy.</p>
  );
}

/* ── Small parts ── */

function ChoiceRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function ChoiceButton({ selected, label, onClick, children }: { selected: boolean; label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'grid size-10 place-items-center rounded-xl border-2 bg-card transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        selected ? 'border-foreground shadow-[2px_2px_0_var(--hard-shadow)]' : 'border-transparent hover:border-border',
      )}
    >
      {children}
    </button>
  );
}

function NumberField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="grid min-w-0 gap-2">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <Input id={id} inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, '').slice(0, 5))} className="tabular-nums" />
    </div>
  );
}

function Panel({ title, titleId, hint, danger, children }: { title?: string; titleId?: string; hint?: string; danger?: boolean; children: ReactNode }) {
  return (
    <section aria-labelledby={titleId} className={cn('grid min-w-0 gap-4 rounded-2xl border bg-card p-5', danger && 'border-destructive/30')}>
      {title && <h2 id={titleId} className="text-sm font-extrabold tracking-[0.14em] uppercase">{title}</h2>}
      {hint && <p className="-mt-2 text-xs text-muted-foreground">{hint}</p>}
      {children}
    </section>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

