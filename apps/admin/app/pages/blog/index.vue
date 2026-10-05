<script setup lang="ts">
useSeoMeta({ title: 'Blog | Tilana Admin', robots: 'noindex, nofollow' });

const { data, status } = await useFetch('/api/blog-posts');
const posts = computed(() => data.value?.posts ?? []);

const columns = [
  { accessorKey: 'title', header: 'Post' },
  { accessorKey: 'category', header: 'Category' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'updatedAt', header: 'Last edited' },
];

const createOpen = ref(false);
const newTitle = ref('');
const creating = ref(false);
const createError = ref('');
const toast = useToast();

async function createPost() {
  createError.value = '';
  creating.value = true;
  try {
    const { id } = await $fetch('/api/blog-posts', { method: 'POST', body: { title: newTitle.value } });
    createOpen.value = false;
    newTitle.value = '';
    await navigateTo(`/blog/${id}`);
  }
  catch (error) {
    createError.value = (error as { data?: { statusMessage?: string } }).data?.statusMessage ?? 'Could not create the post.';
  }
  finally {
    creating.value = false;
  }
}

function openPost(id: number) {
  return navigateTo(`/blog/${id}`);
}

onMounted(() => {
  if (useRoute().query.deleted) toast.add({ title: 'Post deleted', icon: 'i-lucide-trash-2' });
});
</script>

<template>
  <AdminPage id="blog" title="Blog">
    <template #actions>
      <UButton label="New post" icon="i-lucide-plus" @click="createOpen = true" />
    </template>

    <AdminEmptyState
      v-if="status !== 'pending' && !posts.length"
      icon="i-lucide-notebook-pen"
      title="No blog posts yet"
      description="Write the first post. It stays a draft until you publish it."
    >
      <UButton label="New post" icon="i-lucide-plus" class="empty-action" @click="createOpen = true" />
    </AdminEmptyState>

    <div v-else class="table-card">
      <UTable
        :data="posts"
        :columns="columns"
        :loading="status === 'pending'"
        :on-select="(_event, row) => openPost(row.original.id)"
        :ui="{ separator: 'bg-(--ui-border)' }"
      >
        <template #title-cell="{ row }">
          <NuxtLink :to="`/blog/${row.original.id}`" class="post-cell" @click.stop>
            <span class="thumb">
              <img v-if="row.original.coverImageUrl" :src="row.original.coverImageUrl" alt="" loading="lazy">
              <UIcon v-else name="i-lucide-image" />
            </span>
            <span class="post-text">
              <span class="post-title">{{ row.original.title }}</span>
              <span class="post-slug">/blog/{{ row.original.slug }}</span>
            </span>
          </NuxtLink>
        </template>
        <template #status-cell="{ row }">
          <UBadge
            :label="row.original.status === 'published' ? 'Published' : 'Draft'"
            color="neutral"
            variant="subtle"
            :class="{ 'badge-live': row.original.status === 'published' }"
          />
        </template>
        <template #updatedAt-cell="{ row }">
          <span class="nowrap">{{ formatDateTime(row.original.updatedAt) }}</span>
        </template>
      </UTable>
    </div>

    <UModal v-model:open="createOpen" title="New blog post" description="Start with a title. You can change everything later.">
      <template #body>
        <form id="new-post-form" class="new-post" @submit.prevent="createPost">
          <UFormField label="Title" name="title" required :error="createError || undefined">
            <UInput v-model="newTitle" placeholder="When life gets in the way" autofocus maxlength="160" />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <div class="modal-actions">
          <UButton label="Cancel" color="neutral" variant="ghost" @click="createOpen = false" />
          <UButton type="submit" form="new-post-form" label="Create draft" :loading="creating" :disabled="newTitle.trim().length < 3" />
        </div>
      </template>
    </UModal>
  </AdminPage>
</template>

<style scoped>
.table-card {
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface-elevated);
  box-shadow: var(--shadow-xs);
}

.table-card :deep(thead tr) {
  background: var(--color-surface);
}

.table-card :deep(th) {
  padding: var(--space-3) var(--space-5);
  color: var(--color-text-muted);
  font-size: var(--text-caption);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-eyebrow);
  text-transform: uppercase;
}

.table-card :deep(td) {
  padding: var(--space-3) var(--space-5);
  vertical-align: middle;
}

.table-card :deep(tbody tr) {
  cursor: pointer;
}

.table-card :deep(tbody tr:hover) {
  background: var(--color-surface);
}

.post-cell {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.thumb {
  display: grid;
  width: 3rem;
  height: 3.75rem;
  flex: none;
  overflow: hidden;
  place-items: center;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  background: var(--color-surface-subtle);
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.post-text {
  display: grid;
  min-width: 0;
}

.post-title {
  overflow: hidden;
  color: var(--color-text-primary);
  font-weight: var(--weight-semibold);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.post-slug {
  color: var(--color-text-muted);
  font-size: var(--text-body-sm);
}

.badge-live {
  color: var(--color-text-primary);
  background: var(--color-accent-subtle);
}

.nowrap {
  white-space: nowrap;
}

.empty-action {
  margin-top: var(--space-4);
}

.new-post {
  display: grid;
}

.modal-actions {
  display: flex;
  width: 100%;
  justify-content: flex-end;
  gap: var(--space-2);
}

@media (max-width: 47.99rem) {
  .table-card :deep(th:nth-child(2)),
  .table-card :deep(td:nth-child(2)),
  .table-card :deep(th:nth-child(4)),
  .table-card :deep(td:nth-child(4)) {
    display: none;
  }
}
</style>
