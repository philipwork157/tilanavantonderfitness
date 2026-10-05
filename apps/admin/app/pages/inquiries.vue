<script setup lang="ts">
useSeoMeta({ title: 'Inquiries | Tilana Admin', robots: 'noindex, nofollow' });
</script>

<template>
  <AdminPage id="inquiries" title="Inquiries">
    <AdminEmptyState
      icon="i-lucide-inbox"
      title="No inquiries yet"
      description="Messages from the website contact form will appear here once it is connected."
    />
  </AdminPage>
</template>
