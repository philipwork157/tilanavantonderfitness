import { useState, type SubmitEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { publicApiUrl } from '@web/utils/public-api';
import Icon from './Icon';
import { useTurnstile } from './turnstile';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sparks = [
  { x: -70, y: -46, d: 0.05 },
  { x: 74, y: -40, d: 0.12 },
  { x: -60, y: 50, d: 0.18 },
  { x: 66, y: 48, d: 0.1 },
];

/** Newsletter sign-up (double opt-in): the admin emails a confirmation link. */
export default function NewsletterForm({ privacyHref }: { privacyHref: string }) {
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [errors, setErrors] = useState<{ email?: string; consent?: string; security?: string; form?: string }>({});
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const turnstile = useTurnstile('newsletter');

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!emailPattern.test(email.trim())) next.email = 'Please enter a valid email address.';
    if (!consent) next.consent = 'Please tick the box so I know you’d like these emails.';
    if (turnstile.enabled && !turnstile.token) next.security = 'Please complete the security check.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setState('sending');
    try {
      const response = await fetch(publicApiUrl('/api/newsletter/subscribe'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), consent: true, source: 'website-footer', website, turnstileToken: turnstile.token }),
      });
      if (!response.ok) throw new Error('Subscription failed');
      setState('done');
    }
    catch {
      setErrors({ form: 'We could not start your subscription. Please try again shortly.' });
      setState('idle');
      turnstile.reset();
    }
  };

  return (
    <div className="news-shell">
      <AnimatePresence mode="wait">
        {state !== 'done' ? (
          <motion.form key="form" className="news-form" onSubmit={submit} noValidate exit={{ opacity: 0, y: -10 }}>
            <div className={errors.email ? 'news-row invalid' : 'news-row'}>
              <label className="sr-only" htmlFor="news-email">Email address</label>
              <input id="news-email" type="email" autoComplete="email" placeholder="Your email address" value={email} onChange={(e) => { setEmail(e.target.value); setErrors((x) => ({ ...x, email: undefined })); }} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'news-email-error' : undefined} />
              <button type="submit" className="btn btn-primary" disabled={state === 'sending'}>
                {state === 'sending' ? <span className="spinner" aria-hidden="true" /> : null}
                <span>{state === 'sending' ? 'Joining…' : 'Join the newsletter'}</span>
                {state !== 'sending' && <Icon name="arrow" />}
              </button>
            </div>
            {errors.email && <p className="field-error" id="news-email-error">{errors.email}</p>}
            <label className={errors.consent ? 'news-consent invalid' : 'news-consent'}>
              <input type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); setErrors((x) => ({ ...x, consent: undefined })); }} />
              <span>I agree to receive occasional emails from Tilana. I can unsubscribe at any time. <a href={privacyHref}>Privacy policy</a>.</span>
            </label>
            {errors.consent && <p className="field-error">{errors.consent}</p>}
            <div className="honeypot" aria-hidden="true">
              <label>Leave this field empty <input name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
            </div>
            {turnstile.enabled && (
              <div className="security-check">
                <div ref={turnstile.ref} />
                {errors.security && <p className="field-error">{errors.security}</p>}
              </div>
            )}
            {errors.form && <p className="form-error" role="alert">{errors.form}</p>}
          </motion.form>
        ) : (
          <motion.div key="done" className="news-done" role="status" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 24 }}>
            <div className="news-badge">
              {sparks.map((s, i) => (
                <motion.span key={i} className="news-spark" initial={{ x: 0, y: 0, scale: 0, opacity: 0 }} animate={{ x: s.x, y: s.y, scale: [0, 1.2, 0.8], opacity: [0, 1, 0] }} transition={{ delay: 0.3 + s.d, duration: 0.9 }}>
                  <Icon name="spark" />
                </motion.span>
              ))}
              <svg viewBox="0 0 52 52" aria-hidden="true">
                <motion.circle cx="26" cy="26" r="23" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6 }} />
                <motion.path d="M15 27l7.5 7.5L38 19" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.45, duration: 0.4 }} />
              </svg>
            </div>
            <h3>Almost there!</h3>
            <p>I’ve sent a confirmation email to <strong>{email.trim()}</strong>. Tap the link inside to confirm your subscription. Nothing yet? Peek in your spam or promotions folder.</p>
            <button type="button" className="link-arrow" onClick={() => { setState('idle'); setEmail(''); setConsent(false); turnstile.reset(); }}>Use a different email</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
