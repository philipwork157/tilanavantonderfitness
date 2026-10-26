import { motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import Icon from './Icon';
import AddToBasket from './shop/AddToBasket';
import type { ProgramPreview } from '@tilana/contracts/public-programs';
import { href } from '../config';
import type { Product } from '../programs';

export type PeekProgram = Pick<Product, 'slug' | 'name' | 'tone' | 'illustration' | 'step' | 'volume'> & {
  /** Name used in the basket ("Beginner", "Beginner Vol. 2"). */
  basketName: string;
  summary: string;
  tags: string[];
  /** "What's inside", written by Tilana in the admin (may be empty). */
  highlights: string[];
  /** Pictures of the real PDF: the cover, then inside pages blurred by the admin. */
  preview: ProgramPreview;
};

const pageName = (page: ProgramPreview['pages'][number]) => (page.page === 1 ? 'Cover' : `Page ${page.page}`);

/**
 * One program's peek: what's inside and a little stack of its real pages to
 * flip through. The cover is sharp; the inside pages are blurred pictures
 * (blurred on the server, so the plan itself is never sent to the browser).
 * Used in the "Take a peek inside" section and in the pop-up on each card.
 * Give it a `key` per program so the page stack starts at the cover.
 */
export default function PeekView({ program, checkout, headingId, onAdd }: { program: PeekProgram; checkout: boolean; headingId?: string; onAdd?: () => void }) {
  const [page, setPage] = useState(0);
  const [forward, setForward] = useState(true);
  const reduce = useReducedMotion();
  const pages = program.preview.pages;
  const current = Math.min(page, pages.length - 1);
  const cover = pages[0];
  const hasBlurred = pages.some((p) => p.blurred);
  const turn = (step: 1 | -1) => { setForward(step === 1); setPage((at) => (at + step + pages.length) % pages.length); };

  return (
    <div className="peek-body">
      <div className="peek-info">
        <p className="eyebrow">What you get</p>
        <h3 id={headingId}>{program.name}<em>{program.volume}</em></h3>
        <p className="peek-format"><Icon name="check" /> A {program.preview.pageCount}-page PDF · on your phone, tablet or printed</p>
        {program.highlights.length > 0 ? (
          <>
            <h4>What’s inside</h4>
            <ul className="peek-inside">
              {program.highlights.map((line) => <li key={line}><Icon name="spark" /> {line}</li>)}
            </ul>
          </>
        ) : (
          <>
            {program.summary && <p className="peek-summary">{program.summary}</p>}
            {program.tags.length > 0 && <ul className="tag-list">{program.tags.map((tag) => <li key={tag}>{tag}</li>)}</ul>}
          </>
        )}
        {hasBlurred && (
          <p className="peek-note"><Icon name="lock" /> These are real pages from the PDF. The plan is blurred here and clear in your copy.</p>
        )}
        <div className="peek-actions">
          {checkout && <AddToBasket slug={program.slug} name={program.basketName} onAdd={onAdd} />}
          <a className="link-arrow" href={href(`/contact?interest=${program.slug}`)}>Ask me a question <Icon name="arrow" /></a>
        </div>
      </div>

      <div className="peek-reader">
        <div className="peek-book" style={cover ? { aspectRatio: `${cover.width} / ${cover.height}` } : undefined}>
          {pages.map((p, i) => {
            const depth = (i - current + pages.length) % pages.length;
            const leaving = forward && depth === pages.length - 1 && pages.length > 1;
            return (
              <motion.figure
                key={p.page}
                className={`peek-page${p.blurred ? ' is-blurred' : ''}`}
                aria-hidden={depth !== 0}
                // The same start on the server and in the browser (no hydration mismatch); reduced motion just skips the movement.
                initial={{ opacity: 0, y: 30, rotate: 0 }}
                animate={{
                  opacity: 1,
                  x: reduce ? depth * 12 : leaving ? [0, -170, depth * 12] : depth * 12,
                  y: depth * 10,
                  rotate: depth === 0 ? -1.5 : depth === 1 ? 2.5 : 5,
                  scale: 1 - depth * 0.035,
                  zIndex: pages.length - depth,
                }}
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 220, damping: 26, x: leaving ? { duration: 0.55, times: [0, 0.45, 1], ease: 'easeInOut' } : undefined }}
              >
                <img
                  src={p.url}
                  width={p.width}
                  height={p.height}
                  alt={p.blurred ? `${pageName(p)} of the ${program.name} PDF, blurred` : `Cover of the ${program.name} PDF`}
                  loading={i === 0 ? 'eager' : 'lazy'}
                  decoding="async"
                  draggable={false}
                />
                {p.blurred && <figcaption className="peek-lock"><Icon name="lock" /> In the full PDF</figcaption>}
              </motion.figure>
            );
          })}
        </div>

        {pages.length > 1 && (
          <div className="peek-controls">
            <button type="button" className="peek-turn" onClick={() => turn(-1)} aria-label="Previous page">
              <Icon name="arrow" />
            </button>
            <p aria-live="polite">
              <span className="peek-dots" aria-hidden="true">{pages.map((p, i) => <i key={p.page} className={i === current ? 'on' : undefined} />)}</span>
              <span>{pageName(pages[current])}</span>
              <span className="sr-only">, picture {current + 1} of {pages.length}</span>
            </p>
            <button type="button" className="peek-turn next" onClick={() => turn(1)} aria-label="Next page">
              <Icon name="arrow" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
