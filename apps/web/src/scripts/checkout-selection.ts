/** Compare reviewed selections without treating harmless ordering changes as a new basket. */
export function sameBasketSelection(left: readonly string[], right: readonly string[]) {
  const sortedRight = [...right].sort();
  return left.length === right.length && [...left].sort().every((slug, index) => slug === sortedRight[index]);
}

/** Freeze the payable selection before the first asynchronous step and guard duplicate submits. */
export function createCheckoutSelectionGuard() {
  let snapshot: readonly string[] | null = null;
  return {
    get active() { return snapshot !== null; },
    begin(reviewed: string[], stored: string[]) {
      if (snapshot) return { state: 'busy' as const };
      if (!sameBasketSelection(reviewed, stored)) return { state: 'changed' as const };
      snapshot = Object.freeze([...reviewed]);
      return { state: 'ready' as const, slugs: snapshot };
    },
    finish() { snapshot = null; },
  };
}

/** Inert locks mouse/keyboard interaction with basket edits, navigation and customer fields together. */
export function lockCheckoutSelection(content: HTMLElement | null | undefined, locked: boolean) {
  content?.toggleAttribute('inert', locked);
}
