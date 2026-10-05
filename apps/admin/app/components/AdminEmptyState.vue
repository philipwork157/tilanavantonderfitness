<script setup lang="ts">
defineProps<{
  icon: string;
  title: string;
  description: string;
}>();
</script>

<template>
  <section class="empty-state" :aria-label="title">
    <span class="empty-icon" aria-hidden="true">
      <UIcon :name="icon" />
    </span>
    <h2>{{ title }}</h2>
    <p>{{ description }}</p>
    <slot />
  </section>
</template>

<style scoped>
.empty-state {
  display: grid;
  justify-items: center;
  gap: var(--space-2);
  padding: var(--space-12) var(--card-padding);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-xs);
  text-align: center;
}

.empty-icon {
  display: grid;
  width: var(--control-lg);
  aspect-ratio: 1;
  place-items: center;
  margin-bottom: var(--space-2);
  border-radius: var(--radius-pill);
  color: var(--color-text-secondary);
  background: var(--color-surface-subtle);
  font-size: 1.25rem;
}

h2 {
  margin: 0;
  color: var(--color-text-primary);
  font-size: var(--text-h5);
  font-weight: var(--weight-semibold);
}

p {
  max-width: 40ch;
  margin: 0;
  color: var(--color-text-muted);
}

@media (max-width: 47.99rem) {
  .empty-state {
    padding: var(--space-8) var(--space-4);
  }
}
</style>
