<script setup lang="ts">
withDefaults(defineProps<{
  icon: string;
  title: string;
  description: string;
  variant?: 'default' | 'compact';
}>(), {
  variant: 'default',
});
</script>

<template>
  <div class="empty-state" :class="{ compact: variant === 'compact' }">
    <span><UIcon :name="icon" /></span>
    <div v-if="variant === 'compact'" class="empty-copy">
      <h3>{{ title }}</h3>
      <p>{{ description }}</p>
    </div>
    <template v-else>
      <h2>{{ title }}</h2>
      <p>{{ description }}</p>
    </template>
  </div>
</template>

<style scoped>
.empty-state { display: grid; min-height: 20rem; place-items: center; align-content: center; padding: 2rem; border: 1px dashed var(--color-border); border-radius: 2rem; text-align: center; }
.empty-state span { display: grid; width: 4.5rem; aspect-ratio: 1; place-items: center; border-radius: 1.4rem; color: var(--caramel); background: var(--sage); font-size: 1.5rem; }
.empty-state h2 { margin: 1rem 0 0; color: var(--ink); font-family: var(--font-heading); }
.empty-state p { margin: 0.4rem 0 0; font-size: 0.75rem; }
.empty-state.compact { display: flex; min-height: 0; align-items: center; justify-content: flex-start; gap: 0.9rem; margin-top: 1.2rem; padding: 1rem; border-radius: 1.2rem; text-align: left; }
.empty-state.compact > span { width: 3rem; flex: none; border-radius: 0.95rem; color: var(--ink); font-size: 1.1rem; }
.empty-copy h3, .empty-copy p { margin: 0; }
.empty-copy h3 { color: var(--ink); font-family: var(--font-heading); font-size: 1.2rem; }
.empty-copy p { margin-top: 0.2rem; font-size: 0.64rem; }
</style>
