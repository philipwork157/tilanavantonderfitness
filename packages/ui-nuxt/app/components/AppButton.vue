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
    size="xl"
    trailing-icon="i-lucide-arrow-right"
    :loading="loading"
    :class="['app-button', { 'w-full justify-center': block }]"
  >
    <slot>{{ label }}</slot>
  </UButton>
</template>

<style scoped>
.app-button {
  min-height: 3.4rem;
  /* Dark text keeps AA contrast on the light terracotta fill in both themes. */
  color: var(--color-on-primary);
  box-shadow: var(--shadow-button);
}
</style>
