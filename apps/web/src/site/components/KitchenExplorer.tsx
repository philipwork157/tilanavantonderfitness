import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import RecipeCard, { type RecipeCardData } from './RecipeCard';

/** Recipe list with meal filters and a "most protein" sort. */
export default function KitchenExplorer({ recipes, meals }: { recipes: RecipeCardData[]; meals: string[] }) {
  const [filter, setFilter] = useState('All');
  const [sort, setSort] = useState<'new' | 'protein'>('new');
  const counts = Object.fromEntries(meals.map((m) => [m, recipes.filter((r) => r.meal === m).length]));
  const filtered = filter === 'All' ? recipes : recipes.filter((r) => r.meal === filter);
  const shown = sort === 'protein' ? [...filtered].sort((a, b) => b.protein - a.protein) : filtered;

  return (
    <div className="kitchen-explorer">
      <div className="kx-bar">
        <div className="chips" role="group" aria-label="Filter by meal">
          {['All', ...meals.filter((m) => counts[m])].map((m) => (
            <button key={m} type="button" className={filter === m ? 'chip on' : 'chip'} aria-pressed={filter === m} onClick={() => setFilter(m)}>
              {m}<small>{m === 'All' ? recipes.length : counts[m]}</small>
            </button>
          ))}
        </div>
        <div className="seg kx-sort" role="radiogroup" aria-label="Sort recipes">
          {([['new', 'Newest'], ['protein', 'Most protein']] as const).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={sort === k} className={sort === k ? 'on' : ''} onClick={() => setSort(k)}>
              {sort === k && <motion.span layoutId="kx-sort" className="seg-pill" />}<span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      <motion.ul layout className="recipe-grid">
        <AnimatePresence mode="popLayout">
          {shown.map((r) => (
            <motion.li layout key={r.slug} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.35 }}>
              <RecipeCard recipe={r} headingLevel={2} />
            </motion.li>
          ))}
        </AnimatePresence>
      </motion.ul>
    </div>
  );
}
