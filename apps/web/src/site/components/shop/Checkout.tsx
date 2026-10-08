import { useCallback, useEffect, useRef, useState, type SubmitEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { catalogueSlugSchema, type PublicCatalogueVolumeDetail } from '@tilana/contracts/catalogue';
import { basketCheckoutRequestSchema } from '@tilana/contracts/checkout';
import { addToBasket as addSlug, readBasket, rememberPendingBasket } from '@web/scripts/basket';
import { refreshBasketCatalogue } from '@web/scripts/basket-catalogue';
import { getCheckoutIntentKey, readCheckoutRecoveryReference, rememberCheckoutIntent } from '@web/scripts/checkout-intent';
import { createCheckoutSelectionGuard, sameBasketSelection } from '@web/scripts/checkout-selection';
import { publicApiUrl } from '@web/utils/public-api';
import Icon from '../Icon';
import { addToBasket, productMap, rand, removeFromBasket, useBasket, useCatalogue } from './basket';
import ProgramThumb from './ProgramThumb';

type Fields = { firstName: string; lastName: string; email: string; phone: string; consent: boolean; website: string };
type Errors = Partial<Record<keyof Fields, string>>;
type Problem = { title: string; copy: string; retry: boolean };
type ApiMessage = { authorizationUrl?: string; reference?: string; statusMessage?: string; message?: string };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const catalogueUrl = `${publicApiUrl('/api/public')}/program-volumes`;
const checkoutUrl = `${publicApiUrl('/api/checkout/paystack')}/basket`;

function validate(f: Fields): Errors {
  const e: Errors = {};
  if (!f.firstName.trim()) e.firstName = 'Please enter your first name.';
  if (!f.lastName.trim()) e.lastName = 'Please enter your last name.';
  if (!emailPattern.test(f.email.trim())) e.email = 'Please enter a valid email address. Your programs are sent here.';
  if (!f.consent) e.consent = 'Please tick the box to continue.';
  return e;
}

/**
 * Checkout: review the basket, enter your details, pay once. Prices and
 * availability are confirmed by the catalogue API before payment; the server
 * re-checks everything and sends the customer to Paystack's hosted checkout.
 */
export default function Checkout({ programsHref, completeHref, refundHref, privacyHref }: { programsHref: string; completeHref: string; refundHref: string; privacyHref: string }) {
  const basket = useBasket();
  // Programs for the "add another" picks; prices to pay come from `volumes` below.
  const products = useCatalogue();
  const productBySlug = productMap(products);
  const [volumes, setVolumes] = useState<PublicCatalogueVolumeDetail[]>([]);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'empty' | 'problem'>('loading');
  const [problem, setProblem] = useState<Problem | null>(null);
  const [fields, setFields] = useState<Fields>({ firstName: '', lastName: '', email: '', phone: '', consent: false, website: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const guard = useRef(createCheckoutSelectionGuard());
  const loadVersion = useRef(0);
  const queryAdded = useRef(false);

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    if (!queryAdded.current) {
      queryAdded.current = true;
      const wanted = catalogueSlugSchema.safeParse(new URLSearchParams(window.location.search).get('programme'));
      if (wanted.success) addSlug(wanted.data);
    }
    const slugs = readBasket();
    if (!slugs.length) {
      setVolumes([]);
      setPhase('empty');
      return;
    }
    setPhase('loading');
    try {
      const result = await refreshBasketCatalogue(catalogueUrl, slugs, () => version === loadVersion.current && sameBasketSelection(slugs, readBasket()));
      if (version !== loadVersion.current) return;
      if (result.state === 'changed') return void load();
      if (result.state === 'retryable') {
        setProblem({ title: 'Basket could not be confirmed', copy: 'Your selections are saved. We could not confirm the latest programs and prices. Please try again before paying.', retry: true });
        setPhase('problem');
        return;
      }
      if (!result.volumes.length) {
        setProblem({ title: 'Your programs are unavailable', copy: 'The programs in your basket are no longer available. Please choose from the current collection.', retry: false });
        setPhase('problem');
        return;
      }
      setVolumes(result.volumes);
      setPhase('ready');
    }
    catch {
      if (version !== loadVersion.current) return;
      setProblem({ title: 'Basket could not be loaded', copy: 'Your selections are saved. Please try again in a moment.', retry: true });
      setPhase('problem');
    }
  }, []);

  // Reload whenever the basket changes (here, in the drawer or in another tab),
  // except while a payment is being started: the submitted selection is locked.
  const basketKey = basket.join();
  useEffect(() => {
    if (guard.current.active) {
      setStatus('Your submitted selection is locked. Basket changes apply to your next checkout.');
      return;
    }
    void load();
  }, [basketKey, load]);

  const total = volumes.reduce((sum, volume) => sum + volume.priceCents, 0);
  const others = products.filter((p) => !basket.includes(p.slug));

  const set = <K extends keyof Fields>(key: K, value: Fields[K]) => {
    setFields((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (submitting || !volumes.length) return;
    const found = validate(fields);
    setErrors(found);
    const firstInvalid = Object.keys(found)[0];
    if (firstInvalid) {
      formRef.current?.querySelector<HTMLElement>(`[name="${firstInvalid}"]`)?.focus();
      return;
    }

    const parsed = basketCheckoutRequestSchema.safeParse({
      idempotencyKey: crypto.randomUUID(),
      items: volumes.map((volume) => ({ volumeSlug: volume.slug, expectedPriceCents: volume.priceCents })),
      firstName: fields.firstName,
      lastName: fields.lastName,
      email: fields.email,
      phone: fields.phone,
      consent: fields.consent,
      website: fields.website,
    });
    if (!parsed.success) {
      setStatus('Please complete all required details and accept the policy agreement.');
      return;
    }
    const selection = guard.current.begin(parsed.data.items.map((item) => item.volumeSlug), readBasket());
    if (selection.state === 'busy') return;
    if (selection.state === 'changed') {
      await load();
      setStatus('Your basket changed in another tab. Please review it before paying.');
      return;
    }

    setSubmitting(true);
    setStatus('Opening Paystack. Your submitted selection is locked.');
    try {
      parsed.data.idempotencyKey = await getCheckoutIntentKey(parsed.data);
      const response = await fetch(checkoutUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const body = await response.json().catch(() => null) as ApiMessage | null;
      const recoveryReference = !response.ok ? readCheckoutRecoveryReference(body) : null;
      if (recoveryReference) {
        // Keep the original purchase while the status page reconciles it.
        await rememberCheckoutIntent(parsed.data.idempotencyKey, recoveryReference);
        rememberPendingBasket(recoveryReference, [...selection.slugs]);
        window.location.assign(`${completeHref}?reference=${encodeURIComponent(recoveryReference)}`);
        return;
      }
      if (!response.ok || !body?.authorizationUrl || !body.reference) {
        if (response.status === 409) {
          await load();
          throw new Error(body?.statusMessage ?? body?.message ?? 'Your basket changed. Please review it before paying.');
        }
        throw new Error(body?.statusMessage ?? body?.message ?? 'Checkout could not be started.');
      }
      await rememberCheckoutIntent(parsed.data.idempotencyKey, body.reference);
      rememberPendingBasket(body.reference, [...selection.slugs]);
      window.location.assign(body.authorizationUrl);
    }
    catch (checkoutError) {
      guard.current.finish();
      setSubmitting(false);
      setStatus(checkoutError instanceof Error ? checkoutError.message : 'Checkout could not be started.');
      if (!sameBasketSelection(volumes.map((volume) => volume.slug), readBasket())) await load();
    }
  };

  if (phase === 'loading') {
    return (
      <div className="co-state" role="status">
        <span className="co-dots" aria-hidden="true"><i /><i /><i /></span>
        <div><h2>Loading your basket</h2><p>Confirming your programs and prices.</p></div>
      </div>
    );
  }

  if (phase === 'problem' && problem) {
    return (
      <div className="co-state co-empty" role="alert">
        <span className="co-empty-icon" aria-hidden="true"><Icon name="bag" /></span>
        <div><h2>{problem.title}</h2><p>{problem.copy}</p></div>
        <div className="done-actions">
          {problem.retry && <button type="button" className="btn btn-primary" onClick={() => void load()}>Try again</button>}
          <a className="btn btn-ghost" href={programsHref}>Browse programs</a>
        </div>
      </div>
    );
  }

  if (phase === 'empty') {
    return (
      <div className="co-state co-empty">
        <span className="co-empty-icon" aria-hidden="true">
          <Icon name="bag" />
        </span>
        <div>
          <h2>Your basket is empty</h2>
          <p>Add a program before continuing to payment.</p>
        </div>
        <div className="co-empty-picks">
          {products.map((p) => (
            <button key={p.slug} type="button" className={`co-pick tone-${p.tone}`} onClick={() => addToBasket(p.slug)} aria-label={`Add ${p.name} to basket`}>
              <strong>{p.name}</strong><span>{rand(p.priceCents)} · Add</span>
            </button>
          ))}
        </div>
        <a className="btn btn-ghost" href={programsHref}>Browse programs</a>
      </div>
    );
  }

  return (
    <>
      <ol className="co-steps" aria-label="Checkout steps">
        <li className="done"><span>1</span>Basket</li>
        <li className="now"><span>2</span>Your details</li>
        <li><span>3</span>Pay with Paystack</li>
      </ol>

      <div className="co-grid">
        <form ref={formRef} className="co-form" onSubmit={submit} noValidate inert={submitting || undefined}>
          <h2>Your details</h2>
          <p className="co-lede">We’ll send your programs to this email address. No account or password needed.</p>
          <div className="co-row">
            <label className={errors.firstName ? 'invalid' : undefined}>
              <span>First name</span>
              <input name="firstName" autoComplete="given-name" maxLength={100} value={fields.firstName} onChange={(e) => set('firstName', e.target.value)} aria-invalid={Boolean(errors.firstName)} aria-describedby={errors.firstName ? 'err-firstName' : undefined} />
              {errors.firstName && <small id="err-firstName">{errors.firstName}</small>}
            </label>
            <label className={errors.lastName ? 'invalid' : undefined}>
              <span>Last name</span>
              <input name="lastName" autoComplete="family-name" maxLength={100} value={fields.lastName} onChange={(e) => set('lastName', e.target.value)} aria-invalid={Boolean(errors.lastName)} aria-describedby={errors.lastName ? 'err-lastName' : undefined} />
              {errors.lastName && <small id="err-lastName">{errors.lastName}</small>}
            </label>
          </div>
          <label className={errors.email ? 'invalid' : undefined}>
            <span>Email address</span>
            <input name="email" type="email" autoComplete="email" maxLength={254} value={fields.email} onChange={(e) => set('email', e.target.value)} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'err-email' : undefined} />
            {errors.email && <small id="err-email">{errors.email}</small>}
          </label>
          <label>
            <span>Phone number <em>(optional)</em></span>
            <input name="phone" type="tel" autoComplete="tel" maxLength={30} value={fields.phone} onChange={(e) => set('phone', e.target.value)} />
          </label>
          <label className={errors.consent ? 'co-consent invalid' : 'co-consent'}>
            <input name="consent" type="checkbox" checked={fields.consent} onChange={(e) => set('consent', e.target.checked)} aria-invalid={Boolean(errors.consent)} aria-describedby={errors.consent ? 'err-consent' : undefined} />
            <span>
              I agree to the <a href={refundHref} target="_blank" rel="noopener">refund and cancellation policy</a> and <a href={privacyHref} target="_blank" rel="noopener">privacy policy</a>, and understand these are digital programs providing general education, not clinical care.
            </span>
          </label>
          {errors.consent && <small className="co-consent-error" id="err-consent">{errors.consent}</small>}
          <div className="honeypot" aria-hidden="true">
            <label>Leave this field empty <input name="website" tabIndex={-1} autoComplete="off" value={fields.website} onChange={(e) => set('website', e.target.value)} /></label>
          </div>
          <button type="submit" className="btn btn-primary co-pay" disabled={submitting}>
            {submitting ? <span className="spinner" aria-hidden="true" /> : <Icon name="lock" />}
            {submitting ? 'Opening Paystack…' : `Pay ${rand(total)} securely`}
          </button>
          <p className="co-status" role="status" aria-live="polite">{status}</p>
          <p className="co-fineprint">You’ll be taken to Paystack to pay by card or another available method. Your card details go to Paystack, never to this site.</p>
        </form>

        <aside className="co-order" aria-label="Order summary">
          <div className="co-order-head">
            <h2>Your selection</h2>
            <a href={programsHref}>Add another</a>
          </div>
          <ul className="co-items" inert={submitting || undefined}>
            <AnimatePresence initial={false}>
              {volumes.map((volume) => {
                const p = productBySlug.get(volume.slug);
                return (
                  <motion.li key={volume.slug} layout className={`tone-${p?.tone ?? 'sand'}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0, transition: { duration: 0.2 } }}>
                    <ProgramThumb illustration={p?.illustration ?? 'barbell'} step={p?.step} tone={p?.tone ?? 'sand'} />
                    <div><strong>{p?.name ?? volume.program.name}</strong><span>{p ? `${p.volume} · ${p.title}` : volume.name}</span></div>
                    <div className="co-item-end">
                      <b>{rand(volume.priceCents)}</b>
                      <button type="button" onClick={() => removeFromBasket(volume.slug)} aria-label={`Remove ${p?.name ?? volume.name} from basket`}>Remove</button>
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
          {others.length > 0 && !submitting && (
            <div className="co-more">
              {others.map((p) => (
                <button key={p.slug} type="button" onClick={() => addToBasket(p.slug)} aria-label={`Add ${p.name} to basket`}>+ Add {p.name} · {rand(p.priceCents)}</button>
              ))}
            </div>
          )}
          <div className="co-total"><span>Total once-off payment</span><strong>{rand(total)}</strong></div>
          <ul className="co-promises">
            <li>One secure Paystack payment</li>
            <li>No account needed before payment</li>
            <li>Your programs are emailed to you as PDFs, straight after payment</li>
          </ul>
        </aside>
      </div>

    </>
  );
}
