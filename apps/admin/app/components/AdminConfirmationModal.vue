<script setup lang="ts">
defineProps<{
  title: string;
  description: string;
  confirmLabel: string;
  confirmColor: 'error' | 'warning' | 'primary';
  loading: boolean;
}>();

const open = defineModel<boolean>('open', { required: true });
const emit = defineEmits<{ confirm: [] }>();
</script>

<template>
  <UModal v-model:open="open" :title="title" :dismissible="!loading">
    <template #body>
      <div class="confirmation-body">
        <span><UIcon name="i-lucide-triangle-alert" /></span>
        <p>{{ description }}</p>
        <div>
          <UButton label="Cancel" color="neutral" variant="ghost" :disabled="loading" @click="open = false" />
          <UButton :label="confirmLabel" :color="confirmColor" :loading="loading" @click="emit('confirm')" />
        </div>
      </div>
    </template>
  </UModal>
</template>

<style scoped>
.confirmation-body { display: grid; justify-items: center; padding: 0.5rem; text-align: center; }
.confirmation-body > span { display: grid; width: 3.6rem; aspect-ratio: 1; place-items: center; border-radius: 1.1rem; color: var(--ink); background: var(--terracotta); font-size: 1.25rem; }
.confirmation-body p { max-width: 34rem; margin: 1rem 0 1.2rem; font-size: 0.72rem; line-height: 1.65; }
.confirmation-body > div { display: flex; gap: 0.65rem; }
</style>
