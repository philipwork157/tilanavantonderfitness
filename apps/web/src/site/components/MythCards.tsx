import { useState } from 'react';
import { motion } from 'motion/react';

export type Myth = { myth: string; fact: string };
const tones = ['white', 'sage', 'sand'] as const;

function Card({ item, index }: { item: Myth; index: number }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <motion.button
      type="button"
      className="myth"
      onClick={() => setFlipped((f) => !f)}
      aria-pressed={flipped}
      aria-label={flipped ? `Fact: ${item.fact}` : `Myth: ${item.myth}. Tap to reveal the fact.`}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ delay: (index % 3) * 0.08, duration: 0.6 }}
    >
      <motion.div className="myth-inner" animate={{ rotateY: flipped ? 180 : 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
        <div className={`myth-face myth-front tone-${tones[index % 3]}`}>
          <span className="myth-label">Myth Nº {String(index + 1).padStart(2, '0')}</span>
          <p>“{item.myth}”</p>
          <span className="myth-tap">Tap for the fact ↻</span>
        </div>
        <div className="myth-face myth-back">
          <span className="myth-label">Fact</span>
          <p>{item.fact}</p>
          <span className="myth-tap">Tap to flip back ↻</span>
        </div>
      </motion.div>
    </motion.button>
  );
}

/** Flip cards from "The Strong Issue". */
export default function MythCards({ items }: { items: Myth[] }) {
  return <div className="myth-grid snap-mobile">{items.map((item, i) => <Card key={item.myth} item={item} index={i} />)}</div>;
}
