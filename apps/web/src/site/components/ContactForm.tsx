import { useEffect, useState, type SubmitEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { contactInterestAliases } from '@tilana/contracts/contact';
import { publicApiUrl } from '@web/utils/public-api';
import Icon from './Icon';
import { useTurnstile } from './turnstile';

type Option = { value: string; label: string };
type Fields = { name: string; email: string; interest: string; message: string; consent: boolean; website: string };
type Errors = Partial<Record<keyof Fields | 'security' | 'form', string>>;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Contact form. Sends to the admin's /api/contact (saved as an enquiry and
 * emailed to Tilana). Supports ?interest=beginner and the stored keys.
 */
export default function ContactForm({ options, privacyHref }: { options: Option[]; privacyHref: string }) {
  const [fields, setFields] = useState<Fields>({ name: '', email: '', interest: options[0]!.value, message: '', consent: false, website: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const turnstile = useTurnstile('contact');

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('interest') ?? '';
    const wanted = contactInterestAliases[raw] ?? raw;
    if (wanted && options.some((o) => o.value === wanted)) setFields((f) => ({ ...f, interest: wanted }));
    // Program buttons start the message for the visitor (?message=...).
    const message = new URLSearchParams(window.location.search).get('message')?.slice(0, 500) ?? '';
    if (message) setFields((f) => (f.message ? f : { ...f, message }));
  }, [options]);

  const set = <K extends keyof Fields>(key: K, value: Fields[K]) => {
    setFields((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const submit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const next: Errors = {};
    if (fields.name.trim().length < 2) next.name = 'Please enter your name.';
    if (!emailPattern.test(fields.email.trim())) next.email = 'Please enter a valid email address so I can reply.';
    if (fields.message.trim().length < 10) next.message = 'Please tell me a little more (at least 10 characters).';
    if (!fields.consent) next.consent = 'Please confirm you have read the privacy policy.';
    if (turnstile.enabled && !turnstile.token) next.security = 'Please complete the security check.';
    setErrors(next);
    const first = Object.keys(next)[0];
    if (first) {
      form.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setState('sending');
    try {
      const response = await fetch(publicApiUrl('/api/contact'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fields.name.trim(),
          email: fields.email.trim(),
          interest: fields.interest,
          message: fields.message.trim(),
          consent: true,
          website: fields.website,
          turnstileToken: turnstile.token,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { statusMessage?: string } | null;
        throw new Error(body?.statusMessage ?? 'Your message could not be sent.');
      }
      setState('done');
    }
    catch (error) {
      setErrors({ form: `${error instanceof Error ? error.message : 'Your message could not be sent.'} Please try again, or email me directly.` });
      setState('idle');
      turnstile.reset();
    }
  };

  const label = options.find((o) => o.value === fields.interest)?.label;

  return (
    <div className="contact-card card">
      <AnimatePresence mode="wait">
        {state !== 'done' ? (
          <motion.form key="form" onSubmit={submit} noValidate exit={{ opacity: 0, y: -12 }}>
            <div className={errors.name ? 'field invalid' : 'field'}>
              <label htmlFor="c-name">Full name</label>
              <input id="c-name" name="name" autoComplete="name" maxLength={100} placeholder="Your name" value={fields.name} onChange={(e) => set('name', e.target.value)} aria-invalid={Boolean(errors.name)} aria-describedby="c-name-error" />
              <p className="field-error" id="c-name-error">{errors.name}</p>
            </div>
            <div className={errors.email ? 'field invalid' : 'field'}>
              <label htmlFor="c-email">Email</label>
              <input id="c-email" name="email" type="email" autoComplete="email" maxLength={254} placeholder="you@example.com" value={fields.email} onChange={(e) => set('email', e.target.value)} aria-invalid={Boolean(errors.email)} aria-describedby="c-email-error" />
              <p className="field-error" id="c-email-error">{errors.email}</p>
            </div>
            <div className="field">
              <label htmlFor="c-interest">What are you interested in?</label>
              <div className="select">
                <select id="c-interest" name="interest" value={fields.interest} onChange={(e) => set('interest', e.target.value)}>
                  {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div className={errors.message ? 'field invalid' : 'field'}>
              <label htmlFor="c-message">Message</label>
              <textarea id="c-message" name="message" rows={5} maxLength={2000} placeholder="How can I help?" value={fields.message} onChange={(e) => set('message', e.target.value)} aria-invalid={Boolean(errors.message)} aria-describedby="c-message-hint c-message-error" />
              <p className="field-hint" id="c-message-hint">Please do not include diagnoses, medical records, injury details, pregnancy complications, identity numbers, or other sensitive health information.</p>
              <p className="field-error" id="c-message-error">{errors.message}</p>
            </div>
            <label className={errors.consent ? 'consent invalid' : 'consent'}>
              <input type="checkbox" name="consent" checked={fields.consent} onChange={(e) => set('consent', e.target.checked)} />
              <span>I have read the <a href={privacyHref}>privacy policy</a> and agree that these details may be used to respond to my enquiry.</span>
            </label>
            <p className="field-error">{errors.consent}</p>
            <div className="honeypot" aria-hidden="true">
              <label>Leave this field empty <input name="website" tabIndex={-1} autoComplete="off" value={fields.website} onChange={(e) => set('website', e.target.value)} /></label>
            </div>
            {turnstile.enabled && (
              <div className="security-check">
                <div ref={turnstile.ref} />
                <p className="field-error">{errors.security}</p>
              </div>
            )}
            {errors.form && <p className="form-error" role="alert">{errors.form}</p>}
            <button type="submit" className="btn btn-primary btn-block" disabled={state === 'sending'}>
              {state === 'sending' ? <><span className="spinner" aria-hidden="true" /> Sending…</> : <>Send enquiry <Icon name="arrow" /></>}
            </button>
          </motion.form>
        ) : (
          <motion.div key="done" className="contact-done" role="status" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 24 }}>
            <svg viewBox="0 0 52 52" aria-hidden="true">
              <motion.circle cx="26" cy="26" r="23" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6 }} />
              <motion.path d="M15 27l7.5 7.5L38 19" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.45, duration: 0.4 }} />
            </svg>
            <h3>Thank you, {fields.name.trim().split(' ')[0]}!</h3>
            <p>Your enquiry about <strong>{label}</strong> is on its way. I’ll reply personally to <strong>{fields.email.trim()}</strong>.</p>
            <button type="button" className="link-arrow" onClick={() => { setState('idle'); setFields((f) => ({ ...f, message: '', consent: false })); turnstile.reset(); }}>Send another message</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
