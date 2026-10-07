import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import Icon from './Icon';

const GREETING = ['Hi there 👋', 'Have a question about training or one of my programmes? I’m here to help - send me a WhatsApp!'];
const INITIAL = 'Hi Tilana, I’d like to find out more about your training options.';
const QUICK = [
  { label: 'Which program should I start with?', text: 'Hi Tilana, which program should I start with?' },
  { label: 'One-on-one training', text: 'Hi Tilana, I’d like to ask about one-on-one training.' },
  { label: 'A question about my order', text: 'Hi Tilana, I have a question about my order.' },
];
const TEASER_KEY = 'tilana-wa-teaser';

/** Floating WhatsApp button with a little chat window. Sending opens WhatsApp with the message ready. */
export default function WhatsAppChat({ phone, avatar }: { phone: string; avatar: string }) {
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(true);
  const [teaser, setTeaser] = useState(false);
  const [seen, setSeen] = useState(false);
  const [message, setMessage] = useState(INITIAL);
  const inputRef = useRef<HTMLInputElement>(null);
  const launchRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try { if (sessionStorage.getItem(TEASER_KEY) === 'off') { setSeen(true); return; } } catch { /* ignore */ }
    const t = setTimeout(() => setTeaser(true), 7000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    setTyping(true);
    const t = setTimeout(() => setTyping(false), 900);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); launchRef.current?.focus(); } };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); };
  }, [open]);

  const quiet = () => {
    setTeaser(false);
    setSeen(true);
    try { sessionStorage.setItem(TEASER_KEY, 'off'); } catch { /* ignore */ }
  };
  const toggle = () => { quiet(); setOpen((o) => !o); };

  const send = (e: SubmitEvent) => {
    e.preventDefault();
    const text = message.trim() || INITIAL;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  return (
    <div className="wa">
      <AnimatePresence>
        {open && (
          <motion.section
            className="wa-panel"
            role="dialog"
            aria-labelledby="wa-title"
            initial={{ opacity: 0, y: 24, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          >
            <header className="wa-head">
              <img className="wa-avatar" src={avatar} alt="" width={44} height={44} />
              <span className="wa-id">
                <strong id="wa-title">Tilana van Tonder</strong>
                <span><i aria-hidden="true" /> Replies personally</span>
              </span>
              <button type="button" className="wa-close" aria-label="Close WhatsApp chat" onClick={() => setOpen(false)}>
                <Icon name="close" />
              </button>
            </header>
            <div className="wa-body" aria-live="polite">
              <span className="wa-day">Today</span>
              <AnimatePresence mode="wait">
                {typing ? (
                  <motion.div key="typing" className="wa-bubble wa-typing" exit={{ opacity: 0 }} aria-label="Tilana is typing">
                    <i /><i /><i />
                  </motion.div>
                ) : (
                  <motion.div key="hello" className="wa-bubble" initial={{ opacity: 0, y: 8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.3 }}>
                    {GREETING.map((line) => <p key={line}>{line}</p>)}
                    <span className="wa-time">now</span>
                  </motion.div>
                )}
              </AnimatePresence>
              {!typing && (
                <motion.div className="wa-quick" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}>
                  {QUICK.map((q) => (
                    <button key={q.label} type="button" className={message === q.text ? 'on' : undefined} onClick={() => { setMessage(q.text); inputRef.current?.focus(); }}>
                      {q.label}
                    </button>
                  ))}
                </motion.div>
              )}
            </div>
            <form className="wa-form" onSubmit={send}>
              <label className="sr-only" htmlFor="wa-input">Your WhatsApp message</label>
              <input ref={inputRef} id="wa-input" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Enter your message…" autoComplete="off" />
              <button type="submit" aria-label="Send on WhatsApp"><Icon name="send" /></button>
            </form>
            <p className="wa-foot">Opens WhatsApp with your message ready to send.</p>
          </motion.section>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {teaser && !open && (
          <motion.div className="wa-teaser" initial={{ opacity: 0, x: 20, scale: 0.9 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 20, scale: 0.9 }} transition={{ type: 'spring', stiffness: 320, damping: 26 }}>
            <button type="button" className="wa-teaser-main" onClick={toggle}>
              <img src={avatar} alt="" width={36} height={36} />
              <span><strong>Hi, I’m Tilana</strong>Questions? Chat to me on WhatsApp.</span>
            </button>
            <button type="button" className="wa-teaser-x" aria-label="Dismiss" onClick={quiet}><Icon name="close" /></button>
          </motion.div>
        )}
      </AnimatePresence>

      <button ref={launchRef} type="button" className={open ? 'wa-launch is-open' : 'wa-launch'} aria-label={open ? 'Close WhatsApp chat' : 'Chat to Tilana on WhatsApp'} aria-expanded={open} onClick={toggle}>
        {!open && <span className="wa-ring" aria-hidden="true" />}
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={open ? 'x' : 'wa'} className="wa-glyph" initial={{ rotate: -90, scale: 0.4, opacity: 0 }} animate={{ rotate: 0, scale: 1, opacity: 1 }} exit={{ rotate: 90, scale: 0.4, opacity: 0 }} transition={{ duration: 0.22 }}>
            <Icon name={open ? 'close' : 'whatsapp'} />
          </motion.span>
        </AnimatePresence>
        {!open && !seen && <span className="wa-dot" aria-hidden="true" />}
      </button>
    </div>
  );
}
