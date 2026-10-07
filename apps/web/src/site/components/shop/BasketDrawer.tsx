import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import Icon from '../Icon';
import { addToBasket, basketItems, onOpenBasket, productBySlug, products, rand, removeFromBasket, totalCents, useBasket, type OpenDetail } from './basket';

function joinNames(names: string[]) {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Slide-in basket. Opens from the header icon or straight after "Add to basket". */
export default function BasketDrawer({ checkoutHref, programsHref }: { checkoutHref: string; programsHref: string }) {
  const basket = useBasket();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<OpenDetail>({});
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(
    () =>
      onOpenBasket((detail) => {
        returnFocus.current = document.activeElement as HTMLElement | null;
        setNote(detail);
        setOpen(true);
      }),
    [],
  );

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const frame = requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
      returnFocus.current?.focus?.();
    };
  }, [open]);

  // Keep keyboard focus inside the open panel.
  const trapFocus = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Tab' || !panelRef.current) return;
    const focusable = [...panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  const close = () => setOpen(false);
  const items = basketItems(basket);
  const others = products.filter((p) => !basket.includes(p.slug));
  const added = (note.added ?? []).map((slug) => productBySlug.get(slug)?.name).filter((n): n is string => Boolean(n));

  return (
    <AnimatePresence>
      {open && (
        <div className="basket-layer">
          <motion.div className="basket-scrim" onClick={close} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} />
          <motion.aside
            ref={panelRef}
            className="basket-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="basket-title"
            onKeyDown={trapFocus}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 360, damping: 38 }}
          >
            <header className="basket-head">
              <div>
                <p className="basket-eyebrow">Your basket</p>
                <h2 id="basket-title">{items.length ? `${items.length} program${items.length === 1 ? '' : 's'}` : 'Nothing here yet'}</h2>
              </div>
              <button ref={closeRef} type="button" className="basket-close" onClick={close} aria-label="Close basket">
                <Icon name="close" />
              </button>
            </header>

            <div className="basket-body">
              {added.length > 0 && (
                <motion.p className="basket-note" role="status" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
                  <span aria-hidden="true">✓</span> {joinNames(added)} added to your basket.
                </motion.p>
              )}
              {note.full && <p className="basket-note warn" role="status">Your basket can hold up to ten programs.</p>}

              {items.length === 0 ? (
                <div className="basket-empty">
                  <p>Pick one or more programs and pay once, securely with Paystack.</p>
                </div>
              ) : (
                <ul className="basket-list">
                  <AnimatePresence initial={false}>
                    {items.map((p) => (
                      <motion.li key={p.slug} layout className={`basket-item tone-${p.tone}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }}>
                        <span className="basket-swatch" aria-hidden="true">{p.name.charAt(0)}</span>
                        <div className="basket-item-copy">
                          <strong>{p.name}</strong>
                          <span>{p.volume} · Digital program (PDF)</span>
                        </div>
                        <div className="basket-item-end">
                          <b>{rand(p.priceCents)}</b>
                          <button type="button" onClick={() => { setNote({}); removeFromBasket(p.slug); }} aria-label={`Remove ${p.name} from basket`}>Remove</button>
                        </div>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              )}

              {others.length > 0 && (
                <div className="basket-more">
                  <p>{items.length ? 'Add another program' : 'Programs'}</p>
                  <ul>
                    {others.map((p) => (
                      <li key={p.slug}>
                        <span><strong>{p.name}</strong> {p.title}</span>
                        <button type="button" onClick={() => { setNote({}); addToBasket(p.slug); }} aria-label={`Add ${p.name} to basket`}>
                          + {rand(p.priceCents)}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <footer className="basket-foot">
              {items.length > 0 ? (
                <>
                  <div className="basket-total"><span>Total once-off payment</span><strong>{rand(totalCents(basket))}</strong></div>
                  <a href={checkoutHref} className="btn btn-primary basket-checkout">Checkout securely</a>
                  <button type="button" className="btn btn-quiet" onClick={close}>Keep browsing</button>
                  <p className="basket-secure">
                    <Icon name="lock" />
                    One secure Paystack payment · No account needed
                  </p>
                </>
              ) : (
                <a href={programsHref} className="btn btn-primary basket-checkout" onClick={close}>Browse programs</a>
              )}
            </footer>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
