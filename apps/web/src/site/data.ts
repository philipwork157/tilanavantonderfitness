import { checkoutEnabled } from './config';

// content. Program copy and prices match the production website.

export type Tone = 'terracotta' | 'sage' | 'sand' | 'white' | 'caramel';

export type Program = {
  key: string;
  /** Checkout identity, like the live site's program-volume slugs. */
  slug: string;
  name: string;
  label: string;
  volume: string;
  title: string;
  short: string;
  description: string;
  priceCents: number;
  tone: Tone;
  level: string;
  tags: string[];
  icon: 'dumbbell' | 'stairs' | 'bolt' | 'breath' | 'bowl';
  /** The strength series is a three-step path; the focus programs stand on their own. */
  series: 'strength' | 'focus';
  /** Strength series only: 1, 2 or 3. */
  step?: 1 | 2 | 3;
  /** A short label on the art panel: "Start here", "Pelvic floor", ... */
  marker: string;
};

export const programs: Program[] = [
  {
    key: 'beginner',
    slug: 'move-volume-1',
    name: 'Beginner',
    label: 'Beginner · Volume 1',
    volume: 'Volume 1',
    title: 'Build a confident foundation.',
    short: 'A welcoming introduction to strength for anyone new to training or returning after time away.',
    description:
      'A welcoming introduction to strength for women and men who are new to training or returning after time away. Learn healthy movement patterns, practise good form, and build the confidence to use bodyweight or dumbbells safely at home or in the gym.',
    priceCents: 39900,
    tone: 'terracotta',
    level: 'New or returning',
    tags: ['Strength', 'Home or gym', 'Bodyweight & dumbbells'],
    icon: 'dumbbell',
    series: 'strength',
    step: 1,
    marker: 'Start here',
  },
  {
    key: 'intermediate',
    slug: 'intermediate-volume-1',
    name: 'Intermediate',
    label: 'Intermediate · Volume 1',
    volume: 'Volume 1',
    title: 'Turn your foundation into progress.',
    short: 'A structured next step: more volume, thoughtful progressions and new challenges.',
    description:
      'Designed for people who feel comfortable with the basics and want a structured next step. The program introduces more training volume, thoughtful exercise progressions, and new challenges while keeping technique and sustainable progress at the centre.',
    priceCents: 79900,
    tone: 'sand',
    level: 'Comfortable with the basics',
    tags: ['More volume', 'Progressions', 'Technique first'],
    icon: 'stairs',
    series: 'strength',
    step: 2,
    marker: 'Next step',
  },
  {
    key: 'advanced',
    slug: 'strong-volume-1',
    name: 'Advanced',
    label: 'Advanced · Volume 1',
    volume: 'Volume 1',
    title: 'Train with greater purpose.',
    short: 'Purposeful sessions, progressive overload and clear performance goals.',
    description:
      'A focused strength program for experienced women and men who already have an established training base. Advanced uses purposeful sessions, progressive overload, and clear performance goals to help you continue building strength with confidence.',
    priceCents: 79900,
    tone: 'caramel',
    level: 'Established training base',
    tags: ['Progressive overload', 'Performance', 'Experienced'],
    icon: 'bolt',
    series: 'strength',
    step: 3,
    marker: 'Level up',
  },
  {
    key: 'reconnect',
    slug: 'reconnect-volume-1',
    name: 'Reconnect',
    label: 'Reconnect · Volume 1',
    volume: 'Volume 1',
    title: 'Reconnect with your pelvic floor.',
    short: 'Pelvic-floor awareness, breathing and gradual strengthening, before, during and after pregnancy.',
    description:
      'Gentle education and movement for building pelvic-floor awareness before, during, and after pregnancy. Learn how breathing, coordination, and gradual strengthening can support daily movement, while understanding when help from a pelvic-health professional is needed.',
    priceCents: 39900,
    tone: 'sage',
    level: 'Before, during & after pregnancy',
    tags: ['Pelvic floor', 'Breathing', 'Pregnancy & postpartum'],
    icon: 'breath',
    series: 'focus',
    marker: 'Pelvic floor',
  },
  {
    key: 'nourish',
    slug: 'nourish-volume-1',
    name: 'Nourish',
    label: 'Nourish · Volume 1',
    volume: 'Volume 1',
    title: 'Understand how to fuel your body.',
    short: 'Macro- and micronutrients made practical: balanced, satisfying meals without guilt.',
    description:
      'A practical guide to macro- and micronutrients and the roles they play in energy, recovery, and everyday wellbeing. Learn to build balanced, satisfying meals around your needs without rigid restriction, guilt, or treating food as a reward.',
    priceCents: 39900,
    tone: 'white',
    level: 'Everyone',
    tags: ['Nutrition', 'Macros & micros', 'No rigid rules'],
    icon: 'bowl',
    series: 'focus',
    marker: 'Nutrition',
  },
];

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
  program?: string;
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
    program: 'beginner',
    link: { label: 'See the strength programs', path: '/program#beginner' },
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
    program: 'reconnect',
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
    program: 'nourish',
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
  { when: '6 months postpartum', title: 'A 4:04 marathon', copy: 'I ran my fastest marathon in 4 hours and 4 minutes.' },
  { when: 'Today', title: 'This dream, from home', copy: 'Building a space for healthy, sustainable living, one step at a time.' },
];

const buyingFaqs = checkoutEnabled
  ? [
      { q: 'How do I receive my program?', a: 'Once your payment is confirmed, your program is emailed to you as a PDF. You can also sign in later with the same email address to download it again. No password needed.' },
      { q: 'Can I buy more than one program?', a: 'Yes. Add as many as you like to your basket and pay once, securely through Paystack.' },
    ]
  : [
      { q: 'How do I buy a program?', a: 'Tap the button on the program you want and send me the short message that is already filled in. I’ll reply personally with the next steps.' },
      { q: 'Can I buy more than one program?', a: 'Yes. Mention every program you’d like in your message and I’ll help you with all of them at once.' },
    ];

export const programFaqs = [
  buyingFaqs[0]!,
  { q: 'Is this a subscription?', a: 'No. Every program is a once-off purchase. There is nothing to cancel and nothing renews.' },
  buyingFaqs[1]!,
  { q: 'Do I need a gym?', a: 'Beginner works with bodyweight or dumbbells, at home or in the gym. Each program description explains who it is designed for.' },
  { q: 'Can I get a refund?', a: 'If you change your mind within 7 days and have not accessed or downloaded the program, a refund will ordinarily be approved. The refund policy explains everything else.' },
];

/** Contact form options come from the shared contract (the admin stores these keys). */
export { contactInterestOptions as contactInterests } from '@tilana/contracts/contact';

export const blogCategories = ['Movement', 'Strength', 'Nourishment', 'Nurturance', 'Motherhood'] as const;
