<script setup lang="ts">
definePageMeta({ title: 'Overview' });
useSeoMeta({ title: 'Overview | Tilana Admin', robots: 'noindex, nofollow' });
</script>

<template>
  <AdminEmptyState
    icon="i-lucide-chart-no-axes-column"
    title="No data yet"
    description="Sales, inquiries and subscriber numbers will appear here once they are connected."
  />
</template>
