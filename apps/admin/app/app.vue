<script setup lang="ts">
// Compact admin density from the design system: same tokens, tighter values.
useHead({ htmlAttrs: { 'data-density': 'compact', 'lang': 'en-ZA' } });
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
