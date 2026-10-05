<script setup lang="ts">
const colorMode = useColorMode();
const isDark = computed(() => colorMode.value === 'dark');

const toggleTheme = () => {
  colorMode.preference = isDark.value ? 'light' : 'dark';
};
</script>

<template>
  <!-- The stored theme is only known in the browser, so render the icon there to avoid a wrong icon after load. -->
  <ClientOnly>
    <UButton
      color="neutral"
      variant="soft"
      size="lg"
      :icon="isDark ? 'i-lucide-sun' : 'i-lucide-moon'"
      :aria-label="isDark ? 'Use light mode' : 'Use dark mode'"
      class="theme-toggle"
      @click="toggleTheme"
    />
    <template #fallback>
      <span class="theme-toggle-placeholder" aria-hidden="true" />
    </template>
  </ClientOnly>
</template>

<style scoped>
.theme-toggle {
  border-radius: 999px;
  box-shadow: var(--shadow-xs);
}

.theme-toggle-placeholder {
  display: inline-block;
  width: 2.5rem;
  height: 2.5rem;
}
</style>
