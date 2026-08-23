<script setup lang="ts">
import { contactInterestLabels } from '@tilana/contracts/contact';

definePageMeta({ layout: 'dashboard' });

const search = ref('');
const statusFilter = ref('all');
const { data, status, error, refresh } = await useFetch('/api/admin/contacts');

const statusOptions = [
  { label: 'All statuses', value: 'all' },
  { label: 'New', value: 'new' },
  { label: 'Read', value: 'read' },
  { label: 'Replied', value: 'replied' },
  { label: 'Archived', value: 'archived' },
];

const columns = [
  { accessorKey: 'fullName', header: 'Enquiry' },
  { id: 'message', header: 'Message' },
  { accessorKey: 'interest', header: 'Interest' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'createdAt', header: 'Received' },
  { id: 'actions', header: '' },
];

const filteredSubmissions = computed(() => {
  const query = search.value.trim().toLowerCase();
  return (data.value?.submissions ?? []).filter((submission) => {
    const matchesStatus = statusFilter.value === 'all' || submission.status === statusFilter.value;
    const matchesSearch =
      !query ||
      submission.fullName.toLowerCase().includes(query) ||
      submission.email.toLowerCase().includes(query) ||
      submission.message.toLowerCase().includes(query);
    return matchesStatus && matchesSearch;
  });
});

function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Johannesburg',
  }).format(new Date(value));
}

function statusColor(statusValue: string): 'primary' | 'info' | 'success' | 'neutral' {
  if (statusValue === 'new') return 'primary';
  if (statusValue === 'read') return 'info';
  if (statusValue === 'replied') return 'success';
  return 'neutral';
}

useSeoMeta({ title: 'Contact enquiries | Tilana Admin', robots: 'noindex, nofollow' });
</script>

<template>
  <div class="contacts-page">
    <section class="contacts-heading">
      <div>
        <p class="eyebrow">Conversations</p>
        <h1>Contact enquiries</h1>
        <p>Review the messages sent through the public website. Sensitive health details should continue through an appropriate professional channel.</p>
      </div>
      <span class="enquiry-total">
        <strong>{{ data?.submissions.length ?? 0 }}</strong>
        <small>Total</small>
      </span>
    </section>

    <section class="contact-tools" aria-label="Filter enquiries">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="Search name, email or message"
        size="lg"
        class="search-input"
      />
      <USelect v-model="statusFilter" :items="statusOptions" value-key="value" size="lg" class="status-select" />
      <UButton
        icon="i-lucide-refresh-cw"
        label="Refresh"
        color="neutral"
        variant="soft"
        size="lg"
        :loading="status === 'pending'"
        @click="() => refresh()"
      />
    </section>

    <USkeleton v-if="status === 'pending'" class="h-80 rounded-3xl" />

    <UAlert
      v-else-if="error"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      title="Enquiries could not be loaded"
      description="Please check the database connection and try again."
    />

    <div v-else-if="!filteredSubmissions.length" class="empty-results">
      <span><UIcon name="i-lucide-search-x" /></span>
      <h2>No matching enquiries</h2>
      <p>Change the search or status filter to see more results.</p>
    </div>

    <UCard v-else class="enquiries-table-card" :ui="{ body: 'p-0 sm:p-0' }">
      <UTable :data="filteredSubmissions" :columns="columns" class="enquiries-table">
        <template #fullName-cell="{ row }">
          <div class="enquiry-identity">
            <span class="enquiry-avatar">{{ row.original.fullName.slice(0, 1).toUpperCase() }}</span>
            <div>
              <strong>{{ row.original.fullName }}</strong>
              <a :href="`mailto:${row.original.email}`">{{ row.original.email }}</a>
            </div>
          </div>
        </template>
        <template #message-cell="{ row }">
          <p class="enquiry-message">{{ row.original.message }}</p>
        </template>
        <template #interest-cell="{ row }">
          <UBadge color="neutral" variant="soft">{{ contactInterestLabels[row.original.interest] ?? row.original.interest }}</UBadge>
        </template>
        <template #status-cell="{ row }">
          <UBadge :color="statusColor(row.original.status)" variant="subtle">{{ row.original.status }}</UBadge>
        </template>
        <template #createdAt-cell="{ row }">
          <span class="cell-muted">{{ formatDate(row.original.createdAt) }}</span>
        </template>
        <template #actions-cell="{ row }">
          <div class="enquiry-actions">
            <UButton
              :to="`/clients?enquiry=${encodeURIComponent(row.original.id)}`"
              icon="i-lucide-user-plus"
              color="neutral"
              variant="soft"
              aria-label="Add as client"
            />
            <UButton
              :to="`mailto:${row.original.email}?subject=${encodeURIComponent(`Your ${contactInterestLabels[row.original.interest] ?? row.original.interest} enquiry`)}`"
              icon="i-lucide-send"
              variant="soft"
              aria-label="Reply by email"
            />
          </div>
        </template>
      </UTable>
    </UCard>
  </div>
</template>

<style scoped>
.contacts-page {
  display: grid;
  gap: 1.5rem;
}

.contacts-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 2rem;
  padding: clamp(1.5rem, 3vw, 2.5rem);
  border: 1px solid var(--color-border);
  border-radius: 2rem;
  background:
    radial-gradient(circle at 92% 20%, color-mix(in srgb, var(--sage) 55%, transparent), transparent 25%),
    color-mix(in srgb, var(--white) 86%, var(--cream));
  box-shadow: var(--shadow-sm);
}

.contacts-heading > div { max-width: 49rem; }

.eyebrow {
  margin: 0 0 0.45rem;
  color: var(--caramel);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  color: var(--ink);
  font-family: var(--font-heading);
  font-size: clamp(2.4rem, 5vw, 4.3rem);
  font-weight: 600;
  letter-spacing: -0.05em;
  line-height: 1;
}

.contacts-heading p:last-child {
  max-width: 46rem;
  margin: 1rem 0 0;
  font-size: 0.78rem;
  line-height: 1.7;
}

.enquiry-total {
  display: grid;
  min-width: 6.5rem;
  aspect-ratio: 1;
  place-items: center;
  align-content: center;
  border-radius: 50%;
  color: var(--ink);
  background: var(--terracotta);
  box-shadow: var(--shadow-sm);
}

.enquiry-total strong { font-family: var(--font-heading); font-size: 2rem; line-height: 1; }
.enquiry-total small { margin-top: 0.2rem; font-size: 0.62rem; font-weight: 700; text-transform: uppercase; }

.contact-tools {
  display: flex;
  gap: 0.75rem;
  padding: 0.8rem;
  border: 1px solid var(--color-border);
  border-radius: 1.5rem;
  background: color-mix(in srgb, var(--white) 76%, transparent);
  box-shadow: var(--shadow-sm);
}

.search-input { flex: 1; }
.status-select { width: 12rem; }

.enquiries-table-card { overflow: hidden; border-radius: 1.8rem; box-shadow: var(--shadow-md); }

.enquiry-identity { display: flex; min-width: 0; align-items: center; gap: 0.75rem; }
.enquiry-avatar {
  display: grid;
  width: 2.6rem;
  aspect-ratio: 1;
  flex: none;
  place-items: center;
  border-radius: 0.9rem;
  color: var(--ink);
  background: linear-gradient(145deg, var(--terracotta), var(--sage));
  font-family: var(--font-heading);
  font-size: 1.05rem;
  font-weight: 700;
}
.enquiry-identity div { min-width: 0; display: grid; }
.enquiry-identity strong { overflow: hidden; color: var(--ink); font-size: 0.8rem; text-overflow: ellipsis; white-space: nowrap; }
.enquiry-identity a { overflow: hidden; color: var(--caramel); font-size: 0.66rem; text-overflow: ellipsis; white-space: nowrap; }

.enquiry-message {
  display: -webkit-box;
  max-width: 34rem;
  margin: 0;
  overflow: hidden;
  color: var(--chocolate);
  font-size: 0.72rem;
  line-height: 1.6;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.cell-muted { color: var(--ui-text-muted); font-size: 0.68rem; white-space: nowrap; }

.enquiry-actions { display: flex; align-items: center; justify-content: end; gap: 0.35rem; }

.empty-results {
  display: grid;
  min-height: 20rem;
  place-items: center;
  align-content: center;
  padding: 2rem;
  border: 1px dashed var(--color-border);
  border-radius: 2rem;
  text-align: center;
}

.empty-results span {
  display: grid;
  width: 4.5rem;
  aspect-ratio: 1;
  place-items: center;
  border-radius: 1.4rem;
  color: var(--caramel);
  background: var(--sage);
  font-size: 1.5rem;
}

.empty-results h2 { margin: 1rem 0 0; color: var(--ink); font-family: var(--font-heading); }
.empty-results p { margin: 0.4rem 0 0; font-size: 0.75rem; }

@media (max-width: 42rem) {
  .contacts-heading { align-items: center; }
  .enquiry-total { min-width: 5rem; }
  .contact-tools { flex-wrap: wrap; }
  .search-input { min-width: 100%; }
  .status-select { flex: 1; width: auto; }
}
</style>
