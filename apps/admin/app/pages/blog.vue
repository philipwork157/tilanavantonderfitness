<script setup lang="ts">
definePageMeta({ title: 'Blog' });
useSeoMeta({ title: 'Blog | Tilana Admin', robots: 'noindex, nofollow' });
</script>

<template>
  <AdminEmptyState
    icon="i-lucide-notebook-pen"
    title="No blog posts yet"
    description="Writing and publishing blog posts from here is coming next."
  />
</template>
