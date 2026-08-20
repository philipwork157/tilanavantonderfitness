<script setup lang="ts">
interface Props {
  label?: string;
  type?: 'button' | 'submit';
  block?: boolean;
}

withDefaults(defineProps<Props>(), {
  label: undefined,
  type: 'button',
  block: false,
});
</script>

<template>
  <UButton
    :type="type"
    color="primary"
    size="xl"
    trailing-icon="i-lucide-arrow-right"
    :class="['app-button', { 'w-full justify-center': block }]"
  >
    <slot>{{ label }}</slot>
  </UButton>
</template>

<style scoped>
.app-button {
  min-height: 3.4rem;
  box-shadow: 0 12px 30px rgb(97 70 53 / 16%);
}
</style>
