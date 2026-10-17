'use client';

import { MAX_HIGHLIGHT_LENGTH } from '@tilana/contracts/admin-programs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Examples only: shown greyed out until Tilana types her own.
const EXAMPLES = [
  'e.g. 6 weeks, 3 sessions a week, about 40 minutes',
  'e.g. Dumbbells and a bench, at home or in the gym',
  'e.g. Every exercise with photos and form cues',
  'e.g. A warm-up, a progress tracker and rest-day tips',
];

/**
 * "What's inside": a few short lines shown next to the PDF pictures, so buyers
 * know what they will be doing. About the program, not exact pages, so they
 * stay right when the PDF is updated. Saved with the rest of the program.
 */
export function HighlightsField({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const update = (index: number, text: string) => onChange(value.map((line, i) => (i === index ? text : line)));
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">What’s inside</legend>
      <p className="-mt-1 mb-1 text-xs text-muted-foreground">
        Up to {value.length} short lines next to the pictures: how long it runs, what you need, what you get. Leave any line empty. Saved with Save.
      </p>
      <ol className="grid gap-2">
        {value.map((line, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-bold text-muted-foreground" aria-hidden>{i + 1}</span>
            <Label htmlFor={`highlight-${i}`} className="sr-only">What’s inside, line {i + 1}</Label>
            <Input id={`highlight-${i}`} value={line} onChange={(e) => update(i, e.target.value)} maxLength={MAX_HIGHLIGHT_LENGTH} placeholder={EXAMPLES[i]} />
          </li>
        ))}
      </ol>
    </fieldset>
  );
}
