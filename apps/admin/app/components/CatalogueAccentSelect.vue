<script setup lang="ts">
import {
  catalogueAccentOptions,
  normaliseCatalogueAccent,
} from '../utils/catalogue';

const model = defineModel<string>({ required: true });

function accentDotClass(value: unknown): string {
  return `accent-dot-${normaliseCatalogueAccent(typeof value === 'string' ? value : null)}`;
}
</script>

<template>
  <USelect
    v-model="model"
    :items="catalogueAccentOptions"
    value-key="value"
    size="lg"
    class="w-full"
  >
    <template #leading="{ modelValue }">
      <span class="accent-dot" :class="accentDotClass(modelValue)" aria-hidden="true" />
    </template>
    <template #item-leading="{ item }">
      <span class="accent-dot" :class="accentDotClass(item.value)" aria-hidden="true" />
    </template>
  </USelect>
</template>

<style scoped>
.accent-dot {
  display: inline-block;
  width: 0.85rem;
  height: 0.85rem;
  flex: none;
  border: 1px solid color-mix(in srgb, var(--ink) 14%, transparent);
  border-radius: 999px;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--white) 58%, transparent);
}

.accent-dot-terracotta { background: var(--terracotta); }
.accent-dot-sage { background: var(--sage); }
.accent-dot-caramel { background: var(--caramel); }
</style>
