import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import PeekView, { type PeekProgram } from './PeekView';
import ProgramThumb from './shop/ProgramThumb';

export type { PeekProgram } from './PeekView';

/**
 * "Take a peek inside" section: a tab per program, then that program's peek
 * (what's inside, and its real pages to flip through).
 */
export default function PdfPeek({ programs }: { programs: PeekProgram[] }) {
  const [active, setActive] = useState(programs[0]?.slug ?? '');
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const reduce = useReducedMotion();

  // A link to /program#peek-<slug> opens that program's tab.
  useEffect(() => {
    const pick = () => {
      const slug = window.location.hash.replace(/^#peek-/, '');
      if (slug !== window.location.hash && programs.some((p) => p.slug === slug)) setActive(slug);
    };
    pick();
    window.addEventListener('hashchange', pick);
    return () => window.removeEventListener('hashchange', pick);
  }, [programs]);

  const program = programs.find((p) => p.slug === active) ?? programs[0];
  if (!program) return null;

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const move = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!move && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? programs.length - 1 : (index + (move ?? 0) + programs.length) % programs.length;
    setActive(programs[next].slug);
    tabs.current[next]?.focus();
  };

  return (
    <div className="peek">
      <div className="peek-tabs" role="tablist" aria-label="Choose a program to peek inside">
        {programs.map((p, i) => (
          <button
            key={p.slug}
            ref={(el) => { tabs.current[i] = el; }}
            id={`peek-${p.slug}`}
            type="button"
            role="tab"
            aria-selected={p.slug === program.slug}
            aria-controls="peek-panel"
            tabIndex={p.slug === program.slug ? 0 : -1}
            className="peek-tab"
            onClick={() => setActive(p.slug)}
            onKeyDown={(event) => onTabKey(event, i)}
          >
            <ProgramThumb illustration={p.illustration} step={p.step} tone={p.tone} />
            <span><strong>{p.name}</strong><small>{p.volume}</small></span>
          </button>
        ))}
      </div>

      <div id="peek-panel" role="tabpanel" aria-labelledby={`peek-${program.slug}`}>
        {/* initial={false}: the first program shows as rendered on the server. */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={program.slug}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -8 }}
            transition={reduce ? { duration: 0 } : { duration: 0.25 }}
          >
            <PeekView program={program} />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
