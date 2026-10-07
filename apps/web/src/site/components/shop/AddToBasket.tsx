import { AnimatePresence, motion } from 'motion/react';
import { addAndOpen, openBasket, productBySlug, useBasket } from './basket';

/** "Add to basket" that turns into "In basket" (which opens the basket) once added. */
export default function AddToBasket({ slug, label = 'Add to basket', className = 'btn btn-primary' }: { slug: string; label?: string; className?: string }) {
  const basket = useBasket();
  const product = productBySlug.get(slug);
  if (!product) return null;
  const inBasket = basket.includes(slug);
  return (
    <button
      type="button"
      className={`${className} add-btn${inBasket ? ' is-in' : ''}`}
      aria-label={inBasket ? `${product.name} is in your basket. View basket` : `Add ${product.name} to basket`}
      onClick={() => (inBasket ? openBasket() : addAndOpen([slug]))}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={inBasket ? 'in' : 'add'} initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -8, opacity: 0 }} transition={{ duration: 0.16 }}>
          {inBasket ? '✓ In basket' : label}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
