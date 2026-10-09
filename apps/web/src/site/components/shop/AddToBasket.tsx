import { AnimatePresence, motion } from 'motion/react';
import { addAndOpen, openBasket, useBasket } from './basket';

/** "Add to basket" that turns into "In basket" (which opens the basket) once added. */
export default function AddToBasket({ slug, name, label = 'Add to basket', className = 'btn btn-primary', onAdd }: {
  slug: string;
  name: string;
  label?: string;
  className?: string;
  /** Runs just before the basket opens, e.g. to close a pop-up. */
  onAdd?: () => void;
}) {
  const basket = useBasket();
  const inBasket = basket.includes(slug);
  return (
    <button
      type="button"
      className={`${className} add-btn${inBasket ? ' is-in' : ''}`}
      aria-label={inBasket ? `${name} is in your basket. View basket` : `Add ${name} to basket`}
      onClick={() => {
        onAdd?.();
        if (inBasket) openBasket();
        else addAndOpen([slug]);
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={inBasket ? 'in' : 'add'} initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -8, opacity: 0 }} transition={{ duration: 0.16 }}>
          {inBasket ? '✓ In basket' : label}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
