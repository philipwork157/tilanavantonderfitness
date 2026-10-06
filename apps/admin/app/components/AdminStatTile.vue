<script setup lang="ts">
import type { StatusTone } from '~/utils/status-tones';

withDefaults(defineProps<{
  to: string;
  icon: string;
  label: string;
  value: string | number;
  hint?: string;
  tone?: StatusTone;
}>(), { hint: undefined, tone: 'brand' });
</script>

<template>
  <NuxtLink :to="to" class="stat-tile" :class="`tone-${tone}`">
    <AdminIconChip :icon="icon" :tone="tone" class="stat-icon" />
    <span class="stat-label">{{ label }}</span>
    <span class="stat-value">{{ value }}</span>
    <span v-if="hint" class="stat-hint">{{ hint }}</span>
    <UIcon name="i-lucide-arrow-up-right" class="stat-arrow" aria-hidden="true" />
  </NuxtLink>
</template>

<style scoped>
.stat-tile {
  position: relative;
  display: grid;
  gap: var(--space-1);
  padding: var(--card-padding);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  color: inherit;
  /* A soft wash of the tile's colour from the top-left corner. */
  background:
    radial-gradient(120% 90% at 0% 0%, color-mix(in srgb, var(--tone-wash) 55%, transparent), transparent 60%),
    var(--color-surface-elevated);
  box-shadow: var(--shadow-xs);
  transition:
    border-color var(--duration-fast) var(--ease-standard),
    box-shadow var(--duration-base) var(--ease-standard),
    transform var(--duration-base) var(--ease-standard);
}

.stat-tile:hover {
  border-color: var(--color-border-strong);
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

.stat-icon {
  margin-bottom: var(--space-3);
}

.stat-label {
  color: var(--color-text-muted);
  font-size: var(--text-caption);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-eyebrow);
  text-transform: uppercase;
}

.stat-value {
  color: var(--color-text-primary);
  font-size: var(--text-metric);
  font-variant-numeric: tabular-nums;
  font-weight: var(--weight-semibold);
  line-height: var(--leading-snug);
}

.stat-hint {
  color: var(--color-text-muted);
  font-size: var(--text-body-sm);
}

.stat-arrow {
  position: absolute;
  top: var(--card-padding);
  right: var(--card-padding);
  color: var(--color-text-muted);
  transition: transform var(--duration-fast) var(--ease-standard);
}

.stat-tile:hover .stat-arrow {
  color: var(--color-text-primary);
  transform: translate(2px, -2px);
}

.tone-neutral { --tone-wash: var(--color-surface-subtle); }
.tone-brand { --tone-wash: var(--color-primary-subtle); }
.tone-success { --tone-wash: var(--color-success-subtle); }
.tone-warning { --tone-wash: var(--color-warning-subtle); }
.tone-danger { --tone-wash: var(--color-error-subtle); }
.tone-info { --tone-wash: var(--color-info-subtle); }

@media (prefers-reduced-motion: reduce) {
  .stat-tile,
  .stat-tile:hover {
    transform: none;
  }
}
</style>
