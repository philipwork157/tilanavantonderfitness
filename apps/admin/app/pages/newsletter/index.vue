<script setup lang="ts">
import type { NewsletterSubscriberView } from '@tilana/contracts/admin-newsletter';

useSeoMeta({ title: 'Newsletter | Tilana Admin', robots: 'noindex, nofollow' });

const route = useRoute();
const router = useRouter();
const tab = computed({
  get: () => (route.query.tab === 'subscribers' ? 'subscribers' : 'emails'),
  set: value => router.replace({ query: value === 'emails' ? {} : { tab: value } }),
});
const tabs = [
  { label: 'Emails', value: 'emails', icon: 'i-lucide-send' },
  { label: 'Subscribers', value: 'subscribers', icon: 'i-lucide-users' },
];

/* Emails */
const { data: campaignData, status: campaignStatus, refresh: refreshCampaigns } = await useFetch('/api/newsletter-campaigns');
const campaigns = computed(() => campaignData.value?.campaigns ?? []);
const campaignColumns = [
  { accessorKey: 'subject', header: 'Email' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'recipientCount', header: 'Recipients' },
  { accessorKey: 'updatedAt', header: 'Date' },
];

/* Subscribers */
const views: NewsletterSubscriberView[] = ['subscribed', 'pending', 'unsubscribed', 'suppressed'];
const view = computed<NewsletterSubscriberView>({
  get: () => views.find(value => value === route.query.view) ?? 'subscribed',
  set: value => router.replace({ query: { tab: 'subscribers', ...(value === 'subscribed' ? {} : { view: value }) } }),
});
const { data: subscriberData, status: subscriberStatus, refresh: refreshSubscribers } = await useFetch('/api/newsletter-subscribers', { query: { view } });
const subscribers = computed(() => subscriberData.value?.subscribers ?? []);
const counts = computed(() => subscriberData.value?.counts);
const viewItems = computed(() => [
  { label: `Subscribed (${counts.value?.subscribed ?? 0})`, value: 'subscribed' },
  { label: `Waiting (${counts.value?.pending ?? 0})`, value: 'pending' },
  { label: `Unsubscribed (${counts.value?.unsubscribed ?? 0})`, value: 'unsubscribed' },
  { label: `Bounced or spam (${counts.value?.suppressed ?? 0})`, value: 'suppressed' },
]);
const subscriberColumns = [
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'status', header: 'Status' },
  { id: 'date', header: 'Since' },
];
const emptySubscribers: Record<NewsletterSubscriberView, { title: string; description: string }> = {
  subscribed: { title: 'No subscribers yet', description: 'People who sign up on the website and confirm their email appear here.' },
  pending: { title: 'Nobody waiting', description: 'People who signed up but have not clicked the confirmation link yet appear here.' },
  unsubscribed: { title: 'Nobody has unsubscribed', description: 'People who use the unsubscribe link appear here.' },
  suppressed: { title: 'No bounces or complaints', description: 'Addresses that bounced or marked an email as spam are never emailed again.' },
};

function subscriberDate(row: { status: string; confirmedAt: string | null; consentedAt: string; unsubscribedAt: string | null; suppressedAt: string | null }) {
  const date = row.status === 'subscribed' ? row.confirmedAt
    : row.status === 'unsubscribed' ? row.unsubscribedAt
      : row.status === 'pending' ? row.consentedAt
        : row.suppressedAt;
  return date ? formatDateTime(date) : '';
}

const sentCampaigns = computed(() => campaigns.value.filter(campaign => campaign.status === 'sent').length);

const refreshing = ref(false);
async function refreshAll() {
  refreshing.value = true;
  try {
    await Promise.all([refreshCampaigns(), refreshSubscribers()]);
  }
  finally {
    refreshing.value = false;
  }
}

/* New email */
const createOpen = ref(false);
const selectedPostId = ref<number | undefined>();
const creating = ref(false);
const createError = ref('');
const { data: postData, execute: loadPosts } = useFetch('/api/blog-posts', { immediate: false });
const postItems = computed(() => (postData.value?.posts ?? [])
  .filter(post => post.status === 'published')
  .map(post => ({ label: post.title, value: post.id })));

async function openCreate() {
  createError.value = '';
  selectedPostId.value = undefined;
  createOpen.value = true;
  await loadPosts();
}

async function createCampaign() {
  if (!selectedPostId.value) return;
  creating.value = true;
  createError.value = '';
  try {
    const { id } = await $fetch('/api/newsletter-campaigns', { method: 'POST', body: { blogPostId: selectedPostId.value } });
    await navigateTo(`/newsletter/${id}`);
  }
  catch (error) {
    createError.value = (error as { data?: { statusMessage?: string } }).data?.statusMessage ?? 'Could not create the email.';
  }
  finally {
    creating.value = false;
  }
}

const toast = useToast();
onMounted(() => {
  if (route.query.deleted) toast.add({ title: 'Draft deleted', icon: 'i-lucide-trash-2' });
});
</script>

<template>
  <AdminPage id="newsletter" title="Newsletter">
    <template #actions>
      <AdminRefreshButton :loading="refreshing" @click="refreshAll" />
      <UButton label="New email" icon="i-lucide-plus" :ui="{ label: 'max-sm:sr-only' }" @click="openCreate" />
    </template>

    <section class="stat-grid" aria-label="Newsletter summary">
      <AdminStatTile
        to="/newsletter?tab=subscribers"
        icon="i-lucide-users"
        tone="success"
        :label="counts?.subscribed === 1 ? 'Subscriber' : 'Subscribers'"
        :value="counts?.subscribed ?? 0"
        hint="Confirmed and receiving emails"
      />
      <AdminStatTile
        to="/newsletter?tab=subscribers&view=pending"
        icon="i-lucide-hourglass"
        tone="info"
        label="Waiting"
        :value="counts?.pending ?? 0"
        hint="Signed up, not confirmed yet"
      />
      <AdminStatTile
        to="/newsletter"
        icon="i-lucide-send"
        tone="brand"
        label="Emails sent"
        :value="sentCampaigns"
        :hint="campaigns.length - sentCampaigns ? `${campaigns.length - sentCampaigns} not sent yet` : 'Nothing waiting'"
      />
      <AdminStatTile
        to="/newsletter?tab=subscribers&view=suppressed"
        icon="i-lucide-mail-x"
        tone="danger"
        label="Bounced or spam"
        :value="counts?.suppressed ?? 0"
        hint="Never emailed again"
      />
    </section>

    <div class="toolbar">
      <UTabs v-model="tab" :items="tabs" :content="false" variant="link" :ui="{ list: 'border-b-0' }" />
    </div>

    <template v-if="tab === 'emails'">
      <AdminEmptyState
        v-if="campaignStatus !== 'pending' && !campaigns.length"
        icon="i-lucide-send"
        title="No newsletter emails yet"
        description="Choose a published blog post to share with your subscribers. You can preview it and send yourself a test first."
      >
        <UButton label="New email" icon="i-lucide-plus" class="empty-action" @click="openCreate" />
      </AdminEmptyState>

      <div v-else class="table-card">
        <UTable
          :data="campaigns"
          :columns="campaignColumns"
          :loading="campaignStatus === 'pending'"
          :on-select="(_event, row) => navigateTo(`/newsletter/${row.original.id}`)"
          :ui="{ separator: 'bg-(--ui-border)' }"
        >
          <template #subject-cell="{ row }">
            <NuxtLink :to="`/newsletter/${row.original.id}`" class="stack" @click.stop>
              <span class="primary">{{ row.original.subject }}</span>
              <span v-if="row.original.postTitle !== row.original.subject" class="secondary">{{ row.original.postTitle ?? 'Blog post removed' }}</span>
            </NuxtLink>
          </template>
          <template #status-cell="{ row }">
            <AdminStatusBadge :label="campaignStatusLabel[row.original.status] ?? row.original.status" :tone="campaignTone[row.original.status]" />
          </template>
          <template #recipientCount-cell="{ row }">
            <span v-if="row.original.status === 'draft'" class="secondary">Not sent</span>
            <span v-else class="nowrap">{{ row.original.sentCount }} of {{ row.original.recipientCount }}</span>
          </template>
          <template #updatedAt-cell="{ row }">
            <span class="nowrap">{{ formatDateTime(row.original.finishedAt ?? row.original.startedAt ?? row.original.updatedAt) }}</span>
          </template>
        </UTable>
      </div>
    </template>

    <template v-else>
      <div class="view-row">
        <USelect v-model="view" :items="viewItems" class="view-select" aria-label="Show subscribers" />
      </div>

      <AdminEmptyState
        v-if="subscriberStatus !== 'pending' && !subscribers.length"
        icon="i-lucide-users"
        :title="emptySubscribers[view].title"
        :description="emptySubscribers[view].description"
      />

      <div v-else class="table-card">
        <UTable
          :data="subscribers"
          :columns="subscriberColumns"
          :loading="subscriberStatus === 'pending'"
          :ui="{ separator: 'bg-(--ui-border)' }"
          class="subscribers-table"
        >
          <template #email-cell="{ row }">
            <span class="stack">
              <span class="primary">{{ row.original.email }}</span>
              <span v-if="row.original.suppressionReason" class="secondary">{{ row.original.suppressionReason }}</span>
            </span>
          </template>
          <template #status-cell="{ row }">
            <AdminStatusBadge :label="subscriberStatusLabel[row.original.status] ?? row.original.status" :tone="subscriberTone[row.original.status]" />
          </template>
          <template #date-cell="{ row }">
            <span class="nowrap">{{ subscriberDate(row.original) }}</span>
          </template>
        </UTable>
      </div>
    </template>

    <UModal v-model:open="createOpen" title="New newsletter email" description="Choose the blog post to share. You can change the subject and add a short note next.">
      <template #body>
        <form id="new-campaign-form" class="new-campaign" @submit.prevent="createCampaign">
          <UFormField label="Blog post" name="blogPostId" required :error="createError || undefined" :help="postItems.length ? undefined : 'Only published posts can be sent.'">
            <USelectMenu
              v-model="selectedPostId"
              :items="postItems"
              value-key="value"
              placeholder="Choose a published post"
              class="w-full"
            />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <div class="modal-actions">
          <UButton label="Cancel" color="neutral" variant="ghost" @click="createOpen = false" />
          <UButton type="submit" form="new-campaign-form" label="Create draft" :loading="creating" :disabled="!selectedPostId" />
        </div>
      </template>
    </UModal>
  </AdminPage>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: calc(var(--space-2) * -1);
}

.view-row {
  display: flex;
}

/* Active tab: dark text over the terracotta underline (terracotta text is too faint). */
.toolbar :deep([data-slot='trigger'][data-state='active']) {
  color: var(--color-text-primary);
}

.stat-grid {
  display: grid;
  gap: var(--space-4);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
}

.view-select {
  justify-self: start;
  width: auto;
  min-width: 15rem;
}

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

.table-card:not(:has(.subscribers-table)) :deep(tbody tr) {
  cursor: pointer;
}

.table-card:not(:has(.subscribers-table)) :deep(tbody tr:hover) {
  background: var(--color-surface);
}

.stack {
  display: grid;
  min-width: 0;
}

.primary {
  overflow: hidden;
  color: var(--color-text-primary);
  font-weight: var(--weight-semibold);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.secondary {
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: var(--text-body-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nowrap {
  white-space: nowrap;
}

.empty-action {
  margin-top: var(--space-4);
}

.new-campaign {
  display: grid;
}

.modal-actions {
  display: flex;
  width: 100%;
  justify-content: flex-end;
  gap: var(--space-2);
}

@media (max-width: 47.99rem) {
  .table-card :deep(th:nth-child(3)),
  .table-card :deep(td:nth-child(3)),
  .table-card :deep(th:nth-child(4)),
  .table-card :deep(td:nth-child(4)) {
    display: none;
  }

  .view-select {
    width: 100%;
  }
}
</style>
