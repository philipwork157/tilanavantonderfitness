<script setup lang="ts">
import type { StatusTone } from '~/utils/status-tones';

withDefaults(defineProps<{
  label: string;
  tone?: StatusTone;
  icon?: string;
}>(), { tone: 'neutral', icon: undefined });
</script>

<template>
  <span class="status-badge" :class="`tone-${tone}`">
    <UIcon v-if="icon" :name="icon" class="badge-icon" aria-hidden="true" />
    <span v-else class="badge-dot" aria-hidden="true" />
    {{ label }}
  </span>
</template>

<style scoped>
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.2rem 0.65rem;
  border: 1px solid color-mix(in srgb, var(--tone-text) 22%, transparent);
  border-radius: var(--radius-pill);
  color: var(--tone-text);
  background: var(--tone-bg);
  font-size: var(--text-caption);
  font-weight: var(--weight-semibold);
  line-height: 1.4;
  white-space: nowrap;
}

.badge-dot {
  width: 0.45rem;
  height: 0.45rem;
  flex: none;
  border-radius: 999px;
  background: currentcolor;
}

.badge-icon {
  font-size: 0.85rem;
}

.tone-neutral { --tone-text: var(--color-text-muted); --tone-bg: var(--color-surface-subtle); }
.tone-brand { --tone-text: var(--color-text-secondary); --tone-bg: var(--color-primary-subtle); }
.tone-success { --tone-text: var(--color-success); --tone-bg: var(--color-success-subtle); }
.tone-warning { --tone-text: var(--color-warning); --tone-bg: var(--color-warning-subtle); }
.tone-danger { --tone-text: var(--color-error); --tone-bg: var(--color-error-subtle); }
.tone-info { --tone-text: var(--color-info); --tone-bg: var(--color-info-subtle); }
</style>
