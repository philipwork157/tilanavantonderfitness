<script setup lang="ts">
withDefaults(defineProps<{
  compact?: boolean;
}>(), {
  compact: false,
});
</script>

<template>
  <NuxtLink to="/" class="brand-mark" :class="{ compact }">
    <span v-if="!compact">Tilana van Tonder</span>
    <span v-else>TVT</span>
  </NuxtLink>
</template>

<style scoped>
.brand-mark {
  display: inline-block;
  color: var(--color-secondary);
  font-family: var(--font-script);
  font-size: clamp(2.2rem, 5vw, 3rem);
  line-height: 1;
  transition: color var(--duration-fast) ease, transform var(--duration-base) ease;
}

.brand-mark:hover {
  color: var(--color-text-secondary);
  transform: translateY(-2px) rotate(-1deg);
}

.brand-mark.compact {
  font-family: var(--font-display);
  font-size: 1.1rem;
  font-weight: 600;
  letter-spacing: 0.08em;
}
</style>
