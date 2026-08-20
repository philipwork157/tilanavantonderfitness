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
  color: var(--caramel);
  font-family: var(--font-script);
  font-size: clamp(2.2rem, 5vw, 3rem);
  line-height: 1;
  transition: color var(--motion-fast) ease, transform var(--motion-base) ease;
}

.brand-mark:hover {
  color: var(--chocolate);
  transform: translateY(-2px) rotate(-1deg);
}

.brand-mark.compact {
  font-family: var(--font-heading);
  font-size: 1.1rem;
  font-weight: 600;
  letter-spacing: 0.08em;
}
</style>
