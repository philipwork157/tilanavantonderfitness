import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import Icon from './Icon';
import PeekView, { type PeekProgram } from './PeekView';

/**
 * The peek as a pop-up: "Peek inside the PDF" on a program card opens it right
 * there instead of scrolling the visitor away. Any link with
 * `data-peek="<slug>"` opens it; without JavaScript the link still goes to the
 * "Take a peek inside" section.
 */
export default function PeekDialog({ programs }: { programs: PeekProgram[] }) {
  const [slug, setSlug] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const reduce = useReducedMotion();
  const program = programs.find((p) => p.slug === slug);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest<HTMLElement>('[data-peek]');
      const wanted = link?.dataset.peek;
      if (!link || !wanted || !programs.some((p) => p.slug === wanted)) return;
      event.preventDefault();
      returnFocus.current = link;
      setSlug(wanted);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [programs]);

  useEffect(() => {
    if (!program) return;
    // A class, not body.style: the basket drawer may open as this closes and manages its own lock.
    document.documentElement.classList.add('peek-open');
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') setSlug(null); };
    window.addEventListener('keydown', onKey);
    const frame = requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      document.documentElement.classList.remove('peek-open');
      window.removeEventListener('keydown', onKey);
      returnFocus.current?.focus?.();
    };
  }, [program]);

  // Keep keyboard focus inside the open pop-up.
  const trapFocus = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Tab' || !panelRef.current) return;
    const focusable = [...panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  const close = () => setSlug(null);

  return (
    <AnimatePresence>
      {program && (
        <div className="peek-layer">
          <motion.div className="peek-scrim" onClick={close} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.25 }} />
          <motion.div
            ref={panelRef}
            className="peek-dialog card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="peek-dialog-title"
            onKeyDown={trapFocus}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
            transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 32 }}
          >
            <div className="peek-dialog-head">
              <p className="eyebrow">Peek inside the PDF</p>
              <button ref={closeRef} type="button" className="peek-close" onClick={close} aria-label="Close the peek">
                <Icon name="close" />
              </button>
            </div>
            {/* Adding to the basket closes this first, so the basket opens on its own. */}
            <PeekView key={program.slug} program={program} headingId="peek-dialog-title" onAdd={close} />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
