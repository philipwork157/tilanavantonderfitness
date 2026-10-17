import { motion } from 'motion/react';
import Icon from '../Icon';
import { openBasket, useBasket } from './basket';

/** Header basket icon with a live count. */
export default function BasketButton() {
  const count = useBasket().length;
  return (
    <button type="button" className="icon-btn" onClick={() => openBasket()} aria-label={`Basket, ${count} program${count === 1 ? '' : 's'}`}>
      <Icon name="bag" />
      {count > 0 && (
        <motion.span key={count} className="basket-count" initial={{ scale: 0.3 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 520, damping: 18 }}>
          {count}
        </motion.span>
      )}
    </button>
  );
}
