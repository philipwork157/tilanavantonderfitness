import type { Product } from '../../programs';

/**
 * Small square tile for a program in the basket and checkout: the program's
 * colour with a mini version of its card drawing (a barbell loaded with 1 to 3
 * plates, the breathing diaphragm and pelvic floor, or the plate in thirds).
 */
export default function ProgramThumb({ illustration, step, tone }: Pick<Product, 'illustration' | 'step' | 'tone'>) {
  return (
    <span className={`program-thumb tone-${tone}`} aria-hidden="true">
      <svg viewBox="0 0 48 48" focusable="false">
        {illustration === 'breath' ? <Breath /> : illustration === 'plate' ? <Plate /> : <Barbell plates={step ?? 1} />}
      </svg>
    </span>
  );
}

const plateHeights = [22, 17, 12];

/** Same barbell as the card: solid plates for this level, dashed ones still to grow into. */
function Barbell({ plates }: { plates: number }) {
  return (
    <g>
      <line className="pt-line" x1="3" y1="24" x2="45" y2="24" />
      <rect className="pt-ink" x="15" y="19.5" width="2" height="9" rx="0.8" />
      <rect className="pt-ink" x="31" y="19.5" width="2" height="9" rx="0.8" />
      {plateHeights.map((h, i) => {
        const y = 24 - h / 2;
        const solid = i < plates;
        const left = 11.6 - i * 4.1;
        const right = 33.4 + i * 4.1;
        return (
          <g key={h} className={solid ? 'pt-plate' : 'pt-ghost'}>
            <rect x={left} y={y} width="3.2" height={h} rx="1.3" />
            <rect x={right} y={y} width="3.2" height={h} rx="1.3" />
          </g>
        );
      })}
    </g>
  );
}

/** The breathing "canister" from the card: diaphragm on top, pelvic floor below, moving down together on the in-breath. */
function Breath() {
  return (
    <g>
      <path className="pt-walls" d="M11.5 15.5C8.5 23.5 9.5 32 14.5 38.5M36.5 15.5C39.5 23.5 38.5 32 33.5 38.5" />
      <path className="pt-dia" d="M9 16.5Q24 2.5 39 16.5Q24 11.5 9 16.5Z" />
      <path className="pt-pf" d="M14 38Q24 46.5 34 38Q24 41.5 14 38Z" />
      <path className="pt-arrow" d="M20.5 21.5l3.5 3 3.5-3M20.5 28l3.5 3 3.5-3" />
    </g>
  );
}

/** The plate in thirds from the card: protein (drumstick), carbs (bread) and fats (avocado). */
function Plate() {
  return (
    <g>
      <circle className="pt-rim" cx="24" cy="24" r="22" />
      <circle className="pt-rim-in" cx="24" cy="24" r="18.5" />
      <path className="pt-protein" d="M24 24L9.28 15.5A17 17 0 0 1 38.72 15.5Z" />
      <path className="pt-carbs" d="M24 24L38.72 15.5A17 17 0 0 1 24 41Z" />
      <path className="pt-fats" d="M24 24L24 41A17 17 0 0 1 9.28 15.5Z" />
      <g className="pt-food">
        <g transform="translate(23.3 14.6) scale(0.42) rotate(-8)">
          <path className="pt-bone-ink" d="M1 3l9 8" />
          <circle className="pt-food-fill" cx="11.8" cy="9.6" r="2.4" />
          <circle className="pt-food-fill" cx="9.4" cy="12.2" r="2.4" />
          <path className="pt-bone" d="M1 3l9 8" />
          <path className="pt-food-fill" d="M4 3C9-3 4-12-4-12C-11-12-14-4-10 2C-7 6-1 7 4 3Z" />
        </g>
        <g transform="translate(32.6 29.6) scale(0.42) rotate(8)">
          <path className="pt-food-fill" d="M-9-1C-12-9-4-13 0-9C4-13 12-9 9-1L8 9H-8Z" />
        </g>
        <g transform="translate(15.4 29.2) scale(0.42) rotate(-25)">
          <path className="pt-avo-skin" d="M0-12C6.5-12 8.5-4 8.5 2C8.5 8 5 12 0 12C-5 12-8.5 8-8.5 2C-8.5-4-6.5-12 0-12Z" />
          <path className="pt-avo-flesh" d="M0-9C4.5-9 6-3 6 1.8C6 6.5 3.5 9 0 9C-3.5 9-6 6.5-6 1.8C-6-3-4.5-9 0-9Z" />
          <circle className="pt-avo-pit" cx="0" cy="3" r="3.6" />
        </g>
      </g>
    </g>
  );
}
