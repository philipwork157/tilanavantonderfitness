<script setup lang="ts">
defineProps<{ loading?: boolean }>();
defineEmits<{ click: [] }>();
</script>

<template>
  <UButton
    label="Refresh"
    icon="i-lucide-refresh-cw"
    color="neutral"
    variant="outline"
    :loading="loading"
    :ui="{ label: 'max-sm:sr-only' }"
    @click="$emit('click')"
  />
</template>
