<script setup lang="ts">
interface Props {
  label?: string;
  type?: 'button' | 'submit';
  block?: boolean;
  loading?: boolean;
}

withDefaults(defineProps<Props>(), {
  label: undefined,
  type: 'button',
  block: false,
  loading: false,
});
</script>

<template>
  <UButton
    :type="type"
    color="primary"
    size="lg"
    trailing-icon="i-lucide-arrow-right"
    :loading="loading"
    :class="['app-button', { 'w-full justify-center': block }]"
  >
    <slot>{{ label }}</slot>
  </UButton>
</template>

<style scoped>
.app-button {
  min-height: var(--control-lg);
  /* Soft Black on terracotta is 8.5:1; white would be 2.3:1. */
  color: var(--color-on-primary);
}

.app-button:not(:disabled):hover {
  background: var(--color-primary-hover);
}

.app-button:not(:disabled):active {
  background: var(--color-primary-active);
}
</style>
