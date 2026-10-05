export default defineAppConfig({
  ui: {
    colors: {
      primary: 'brand',
      neutral: 'stone',
    },
    button: {
      slots: {
        // Pill buttons, Montserrat 600, per the design system.
        base: 'rounded-full font-semibold tracking-[0.02em]',
      },
    },
    input: {
      slots: {
        root: 'w-full',
        base: 'rounded-[var(--radius-md)] bg-[var(--color-surface-elevated)]!',
      },
    },
    select: {
      slots: {
        base: 'rounded-[var(--radius-md)] bg-[var(--color-surface-elevated)]!',
      },
    },
  },
});
