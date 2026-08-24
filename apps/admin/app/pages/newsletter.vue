<script setup lang="ts">
definePageMeta({ layout: 'dashboard' });

const search = ref('');
const statusFilter = ref('all');
const { data, status, error, refresh } = await useFetch('/api/admin/newsletter', { lazy: true });

const statusOptions = [
  { label: 'All statuses', value: 'all' },
  { label: 'Subscribed', value: 'subscribed' },
  { label: 'Pending', value: 'pending' },
  { label: 'Unsubscribed', value: 'unsubscribed' },
  { label: 'Bounced', value: 'bounced' },
  { label: 'Complained', value: 'complained' },
];

const statusLabels: Record<string, string> = {
  subscribed: 'Subscribed',
  pending: 'Pending',
  unsubscribed: 'Unsubscribed',
  bounced: 'Bounced',
  complained: 'Complained',
};

const columns = [
  { accessorKey: 'email', header: 'Subscriber' },
  { accessorKey: 'source', header: 'Source' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'consentedAt', header: 'Consented' },
  { accessorKey: 'confirmedAt', header: 'Confirmed' },
];

const subscribers = computed(() => data.value?.subscribers ?? []);

const counts = computed(() => {
  const list = subscribers.value;
  return {
    total: list.length,
    subscribed: list.filter((item) => item.status === 'subscribed').length,
    pending: list.filter((item) => item.status === 'pending').length,
  };
});

const filteredSubscribers = computed(() => {
  const query = search.value.trim().toLowerCase();
  return subscribers.value.filter((subscriber) => {
    const matchesStatus = statusFilter.value === 'all' || subscriber.status === statusFilter.value;
    const matchesSearch =
      !query ||
      subscriber.email.toLowerCase().includes(query) ||
      subscriber.source.toLowerCase().includes(query);
    return matchesStatus && matchesSearch;
  });
});

function formatDate(value: string | Date | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'medium',
    timeZone: 'Africa/Johannesburg',
  }).format(new Date(value));
}

function statusColor(value: string): 'success' | 'warning' | 'neutral' | 'error' {
  if (value === 'subscribed') return 'success';
  if (value === 'pending') return 'warning';
  if (value === 'bounced' || value === 'complained') return 'error';
  return 'neutral';
}

function exportSubscribedCsv() {
  const rows = subscribers.value.filter((item) => item.status === 'subscribed');
  const header = 'email,status,source,confirmed_at\n';
  const body = rows
    .map((item) => [item.email, item.status, item.source, item.confirmedAt ?? ''].join(','))
    .join('\n');
  const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'newsletter-subscribers.csv';
  link.click();
  URL.revokeObjectURL(url);
}

useSeoMeta({ title: 'Newsletter | Tilana Admin', robots: 'noindex, nofollow' });
</script>

<template>
  <div class="newsletter-page">
    <section class="newsletter-heading">
      <div>
        <p class="eyebrow">Audience</p>
        <h1>Newsletter signups</h1>
        <p>Everyone who asked to hear from you through the website. Double opt-in keeps this list clean — only confirmed people count as subscribed.</p>
      </div>
      <span class="subscriber-total">
        <strong>{{ counts.subscribed }}</strong>
        <small>Subscribed</small>
      </span>
    </section>

    <section class="newsletter-stats" aria-label="Newsletter overview">
      <article>
        <span><UIcon name="i-lucide-mail" /></span>
        <div><strong>{{ counts.total }}</strong><p>Total signups</p></div>
      </article>
      <article>
        <span><UIcon name="i-lucide-mail-check" /></span>
        <div><strong>{{ counts.subscribed }}</strong><p>Confirmed subscribers</p></div>
      </article>
      <article>
        <span><UIcon name="i-lucide-hourglass" /></span>
        <div><strong>{{ counts.pending }}</strong><p>Awaiting confirmation</p></div>
      </article>
    </section>

    <section class="newsletter-tools" aria-label="Filter subscribers">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="Search email or source"
        size="lg"
        class="search-input"
      />
      <USelect v-model="statusFilter" :items="statusOptions" value-key="value" size="lg" class="status-select" />
      <UButton
        icon="i-lucide-download"
        label="Export subscribed"
        color="neutral"
        variant="soft"
        size="lg"
        :disabled="!counts.subscribed"
        @click="exportSubscribedCsv"
      />
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
      title="Subscribers could not be loaded"
      description="Please check the database connection and try again."
    />

    <div v-else-if="!filteredSubscribers.length" class="empty-results">
      <span><UIcon name="i-lucide-mail-x" /></span>
      <h2>{{ counts.total ? 'No matching subscribers' : 'No signups yet' }}</h2>
      <p>{{ counts.total ? 'Change the search or status filter to see more.' : 'Signups from the website footer will appear here.' }}</p>
    </div>

    <UCard v-else class="subscriber-table-card" :ui="{ body: 'p-0 sm:p-0' }">
      <UTable :data="filteredSubscribers" :columns="columns" class="subscriber-table">
        <template #email-cell="{ row }">
          <div class="subscriber-identity">
            <span class="subscriber-avatar"><UIcon name="i-lucide-mail" /></span>
            <a :href="`mailto:${row.original.email}`">{{ row.original.email }}</a>
          </div>
        </template>
        <template #source-cell="{ row }">
          <span class="cell-muted">{{ row.original.source }}</span>
        </template>
        <template #status-cell="{ row }">
          <UBadge :color="statusColor(row.original.status)" variant="subtle">
            {{ statusLabels[row.original.status] ?? row.original.status }}
          </UBadge>
        </template>
        <template #consentedAt-cell="{ row }">
          <span class="cell-muted">{{ formatDate(row.original.consentedAt) }}</span>
        </template>
        <template #confirmedAt-cell="{ row }">
          <span class="cell-muted">{{ formatDate(row.original.confirmedAt) }}</span>
        </template>
      </UTable>
    </UCard>
  </div>
</template>

<style scoped>
.newsletter-page { display: grid; gap: 1.5rem; }

.newsletter-heading {
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

.newsletter-heading > div { max-width: 49rem; }

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

.newsletter-heading p:last-child {
  max-width: 46rem;
  margin: 1rem 0 0;
  font-size: 0.78rem;
  line-height: 1.7;
}

.subscriber-total {
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

.subscriber-total strong { font-family: var(--font-heading); font-size: 2rem; line-height: 1; }
.subscriber-total small { margin-top: 0.2rem; font-size: 0.58rem; font-weight: 700; text-transform: uppercase; }

.newsletter-stats { display: grid; gap: 1rem; grid-template-columns: repeat(3, minmax(0, 1fr)); }
.newsletter-stats article {
  display: flex;
  min-height: 6.5rem;
  align-items: center;
  gap: 1rem;
  padding: 1.2rem;
  border: 1px solid var(--color-border);
  border-radius: 1.6rem;
  background: color-mix(in srgb, var(--white) 80%, var(--cream));
  box-shadow: var(--shadow-sm);
}
.newsletter-stats article:nth-child(2) { background: color-mix(in srgb, var(--sage) 76%, var(--cream)); }
.newsletter-stats article:nth-child(3) { background: color-mix(in srgb, var(--terracotta) 46%, var(--cream)); }
.newsletter-stats article > span {
  display: grid;
  width: 2.8rem;
  aspect-ratio: 1;
  flex: none;
  place-items: center;
  border-radius: 0.9rem;
  color: var(--ink);
  background: color-mix(in srgb, var(--white) 76%, transparent);
  font-size: 1.1rem;
}
.newsletter-stats strong { color: var(--ink); font-family: var(--font-heading); font-size: 1.8rem; }
.newsletter-stats p { margin: 0.15rem 0 0; font-size: 0.69rem; }

.newsletter-tools {
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

.subscriber-table-card { overflow: hidden; border-radius: 1.8rem; box-shadow: var(--shadow-md); }

.subscriber-identity { display: flex; min-width: 0; align-items: center; gap: 0.7rem; }
.subscriber-avatar {
  display: grid;
  width: 2.3rem;
  aspect-ratio: 1;
  flex: none;
  place-items: center;
  border-radius: 0.75rem;
  color: var(--ink);
  background: linear-gradient(145deg, var(--terracotta), var(--sage));
  font-size: 0.95rem;
}
.subscriber-identity a {
  overflow: hidden;
  color: var(--ink);
  font-size: 0.78rem;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cell-muted { color: var(--ui-text-muted); font-size: 0.72rem; }

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

@media (max-width: 68rem) {
  .newsletter-stats { grid-template-columns: 1fr; }
}

@media (max-width: 42rem) {
  .newsletter-heading { align-items: center; }
  .subscriber-total { min-width: 5rem; }
  .newsletter-tools { flex-wrap: wrap; }
  .search-input { min-width: 100%; }
  .status-select { flex: 1; width: auto; }
}
</style>
