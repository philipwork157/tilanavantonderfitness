
// Website copy that lives in code. Programs and prices come from the admin (see programs.ts).

export type Tone = 'terracotta' | 'sage' | 'sand' | 'white' | 'caramel';

export const programDisclaimer =
  'All programs provide general education based on personal experience and are not a substitute for medical, physiotherapy, dietetic, or other qualified professional care. Seek appropriate clearance before beginning, particularly during pregnancy, after birth, or when managing an injury or health condition. Stop and consult an appropriately qualified healthcare professional if movement causes pain, dizziness, unusual shortness of breath, pelvic-floor symptoms, or other concerns.';

export type Discipline = {
  key: string;
  word: string;
  label: string;
  tone: Tone;
  icon: 'dumbbell' | 'shoe' | 'bike' | 'breath' | 'bowl';
  line: string;
  copy: string;
  points: string[];
  link: { label: string; path: string };
};

export const disciplines: Discipline[] = [
  {
    key: 'lift',
    word: 'LIFT',
    label: 'Weight training',
    tone: 'terracotta',
    icon: 'dumbbell',
    line: 'Strong is a skill. Learn it properly.',
    copy: 'Squat, hinge, push, pull and carry, with good form, sensible loads and progress you can actually keep. Bodyweight or dumbbells at home, or a full gym.',
    points: ['Technique-first sessions', 'Home or gym options', 'Beginner to Advanced'],
    link: { label: 'See the strength programs', path: '/program#strength-series' },
  },
  {
    key: 'run',
    word: 'RUN',
    label: 'Running',
    tone: 'sage',
    icon: 'shoe',
    line: 'Fuel the miles. Build the legs.',
    copy: 'From your first 5 km to a full marathon: strength work keeps runners going, and fuelling properly keeps the tank full. Carbs are not the enemy here.',
    points: ['Strength for runners', 'Fuelling long runs', 'Patience over pressure'],
    link: { label: 'Read: Why are we so afraid of carbs?', path: '/blog/why-are-we-so-afraid-to-eat-carbs' },
  },
  {
    key: 'ride',
    word: 'RIDE',
    label: 'Cycling',
    tone: 'sand',
    icon: 'bike',
    line: 'Joint-friendly cardio, serious legs.',
    copy: 'Cycling is a brilliant low-impact engine. Pair it with strength work that keeps your knees, hips and back happy on the bike.',
    points: ['Low-impact cardio', 'Strength for riders', 'Ask Tilana what fits'],
    link: { label: 'Ask about cycling', path: '/contact' },
  },
  {
    key: 'core',
    word: 'CORE',
    label: 'Pelvic floor',
    tone: 'caramel',
    icon: 'breath',
    line: 'Before birth, during, and after.',
    copy: 'Breathing, coordination and gradual strength for your pelvic floor and deep core, and honest guidance on when a pelvic-health professional is the right next step.',
    points: ['Breath and coordination', 'Gentle, gradual progress', 'No “bounce back” pressure'],
    link: { label: 'See Reconnect', path: '/program#reconnect' },
  },
  {
    key: 'fuel',
    word: 'FUEL',
    label: 'Nutrition',
    tone: 'white',
    icon: 'bowl',
    line: 'Food is fuel, not a reward.',
    copy: 'Understand protein, carbs, fats and micronutrients, then build meals around your family, your training and your goals. Nothing is banned.',
    points: ['Macros made simple', 'Balanced, satisfying meals', 'No guilt, no rigid rules'],
    link: { label: 'See Nourish', path: '/program#nourish' },
  },
];

export const myths = [
  { myth: 'Lifting weights will make women bulky.', fact: 'Building noticeable size takes years of targeted training and eating. Strength work mostly makes you capable, confident and harder to injure.' },
  { myth: 'You have to “bounce back” after birth.', fact: 'Your body just did something huge. Rebuild gradually: breath and pelvic floor first, on your own timeline.' },
  { myth: 'Cardio is the only way to lose weight.', fact: 'Sustainable fat loss comes from eating you can keep up and movement you enjoy. Strength work helps you hold on to muscle along the way.' },
  { myth: 'Pelvic-floor training is just Kegels.', fact: 'It’s breathing, coordination, relaxation and strength. Leaking is common, but not something you simply have to live with.' },
  { myth: 'Carbs are the enemy.', fact: 'Carbs fuel your training, your runs and your busiest days. Nothing is banned. It’s about balance and portions that fit you.' },
  { myth: 'Rest days mean you’re lazy.', fact: 'Rest is when your body adapts and gets stronger. Planned rest is part of the program, not a failure of it.' },
];

export const values = [
  { n: '01', title: 'Real life first', copy: 'Your plan should fit around your life, not make you feel guilty for having one.', tone: 'terracotta' as Tone },
  { n: '02', title: 'Progress over pressure', copy: 'Small actions repeated gently can build meaningful strength and confidence.', tone: 'sage' as Tone },
  { n: '03', title: 'Clear boundaries', copy: 'Health concerns belong with an appropriately qualified healthcare professional.', tone: 'sand' as Tone },
];

/** From Tilana's welcome letter on the blog. */
export const timeline = [
  { when: 'Growing up', title: 'Sport and people', copy: 'Athletics and netball were a huge part of my life.' },
  { when: 'Teaching', title: 'Helping people grow', copy: 'Music led me to study education and become a teacher. I love seeing people grow in confidence.' },
  { when: 'University', title: 'The hard lesson', copy: 'An unhealthy relationship with food slowly taught me that my worth is not a number on the scale.' },
  { when: 'Motherhood', title: 'Training through pregnancy', copy: 'I trained throughout my first pregnancy, with my doctor’s approval.' },
  { when: '6 months postpartum', title: 'A 4:04 marathon', copy: 'I ran my fastest marathon in 4 hours and 4 minutes. After my second pregnancy, I’m going to try to break that record.' },
  { when: 'Today', title: 'This dream, from home', copy: 'Building a space for healthy, sustainable living, one step at a time.' },
];

const checkoutFaqs = [
  { q: 'How do I receive my program?', a: 'Once your payment is confirmed, your program is emailed to you with the PDF attached. Lost the email? Ask for it to be sent again from the checkout page, or email me. No account or password needed.' },
  { q: 'Can I buy more than one program?', a: 'Yes. Add as many as you like to your basket and pay once, securely through Paystack.' },
];

const contactFaqs = [
  { q: 'How do I buy a program?', a: 'Tap the button on the program you want and send me the short message that is already filled in. I’ll reply personally with the next steps.' },
  { q: 'Can I buy more than one program?', a: 'Yes. Mention every program you’d like in your message and I’ll help you with all of them at once.' },
];

/** The program page FAQs; the buying answers depend on whether online checkout is on. */
export function programFaqs(checkout: boolean) {
  const buying = checkout ? checkoutFaqs : contactFaqs;
  return [
    buying[0]!,
    { q: 'Is this a subscription?', a: 'No. Every program is a once-off purchase. There is nothing to cancel and nothing renews.' },
    buying[1]!,
    { q: 'Do I need a gym?', a: 'Beginner works with bodyweight or dumbbells, at home or in the gym. Each program description explains who it is designed for.' },
    { q: 'Can I get a refund?', a: 'The program is emailed to you straight after payment, so change-of-mind refunds are not normally available once it has been sent. If something went wrong, like a double charge or a file that will not open, I will fix it or refund you. The refund policy explains everything.' },
  ];
}

/** Contact form options come from the shared contract (the admin stores these keys). */
export { contactInterestOptions as contactInterests } from '@tilana/contracts/contact';

export const blogCategories = ['Movement', 'Strength', 'Nourishment', 'Nurturance', 'Motherhood'] as const;
