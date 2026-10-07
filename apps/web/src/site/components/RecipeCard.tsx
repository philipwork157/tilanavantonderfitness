import Icon, { type IconName } from './Icon';

export type RecipeCardData = {
  slug: string;
  href: string;
  title: string;
  description: string;
  meal: string;
  protein: number;
  kcal: number;
  minutes: number;
  servings: number;
  tone: string;
  icon: IconName;
  image?: string;
  imageAlt?: string;
};

/** One recipe tile. Used as-is in Astro (no JS) and inside the kitchen filter. */
export default function RecipeCard({ recipe: r, headingLevel = 3 }: { recipe: RecipeCardData; headingLevel?: 2 | 3 }) {
  const H = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <a className="recipe-card card lift" href={r.href}>
      <div className={`recipe-art tone-${r.tone}`}>
        {r.image ? <img src={r.image} alt={r.imageAlt ?? ''} loading="lazy" decoding="async" /> : <Icon name={r.icon} className="recipe-icon" />}
        <span className="recipe-meal">{r.meal}</span>
        <span className="recipe-protein" aria-label={`${r.protein} grams of protein per serving`}>
          <b aria-hidden="true">{r.protein}<i>g</i></b>
          <small aria-hidden="true">protein</small>
        </span>
      </div>
      <div className="recipe-body">
        <H>{r.title}</H>
        <p>{r.description}</p>
        <ul className="recipe-facts">
          <li><Icon name="clock" />{r.minutes} min</li>
          <li><Icon name="flame" />{r.kcal} kcal</li>
          <li><Icon name="users" />Serves {r.servings}</li>
        </ul>
      </div>
    </a>
  );
}
