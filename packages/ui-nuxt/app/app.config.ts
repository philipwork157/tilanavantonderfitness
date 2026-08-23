export default defineAppConfig({
  ui: {
    colors: {
      primary: 'brand',
      neutral: 'stone',
    },
    button: {
      slots: {
        base: 'rounded-full font-semibold transition-transform duration-200 hover:-translate-y-0.5',
      },
    },
    input: {
      slots: {
        root: 'w-full',
        base: 'rounded-2xl bg-white/80 dark:bg-stone-900/70',
      },
    },
    select: {
      slots: {
        base: 'rounded-2xl bg-white/80 dark:bg-stone-900/70',
      },
    },
  },
});
