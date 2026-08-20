<script setup lang="ts">
const colorMode = useColorMode();
const isDark = computed(() => colorMode.value === 'dark');

const toggleTheme = () => {
  colorMode.preference = isDark.value ? 'light' : 'dark';
};
</script>

<template>
  <UButton
    color="neutral"
    variant="soft"
    size="lg"
    :icon="isDark ? 'i-lucide-sun' : 'i-lucide-moon'"
    :aria-label="isDark ? 'Use light mode' : 'Use dark mode'"
    class="theme-toggle"
    @click="toggleTheme"
  />
</template>

<style scoped>
.theme-toggle {
  border-radius: 999px;
  box-shadow: 0 8px 22px rgb(97 70 53 / 10%);
}
</style>
