<script setup lang="ts">
useSeoMeta({ title: 'Inquiries | Tilana Admin', robots: 'noindex, nofollow' });

const view = ref<'active' | 'archived'>('active');
const viewTabs = [
  { label: 'Active', value: 'active', icon: 'i-lucide-inbox' },
  { label: 'Archived', value: 'archived', icon: 'i-lucide-archive' },
];

const { data, status, refresh } = await useFetch('/api/inquiries', { query: { view } });
const rows = computed(() => data.value?.inquiries ?? []);
type InquiryRow = (typeof rows.value)[number];

const columns = [
  { accessorKey: 'createdAt', header: 'Received' },
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'interestLabel', header: 'Interested in' },
  { accessorKey: 'status', header: 'Status' },
  { id: 'actions', header: '' },
];

const toast = useToast();
const updatingId = ref<number | null>(null);

/** Archive hides an enquiry from the active list; restore brings it back. Nothing is deleted. */
async function setArchived(inquiry: InquiryRow, archived: boolean) {
  updatingId.value = inquiry.id;
  try {
    await $fetch(`/api/inquiries/${inquiry.id}`, {
      method: 'PATCH',
      body: { status: archived ? 'archived' : 'new' },
    });
    if (selected.value?.id === inquiry.id) selected.value = null;
    toast.add({
      title: archived ? 'Enquiry archived' : 'Enquiry restored',
      description: inquiry.name,
      icon: archived ? 'i-lucide-archive' : 'i-lucide-inbox',
    });
    await refresh();
  }
  catch {
    toast.add({ title: 'Could not update the enquiry', description: 'Please try again.', color: 'error', icon: 'i-lucide-circle-alert' });
  }
  finally {
    updatingId.value = null;
  }
}

const selected = ref<InquiryRow | null>(null);
const detailOpen = computed({
  get: () => selected.value !== null,
  set: (open) => {
    if (!open) selected.value = null;
  },
});

function replyLink(inquiry: InquiryRow) {
  const subject = encodeURIComponent(`Re: your enquiry about ${inquiry.interestLabel}`);
  return `mailto:${inquiry.email}?subject=${subject}`;
}

const statusLabel: Record<string, string> = { new: 'New', replied: 'Replied', archived: 'Archived' };
</script>

<template>
  <AdminPage id="inquiries" title="Inquiries">
    <template #actions>
      <AdminRefreshButton :loading="status === 'pending'" @click="refresh()" />
    </template>

    <div class="toolbar">
      <UTabs
        v-model="view"
        :items="viewTabs"
        :content="false"
        variant="link"
        :ui="{ list: 'border-b-0' }"
      />
      <p v-if="rows.length" class="count">
        {{ rows.length }} {{ rows.length === 1 ? 'inquiry' : 'inquiries' }}
      </p>
    </div>

    <AdminEmptyState
      v-if="status !== 'pending' && !rows.length"
      :icon="view === 'archived' ? 'i-lucide-archive' : 'i-lucide-inbox'"
      :title="view === 'archived' ? 'Nothing archived' : 'No inquiries yet'"
      :description="view === 'archived'
        ? 'Archived enquiries are kept here. Restore one to move it back to Active.'
        : 'Messages sent through the website contact form will appear here.'"
    />

    <div v-else class="table-card">
      <UTable
        :data="rows"
        :columns="columns"
        :loading="status === 'pending'"
        :on-select="(_event, row) => { selected = row.original }"
        :ui="{ separator: 'bg-(--ui-border)' }"
        class="inquiries-table"
      >
        <template #createdAt-cell="{ row }">
          <span class="nowrap">{{ formatDateTime(row.original.createdAt) }}</span>
        </template>
        <template #name-cell="{ row }">
          <button type="button" class="name-button" @click.stop="selected = row.original">
            <span class="name">{{ row.original.name }}</span>
            <span class="email">{{ row.original.email }}</span>
            <span class="mobile-date">{{ formatDateTime(row.original.createdAt) }}</span>
          </button>
        </template>
        <template #status-cell="{ row }">
          <div class="badges">
            <AdminStatusBadge :label="statusLabel[row.original.status] ?? row.original.status" :tone="inquiryTone[row.original.status]" />
            <AdminStatusBadge v-if="row.original.notificationError" label="Email not sent" tone="danger" icon="i-lucide-mail-x" />
          </div>
        </template>
        <template #actions-cell="{ row }">
          <UButton
            :icon="row.original.status === 'archived' ? 'i-lucide-archive-restore' : 'i-lucide-archive'"
            :aria-label="row.original.status === 'archived' ? `Restore enquiry from ${row.original.name}` : `Archive enquiry from ${row.original.name}`"
            color="neutral"
            variant="ghost"
            :loading="updatingId === row.original.id"
            @click.stop="setArchived(row.original, row.original.status !== 'archived')"
          />
        </template>
      </UTable>
    </div>

    <USlideover
      v-model:open="detailOpen"
      :title="selected?.name"
      :description="selected ? `Received ${formatDateTime(selected.createdAt)}` : undefined"
    >
      <template #body>
        <dl v-if="selected" class="detail">
          <div>
            <dt>Email</dt>
            <dd><a :href="`mailto:${selected.email}`">{{ selected.email }}</a></dd>
          </div>
          <div>
            <dt>Interested in</dt>
            <dd>{{ selected.interestLabel }}</dd>
          </div>
          <div>
            <dt>Privacy policy accepted</dt>
            <dd>{{ formatDateTime(selected.privacyAcceptedAt) }}</dd>
          </div>
          <div>
            <dt>Email to Tilana</dt>
            <dd v-if="selected.notifiedAt">
              Sent {{ formatDateTime(selected.notifiedAt) }}
            </dd>
            <dd v-else class="error-text">
              Not sent{{ selected.notificationError ? `: ${selected.notificationError}` : '' }}
            </dd>
          </div>
          <div class="message">
            <dt>Message</dt>
            <dd>{{ selected.message }}</dd>
          </div>
        </dl>
      </template>
      <template #footer>
        <div v-if="selected" class="detail-actions">
          <UButton
            :to="replyLink(selected)"
            external
            label="Reply by email"
            icon="i-lucide-reply"
          />
          <UButton
            :label="selected.status === 'archived' ? 'Restore' : 'Archive'"
            :icon="selected.status === 'archived' ? 'i-lucide-archive-restore' : 'i-lucide-archive'"
            color="neutral"
            variant="outline"
            :loading="updatingId === selected.id"
            @click="setArchived(selected, selected.status !== 'archived')"
          />
        </div>
      </template>
    </USlideover>
  </AdminPage>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  border-bottom: 1px solid var(--color-border);
}

/* Active tab: dark text over the terracotta underline (terracotta text is too faint). */
.toolbar :deep([data-slot='trigger'][data-state='active']) {
  color: var(--color-text-primary);
}

.count {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--text-body-sm);
  font-variant-numeric: tabular-nums;
}

.detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.table-card {
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface-elevated);
  box-shadow: var(--shadow-xs);
}

/* Calm header row, generous cell spacing. */
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
  padding: var(--space-4) var(--space-5);
  vertical-align: middle;
}

.table-card :deep(tbody tr:hover) {
  background: var(--color-surface);
}

.table-card :deep(tbody tr) {
  cursor: pointer;
}

.nowrap {
  white-space: nowrap;
}

.name-button {
  display: grid;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.name {
  color: var(--color-text-primary);
  font-weight: var(--weight-semibold);
}

.email {
  color: var(--color-text-muted);
  font-size: var(--text-body-sm);
}

.mobile-date {
  display: none;
  color: var(--color-text-muted);
  font-size: var(--text-caption);
}

/* Phones: drop the date and interest columns (the date moves under the name). */
@media (max-width: 47.99rem) {
  .table-card :deep(th:nth-child(1)),
  .table-card :deep(td:nth-child(1)),
  .table-card :deep(th:nth-child(3)),
  .table-card :deep(td:nth-child(3)) {
    display: none;
  }

  .mobile-date {
    display: block;
  }
}

.badges {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.detail {
  display: grid;
  gap: var(--space-4);
  margin: 0;
}

.detail dt {
  margin-bottom: var(--space-1);
  color: var(--color-text-muted);
  font-size: var(--text-label);
  font-weight: var(--weight-semibold);
}

.detail dd {
  margin: 0;
  color: var(--color-text-primary);
  overflow-wrap: anywhere;
}

.detail a {
  color: var(--color-text-accent);
  text-decoration: underline;
  text-underline-offset: 0.2em;
}

.message dd {
  line-height: var(--leading-body);
  white-space: pre-wrap;
}

.error-text {
  color: var(--color-error) !important;
}
</style>
