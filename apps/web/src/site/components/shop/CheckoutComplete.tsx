import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { clearPaidBasket } from '@web/scripts/basket';
import { clearCompletedCheckoutIntent } from '@web/scripts/checkout-intent';
import { confirmCheckoutStatus } from '@web/scripts/checkout-completion';
import { publicApiUrl } from '@web/utils/public-api';

type Result = { heading: string; message: string; access: boolean; retry: boolean; recheck: boolean };
type View =
  | { kind: 'checking' }
  | { kind: 'missing'; heading: string; message: string }
  | { kind: 'result'; result: Result };

const statusUrl = publicApiUrl('/api/checkout/status');
const referencePattern = /^[A-Za-z0-9.=-]{10,160}$/;

/**
 * The page Paystack returns customers to. The outcome always comes from the
 * server (verified payment status), never from the redirect itself.
 */
export default function CheckoutComplete({ checkoutHref, programsHref, homeHref, contactHref }: { checkoutHref: string; programsHref: string; homeHref: string; contactHref: string }) {
  const [view, setView] = useState<View>({ kind: 'checking' });
  const [reference, setReference] = useState('');

  const check = useCallback(async () => {
    const ref = new URLSearchParams(window.location.search).get('reference') ?? '';
    setReference(ref);
    if (!ref) return setView({ kind: 'missing', heading: 'Payment reference missing', message: 'Please contact Tilana if you completed a payment but cannot see its status.' });
    if (!referencePattern.test(ref)) return setView({ kind: 'missing', heading: 'Payment reference invalid', message: 'Please contact Tilana with the payment reference below if you completed a payment.' });
    setView({ kind: 'checking' });
    const result = await confirmCheckoutStatus(statusUrl, ref, {
      fetch,
      pause: () => new Promise((resolve) => window.setTimeout(resolve, 2000)),
      clearPaid: clearPaidBasket,
      retireIntent: clearCompletedCheckoutIntent,
    });
    setView({ kind: 'result', result });
  }, []);

  useEffect(() => { void check(); }, [check]);

  const paid = view.kind === 'result' && view.result.access;

  return (
    <div className="done-wrap" aria-live="polite">
      <AnimatePresence mode="wait">
        {view.kind === 'checking' && (
          <motion.div key="checking" className="co-state" role="status" exit={{ opacity: 0 }}>
            <span className="co-dots" aria-hidden="true"><i /><i /><i /></span>
            <div><h1>Confirming your payment…</h1><p>This only takes a moment.</p></div>
          </motion.div>
        )}

        {view.kind === 'result' && paid && (
          <motion.div key="paid" className="done-card" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
            <svg className="done-tick" viewBox="0 0 64 64" aria-hidden="true">
              <motion.circle cx="32" cy="32" r="29" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.7 }} />
              <motion.path d="M19 33l9 9 18-20" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.55, duration: 0.45 }} />
            </svg>
            <p className="done-eyebrow">Reference {reference}</p>
            <h1>{view.result.heading}</h1>
            <p className="done-lede">{view.result.message}</p>

            <h2>What happens next</h2>
            <ol className="done-next">
              <li><b>01</b><span><strong>Check your inbox</strong>Your programs are emailed to the address you used at checkout, with the PDFs attached.</span></li>
              <li><b>02</b><span><strong>Keep them safe</strong>Save the PDFs to your phone or computer. They are yours to keep. Lost the email? Just ask Tilana to send it again.</span></li>
              <li><b>03</b><span><strong>Start moving</strong>Open your program and start at the beginning. Questions? Just send Tilana a message.</span></li>
            </ol>

            <div className="done-actions">
              <a className="btn btn-primary" href={homeHref}>Back to the homepage</a>
              <a className="btn btn-ghost" href={contactHref}>Contact Tilana</a>
            </div>
          </motion.div>
        )}

        {view.kind === 'result' && !paid && (
          <motion.div key={`status-${view.result.heading}`} className="done-card is-failed" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
            <span className="done-alert" aria-hidden="true">{view.result.recheck ? '…' : '!'}</span>
            <h1>{view.result.heading}</h1>
            <p className="done-lede">{view.result.message}</p>
            {reference && <p className="done-eyebrow">Reference {reference}</p>}
            <div className="done-actions">
              {view.result.recheck && <button type="button" className="btn btn-primary" onClick={() => void check()}>Check again</button>}
              {view.result.retry
                ? <a className={view.result.recheck ? 'btn btn-ghost' : 'btn btn-primary'} href={checkoutHref}>Return to checkout</a>
                : <a className="btn btn-ghost" href={programsHref}>Back to programs</a>}
            </div>
          </motion.div>
        )}

        {view.kind === 'missing' && (
          <motion.div key="missing" className="done-card is-failed" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}>
            <span className="done-alert" aria-hidden="true">?</span>
            <h1>{view.heading}</h1>
            <p className="done-lede">{view.message}</p>
            {reference && <p className="done-eyebrow">Reference {reference}</p>}
            <div className="done-actions">
              <a className="btn btn-primary" href={checkoutHref}>Go to checkout</a>
              <a className="btn btn-ghost" href={programsHref}>Browse programs</a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
