<script setup lang="ts">
import type { StatusTone } from '~/utils/status-tones';

withDefaults(defineProps<{
  icon: string;
  tone?: StatusTone;
  size?: 'sm' | 'md';
}>(), { tone: 'brand', size: 'md' });
</script>

<template>
  <span class="icon-chip" :class="[`tone-${tone}`, `size-${size}`]" aria-hidden="true">
    <UIcon :name="icon" />
  </span>
</template>

<style scoped>
.icon-chip {
  display: inline-grid;
  flex: none;
  place-items: center;
  border-radius: var(--radius-md);
  color: var(--tone-text);
  background: var(--tone-bg);
}

.size-md {
  width: 2.5rem;
  height: 2.5rem;
  font-size: 1.15rem;
}

.size-sm {
  width: 2rem;
  height: 2rem;
  border-radius: var(--radius-sm);
  font-size: 1rem;
}

.tone-neutral { --tone-text: var(--color-text-secondary); --tone-bg: var(--color-surface-subtle); }
.tone-brand { --tone-text: var(--color-text-accent); --tone-bg: var(--color-primary-subtle); }
.tone-success { --tone-text: var(--color-success); --tone-bg: var(--color-success-subtle); }
.tone-warning { --tone-text: var(--color-warning); --tone-bg: var(--color-warning-subtle); }
.tone-danger { --tone-text: var(--color-error); --tone-bg: var(--color-error-subtle); }
.tone-info { --tone-text: var(--color-info); --tone-bg: var(--color-info-subtle); }
</style>
