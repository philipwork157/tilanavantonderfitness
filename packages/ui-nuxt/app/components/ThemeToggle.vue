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
      variant="ghost"
      size="md"
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
  border-radius: var(--radius-pill);
}

.theme-toggle-placeholder {
  display: inline-block;
  width: var(--control-md);
  height: var(--control-md);
}
</style>
