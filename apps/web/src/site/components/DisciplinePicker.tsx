import { useRef, useState, type KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import Icon from './Icon';
import type { Discipline } from '../data';

export type PickerItem = Discipline & { href: string };

const ease = [0.22, 1, 0.36, 1] as const;

/** "Pick your thing": a colour panel with the big word, and the details beside it. No lens, no blur. */
export default function DisciplinePicker({ items }: { items: PickerItem[] }) {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const d = items[active]!;

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = (active + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
    setActive(next);
    tabs.current[next]?.focus();
  };

  return (
    <div className="disc">
      <div className="disc-tabs" role="tablist" aria-label="Choose a discipline" onKeyDown={onKey}>
        {items.map((it, i) => (
          <button
            key={it.key}
            ref={(el) => { tabs.current[i] = el; }}
            type="button"
            role="tab"
            id={`disc-tab-${it.key}`}
            aria-controls="disc-panel"
            aria-selected={i === active}
            tabIndex={i === active ? 0 : -1}
            className={i === active ? 'disc-tab on' : 'disc-tab'}
            onClick={() => setActive(i)}
          >
            {i === active && <motion.span layoutId="disc-pill" className="disc-pill" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
            <Icon name={it.icon} />
            <span>{it.label}</span>
          </button>
        ))}
      </div>

      <div className="disc-card" id="disc-panel" role="tabpanel" aria-labelledby={`disc-tab-${d.key}`}>
        <div className={`disc-art tone-${d.tone}`}>
          <div className="disc-art-top">
            <span className="disc-count">{String(active + 1).padStart(2, '0')} / {String(items.length).padStart(2, '0')}</span>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={d.key} className="disc-icon" initial={{ rotate: -25, scale: 0.5, opacity: 0 }} animate={{ rotate: 0, scale: 1, opacity: 1 }} exit={{ rotate: 25, scale: 0.5, opacity: 0 }} transition={{ duration: 0.35, ease }}>
                <Icon name={d.icon} />
              </motion.span>
            </AnimatePresence>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.p key={d.key} className="disc-word" aria-hidden="true">
              {d.word.split('').map((ch, i) => (
                <span className="disc-letter" key={`${d.key}-${i}`}>
                  <motion.span initial={{ y: '105%' }} animate={{ y: '0%' }} exit={{ y: '-105%' }} transition={{ duration: 0.45, delay: i * 0.045, ease }}>
                    {ch}
                  </motion.span>
                </span>
              ))}
            </motion.p>
          </AnimatePresence>
          <span className="disc-label">{d.label}</span>
        </div>

        <div className="disc-body">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={d.key} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.32, ease }}>
              <h3>{d.line}</h3>
              <p>{d.copy}</p>
              <ul className="disc-points">
                {d.points.map((p) => <li key={p}><Icon name="check" />{p}</li>)}
              </ul>
              <div className="disc-actions">
                <a className="link-arrow" href={d.href}>{d.link.label} <Icon name="arrow" /></a>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
