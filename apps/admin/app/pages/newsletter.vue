<script setup lang="ts">
useSeoMeta({ title: 'Newsletter | Tilana Admin', robots: 'noindex, nofollow' });
</script>

<template>
  <AdminPage id="newsletter" title="Newsletter">
    <AdminEmptyState
      icon="i-lucide-mail"
      title="No subscribers yet"
      description="Subscribers and newsletter sends will appear here once the newsletter is connected."
    />
  </AdminPage>
</template>
