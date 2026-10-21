import { useEffect, useState, type SubmitEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  contactInterestAliases,
  normalizeOrderNumber,
  orderHelpTopicOptions,
  orderHelpTopicsNeedingMessage,
  orderNumberPattern,
  type OrderHelpTopic,
} from '@tilana/contracts/contact';
import { publicApiUrl } from '@web/utils/public-api';
import Icon from './Icon';
import { useTurnstile } from './turnstile';

type Option = { value: string; label: string };
type Fields = {
  name: string;
  email: string;
  interest: string;
  orderTopic: string;
  orderNumber: string;
  purchaseEmail: string;
  message: string;
  consent: boolean;
  website: string;
};
type Errors = Partial<Record<keyof Fields | 'security' | 'form', string>>;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ORDER = 'order';

/** A short tip for each order problem, so many can be solved before Tilana has to reply. */
const orderTips: Record<OrderHelpTopic, { tip: string; placeholder: string; refundLink?: boolean }> = {
  'not-received': {
    tip: 'Your programs are emailed as PDF attachments a few minutes after payment, from “Tilana van Tonder”. Please check your spam, junk or promotions folder and search for “Your program”. Still nothing? Send this and I’ll email them again.',
    placeholder: 'Anything else I should know?',
  },
  'wrong-email': {
    tip: 'No problem. Add the email you bought with below, and write the correct address in your message. I’ll send your programs there.',
    placeholder: 'Please send my programs to…',
  },
  'payment-failed': {
    tip: 'When a payment doesn’t go through, no money is taken and nothing is sent, so you can safely try again or use another card. If money did leave your account, choose “I was charged, but something’s not right” instead and please don’t pay again.',
    placeholder: 'What happened when you tried to pay?',
  },
  'charged-problem': {
    tip: 'Please don’t pay again. Add your order number or the Paystack reference from your receipt if you have it, and I’ll check the payment and sort it out.',
    placeholder: 'For example: charged twice on 12 October, no email received',
  },
  'file-problem': {
    tip: 'Try saving the attachment and opening it in a PDF app rather than the email preview. If it still won’t open or something looks wrong, tell me which program and what you see, and I’ll send a working file.',
    placeholder: 'Which program, and what do you see?',
  },
  refund: {
    tip: 'Please tell me what went wrong. Missing or faulty files are fixed first, and refunds go back to your card through Paystack.',
    placeholder: 'What went wrong?',
    refundLink: true,
  },
  other: {
    tip: 'Tell me what’s going on and I’ll help.',
    placeholder: 'How can I help?',
  },
};

const isTopic = (value: string): value is OrderHelpTopic => orderHelpTopicOptions.some((o) => o.value === value);
const messageNeeded = (fields: Fields) =>
  fields.interest !== ORDER || !isTopic(fields.orderTopic) || orderHelpTopicsNeedingMessage.includes(fields.orderTopic);

/**
 * Contact form. Sends to the admin's /api/contact (saved as an enquiry and
 * emailed to Tilana). Supports ?interest=beginner and the stored keys.
 */
export default function ContactForm({ options, privacyHref, refundHref }: { options: Option[]; privacyHref: string; refundHref: string }) {
  const [fields, setFields] = useState<Fields>({ name: '', email: '', interest: '', orderTopic: '', orderNumber: '', purchaseEmail: '', message: '', consent: false, website: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const turnstile = useTurnstile('contact');

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('interest') ?? '';
    const wanted = contactInterestAliases[raw] ?? raw;
    if (wanted && options.some((o) => o.value === wanted)) setFields((f) => ({ ...f, interest: wanted }));
    // Refund policy buttons open the form on a problem (?interest=order&topic=refund).
    const topic = new URLSearchParams(window.location.search).get('topic') ?? '';
    if (wanted === ORDER && isTopic(topic)) setFields((f) => ({ ...f, orderTopic: topic }));
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
    if (!options.some((o) => o.value === fields.interest)) next.interest = 'Please choose what you are interested in.';
    const isOrder = fields.interest === ORDER;
    const orderNumber = fields.orderNumber.trim() ? normalizeOrderNumber(fields.orderNumber) : '';
    if (isOrder) {
      if (!isTopic(fields.orderTopic)) next.orderTopic = 'Please choose what you need help with.';
      if (orderNumber && !orderNumberPattern.test(orderNumber)) next.orderNumber = 'Order numbers look like TV-7K4Q9P. Leave it empty if you don’t have it.';
      if (fields.purchaseEmail.trim() && !emailPattern.test(fields.purchaseEmail.trim())) next.purchaseEmail = 'Please check this email address, or leave it empty.';
    }
    if (messageNeeded(fields) && fields.message.trim().length < 10) next.message = 'Please tell me a little more (at least 10 characters).';
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
          ...(isOrder ? { orderTopic: fields.orderTopic, orderNumber: orderNumber || null, purchaseEmail: fields.purchaseEmail.trim() || null } : {}),
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

  const isOrder = fields.interest === ORDER;
  const topic = isTopic(fields.orderTopic) ? fields.orderTopic : null;
  const tip = topic ? orderTips[topic] : null;
  const label = (isOrder && orderHelpTopicOptions.find((o) => o.value === fields.orderTopic)?.label) || options.find((o) => o.value === fields.interest)?.label;
  const optional = !messageNeeded(fields);

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
            <div className={errors.interest ? 'field invalid' : 'field'}>
              <label htmlFor="c-interest">What are you interested in?</label>
              <div className="select">
                <select id="c-interest" name="interest" value={fields.interest} onChange={(e) => set('interest', e.target.value)} aria-invalid={Boolean(errors.interest)} aria-describedby="c-interest-error">
                  <option value="" disabled>Choose an option</option>
                  {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <p className="field-error" id="c-interest-error">{errors.interest}</p>
            </div>
            {isOrder && (
              <div className="order-help">
                <div className={errors.orderTopic ? 'field invalid' : 'field'}>
                  <label htmlFor="c-topic">What do you need help with?</label>
                  <div className="select">
                    <select id="c-topic" name="orderTopic" value={fields.orderTopic} onChange={(e) => set('orderTopic', e.target.value)} aria-invalid={Boolean(errors.orderTopic)} aria-describedby="c-topic-tip c-topic-error">
                      <option value="" disabled>Choose what happened</option>
                      {orderHelpTopicOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <p className="field-error" id="c-topic-error">{errors.orderTopic}</p>
                  {tip && (
                    <p className="order-tip" id="c-topic-tip" role="note">
                      {tip.tip}
                      {tip.refundLink && <> <a href={refundHref}>Read the refund policy</a>.</>}
                    </p>
                  )}
                </div>
                {topic && (
                  <>
                    <div className={errors.orderNumber ? 'field invalid' : 'field'}>
                      <label htmlFor="c-order">Order number <span className="field-optional">(if you have it)</span></label>
                      <input id="c-order" name="orderNumber" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={20} placeholder="TV-7K4Q9P" value={fields.orderNumber} onChange={(e) => set('orderNumber', e.target.value)} onBlur={() => { if (fields.orderNumber.trim()) set('orderNumber', normalizeOrderNumber(fields.orderNumber)); }} aria-invalid={Boolean(errors.orderNumber)} aria-describedby="c-order-hint c-order-error" />
                      <p className="field-hint" id="c-order-hint">It’s in the email with your programs and on your Paystack receipt.</p>
                      <p className="field-error" id="c-order-error">{errors.orderNumber}</p>
                    </div>
                    <div className={errors.purchaseEmail ? 'field invalid' : 'field'}>
                      <label htmlFor="c-purchase-email">Email you bought with <span className="field-optional">(if different)</span></label>
                      <input id="c-purchase-email" name="purchaseEmail" type="email" autoComplete="off" maxLength={254} placeholder={fields.email.trim() || 'you@example.com'} value={fields.purchaseEmail} onChange={(e) => set('purchaseEmail', e.target.value)} aria-invalid={Boolean(errors.purchaseEmail)} aria-describedby="c-purchase-email-error" />
                      <p className="field-error" id="c-purchase-email-error">{errors.purchaseEmail}</p>
                    </div>
                  </>
                )}
              </div>
            )}
            <div className={errors.message ? 'field invalid' : 'field'}>
              <label htmlFor="c-message">Message{optional && <span className="field-optional"> (optional)</span>}</label>
              <textarea id="c-message" name="message" rows={isOrder ? 4 : 5} maxLength={2000} placeholder={tip?.placeholder ?? 'How can I help?'} value={fields.message} onChange={(e) => set('message', e.target.value)} aria-invalid={Boolean(errors.message)} aria-describedby="c-message-hint c-message-error" />
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
            <p>{isOrder ? <>Your message (<strong>{label}</strong>) is on its way.</> : <>Your enquiry about <strong>{label}</strong> is on its way.</>} I’ll reply personally to <strong>{fields.email.trim()}</strong>.</p>
            <button type="button" className="link-arrow" onClick={() => { setState('idle'); setFields((f) => ({ ...f, message: '', orderNumber: '', purchaseEmail: '', consent: false })); turnstile.reset(); }}>Send another message</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
