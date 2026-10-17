import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import Icon from './Icon';

type Link = { label: string; href: string; current: boolean };

/** Full-screen menu for phones and tablets. */
export default function MobileMenu({ links, homeHref, contactHref }: { links: Link[]; homeHref: string; contactHref: string }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    const frame = requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
      openRef.current?.focus();
    };
  }, [open]);

  return (
    <>
      <button ref={openRef} type="button" className="icon-btn burger" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>
        <span /><span />
      </button>
      {mounted && createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              className="mm"
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              initial={{ clipPath: 'circle(0% at 92% 2.5rem)' }}
              animate={{ clipPath: 'circle(150% at 92% 2.5rem)' }}
              exit={{ clipPath: 'circle(0% at 92% 2.5rem)' }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="mm-top">
                <a className="wordmark" href={homeHref}>TILANA<span>van Tonder</span></a>
                <button ref={closeRef} type="button" className="icon-btn" aria-label="Close menu" onClick={() => setOpen(false)}>
                  <Icon name="close" />
                </button>
              </div>
              <nav className="mm-nav" aria-label="Menu">
                {links.map((link, i) => (
                  <motion.a
                    key={link.href}
                    href={link.href}
                    aria-current={link.current ? 'page' : undefined}
                    initial={{ y: 36, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.12 + i * 0.06, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <small>0{i + 1}</small>{link.label}
                  </motion.a>
                ))}
              </nav>
              <motion.div className="mm-foot" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}>
                <a className="btn btn-primary btn-block" href={contactHref}>Get in touch</a>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
