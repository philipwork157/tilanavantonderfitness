import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';

type Item = { q: string; a: ReactNode };

export default function Faq({ items }: { items: Item[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="faq">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div className={isOpen ? 'faq-item open' : 'faq-item'} key={item.q}>
            <button type="button" className="faq-q" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : i)}>
              <span>{item.q}</span>
              <motion.span className="faq-icon" animate={{ rotate: isOpen ? 45 : 0 }} transition={{ duration: 0.3 }} aria-hidden="true">+</motion.span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div className="faq-a" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
                  <p>{item.a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
