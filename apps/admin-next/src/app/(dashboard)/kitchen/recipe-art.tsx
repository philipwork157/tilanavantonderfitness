import type { RecipeIcon, RecipeTone } from '@tilana/contracts/kitchen';
import { Beef, CookingPot, Egg, Sandwich, Soup, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Stand-ins for the website's recipe drawings (the website draws its own versions). */
export const recipeIcons: Record<RecipeIcon, { icon: LucideIcon; label: string }> = {
  plate: { icon: UtensilsCrossed, label: 'Plate' },
  bowl: { icon: Soup, label: 'Bowl' },
  toast: { icon: Sandwich, label: 'Toast' },
  egg: { icon: Egg, label: 'Egg' },
  pot: { icon: CookingPot, label: 'Pot' },
  steak: { icon: Beef, label: 'Steak' },
};

/** The website's card colours. */
export const recipeTones: Record<RecipeTone, { className: string; label: string }> = {
  terracotta: { className: 'bg-tone-terracotta text-foreground', label: 'Terracotta' },
  sage: { className: 'bg-tone-sage text-foreground', label: 'Sage' },
  sand: { className: 'bg-tone-sand text-foreground', label: 'Sand' },
  white: { className: 'bg-background text-foreground', label: 'White' },
  caramel: { className: 'bg-tone-caramel text-foreground', label: 'Caramel' },
};

/** The top of a recipe card: the photo, or the drawing on its colour, with the protein badge. */
export function RecipeArt({ imageUrl, imageAlt, tone, icon, protein, className, size = 'md' }: {
  imageUrl: string | null;
  imageAlt?: string | null;
  tone: RecipeTone;
  icon: RecipeIcon;
  protein?: number;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const Icon = recipeIcons[icon]?.icon ?? UtensilsCrossed;
  return (
    <div className={cn('relative grid place-items-center overflow-hidden', recipeTones[tone]?.className ?? recipeTones.sand.className, className)}>
      {imageUrl
        // eslint-disable-next-line @next/next/no-img-element -- remote Supabase image chosen by the admin
        ? <img src={imageUrl} alt={imageAlt ?? ''} loading="lazy" className="absolute inset-0 size-full object-cover" />
        : <Icon className={cn('opacity-70', size === 'sm' ? 'size-5' : 'size-14')} strokeWidth={1.25} aria-hidden />}
      {protein !== undefined && size === 'md' && (
        <span className="absolute right-3 bottom-3 grid min-w-14 justify-items-center rounded-full border-2 border-foreground bg-card px-2.5 py-1.5 text-foreground shadow-[3px_3px_0_var(--hard-shadow)]">
          <b className="font-heading text-xl leading-none tabular-nums">{protein}<i className="text-xs not-italic">g</i></b>
          <small className="text-[10px] font-bold tracking-wide uppercase">protein</small>
        </span>
      )}
    </div>
  );
}
