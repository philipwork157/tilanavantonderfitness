<script setup lang="ts">
useSeoMeta({ title: 'Overview | Tilana Admin', robots: 'noindex, nofollow' });
</script>

<template>
  <AdminPage id="overview" title="Overview">
    <AdminEmptyState
      icon="i-lucide-chart-no-axes-column"
      title="No data yet"
      description="Sales, inquiries and subscriber numbers will appear here once they are connected."
    />
  </AdminPage>
</template>
