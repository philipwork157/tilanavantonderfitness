<script setup lang="ts">
definePageMeta({ title: 'Newsletter' });
useSeoMeta({ title: 'Newsletter | Tilana Admin', robots: 'noindex, nofollow' });
</script>

<template>
  <AdminEmptyState
    icon="i-lucide-mail"
    title="No subscribers yet"
    description="Subscribers and newsletter sends will appear here once the newsletter is connected."
  />
</template>
