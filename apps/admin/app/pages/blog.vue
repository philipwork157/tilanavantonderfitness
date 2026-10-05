<script setup lang="ts">
useSeoMeta({ title: 'Blog | Tilana Admin', robots: 'noindex, nofollow' });
</script>

<template>
  <AdminPage id="blog" title="Blog">
    <AdminEmptyState
      icon="i-lucide-notebook-pen"
      title="No blog posts yet"
      description="Writing and publishing blog posts from here is coming next."
    />
  </AdminPage>
</template>
