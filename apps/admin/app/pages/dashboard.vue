<script setup lang="ts">
import { contactInterestLabels } from '@tilana/contracts/contact';

definePageMeta({ layout: 'dashboard' });

const { data, status, error, refresh } = await useFetch('/api/admin/dashboard');

const recentColumns = [
  { accessorKey: 'fullName', header: 'Contact' },
  { accessorKey: 'interest', header: 'Interest' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'createdAt', header: 'Submitted' },
  { id: 'actions', header: '' },
];

const recentContacts = computed(() => data.value?.recentContacts ?? []);

const stats = computed(() => [
  {
    label: 'New enquiries',
    value: data.value?.stats.newContacts ?? 0,
    detail: `${data.value?.stats.contacts ?? 0} total enquiries`,
    icon: 'i-lucide-message-square-text',
    tone: 'terracotta',
  },
  {
    label: 'Clients',
    value: data.value?.stats.clients ?? 0,
    detail: 'Active client records',
    icon: 'i-lucide-users',
    tone: 'sage',
  },
  {
    label: 'Paid orders',
    value: data.value?.stats.paidOrders ?? 0,
    detail: 'Completed purchases',
    icon: 'i-lucide-badge-check',
    tone: 'sand',
  },
  {
    label: 'Invoices due',
    value: data.value?.stats.issuedInvoices ?? 0,
    detail: 'Issued and awaiting payment',
    icon: 'i-lucide-receipt-text',
    tone: 'cream',
  },
]);

function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat('en-ZA', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Johannesburg',
  }).format(new Date(value));
}

function statusColor(statusValue: string): 'primary' | 'info' | 'success' | 'neutral' {
  if (statusValue === 'new') return 'primary';
  if (statusValue === 'read') return 'info';
  if (statusValue === 'replied') return 'success';
  return 'neutral';
}

useSeoMeta({ title: 'Dashboard | Tilana Admin', robots: 'noindex, nofollow' });
</script>

<template>
  <div class="dashboard-page">
    <section class="dashboard-intro">
      <div>
        <p class="eyebrow">Welcome back</p>
        <h1>Your business,<br><span>at a glance.</span></h1>
        <p>Keep an eye on new conversations today. Clients, programs and invoices will grow into this workspace next.</p>
      </div>
    </section>

    <div v-if="status === 'pending'" class="stats-grid" aria-label="Loading dashboard">
      <USkeleton v-for="item in 4" :key="item" class="h-40 rounded-3xl" />
    </div>

    <UAlert
      v-else-if="error"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      title="The dashboard could not be loaded"
      description="Check the database and Supabase configuration, then try again."
    >
      <template #actions>
        <UButton label="Try again" color="error" variant="soft" @click="() => refresh()" />
      </template>
    </UAlert>

    <template v-else>
      <section class="stats-grid" aria-label="Business overview">
        <article v-for="item in stats" :key="item.label" class="stat-card" :class="`tone-${item.tone}`">
          <span class="stat-icon"><UIcon :name="item.icon" /></span>
          <div>
            <strong>{{ item.value }}</strong>
            <h2>{{ item.label }}</h2>
            <p>{{ item.detail }}</p>
          </div>
        </article>
      </section>

      <section class="recent-section">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Latest activity</p>
            <h2>Recent enquiries</h2>
          </div>
          <UButton label="View all" to="/contacts" icon="i-lucide-arrow-up-right" trailing variant="soft" />
        </div>

        <UCard class="enquiry-card" :ui="{ body: 'p-0 sm:p-0' }">
          <div v-if="!recentContacts.length" class="empty-state">
            <span><UIcon name="i-lucide-inbox" /></span>
            <h3>No enquiries yet</h3>
            <p>New website contact submissions will appear here.</p>
          </div>
          <UTable
            v-else
            :data="recentContacts"
            :columns="recentColumns"
            class="enquiry-table"
          >
            <template #fullName-cell="{ row }">
              <div class="table-contact">
                <UAvatar
                  :text="row.original.fullName.slice(0, 1).toUpperCase()"
                  size="md"
                  class="table-avatar"
                />
                <div>
                  <strong>{{ row.original.fullName }}</strong>
                  <a :href="`mailto:${row.original.email}`">{{ row.original.email }}</a>
                </div>
              </div>
            </template>

            <template #interest-cell="{ row }">
              <UBadge color="neutral" variant="soft">
                {{ contactInterestLabels[row.original.interest] ?? row.original.interest }}
              </UBadge>
            </template>

            <template #status-cell="{ row }">
              <UBadge :color="statusColor(row.original.status)" variant="subtle" class="capitalize">
                {{ row.original.status }}
              </UBadge>
            </template>

            <template #createdAt-cell="{ row }">
              <span class="table-date">{{ formatDate(row.original.createdAt) }}</span>
            </template>

            <template #actions-cell>
              <UButton
                to="/contacts"
                icon="i-lucide-arrow-right"
                color="neutral"
                variant="ghost"
                aria-label="View enquiry"
              />
            </template>
          </UTable>
        </UCard>
      </section>
    </template>
  </div>
</template>

<style scoped>
.dashboard-page {
  display: grid;
  gap: clamp(1.5rem, 3vw, 2.5rem);
}

.dashboard-intro {
  position: relative;
  isolation: isolate;
  display: flex;
  min-height: 15rem;
  align-items: center;
  justify-content: space-between;
  overflow: hidden;
  padding: clamp(1.5rem, 4vw, 3rem);
  border: 1px solid var(--color-border);
  border-radius: 2rem;
  background:
    linear-gradient(120deg, color-mix(in srgb, var(--white) 86%, transparent), color-mix(in srgb, var(--sand) 78%, transparent));
  box-shadow: var(--shadow-sm);
  animation: dashboard-rise 600ms var(--ease-out) both;
}

.dashboard-intro > div:first-child {
  position: relative;
  z-index: 1;
  max-width: 45rem;
}

.eyebrow {
  margin: 0 0 0.65rem;
  color: var(--caramel);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

h1,
.section-heading h2 {
  margin: 0;
  color: var(--ink);
  font-family: var(--font-heading);
  font-weight: 600;
  letter-spacing: -0.045em;
}

h1 {
  font-size: clamp(2.6rem, 5vw, 4.6rem);
  line-height: 0.95;
}

h1 span {
  color: var(--caramel);
  font-family: var(--font-script);
  font-weight: 400;
}

.dashboard-intro p:last-child {
  max-width: 40rem;
  margin: 1.15rem 0 0;
  font-size: 0.86rem;
  line-height: 1.7;
}

.stats-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.stat-card {
  display: flex;
  min-height: 10rem;
  align-items: flex-start;
  gap: 1rem;
  padding: 1.25rem;
  border: 1px solid var(--color-border);
  border-radius: 1.65rem;
  box-shadow: var(--shadow-sm);
  transition: transform var(--motion-base) var(--ease-out), box-shadow var(--motion-base) var(--ease-out);
  animation: dashboard-rise 600ms var(--ease-out) both;
}

.stat-card:hover {
  box-shadow: var(--shadow-hover);
  transform: translateY(-0.3rem);
}

.tone-terracotta { background: color-mix(in srgb, var(--terracotta) 72%, var(--white)); }
.tone-sage { background: color-mix(in srgb, var(--sage) 72%, var(--white)); }
.tone-sand { background: color-mix(in srgb, var(--sand) 78%, var(--white)); }
.tone-cream { background: color-mix(in srgb, var(--cream) 65%, var(--white)); }

.stat-icon {
  display: grid;
  width: 2.65rem;
  aspect-ratio: 1;
  flex: none;
  place-items: center;
  border-radius: 0.95rem;
  color: var(--ink);
  background: color-mix(in srgb, var(--white) 66%, transparent);
  font-size: 1.05rem;
}

.stat-card strong {
  display: block;
  color: var(--ink);
  font-family: var(--font-heading);
  font-size: 2.5rem;
  line-height: 1;
}

.stat-card h2 {
  margin: 0.4rem 0 0;
  color: var(--ink);
  font-size: 0.78rem;
}

.stat-card p {
  margin: 0.35rem 0 0;
  font-size: 0.65rem;
  line-height: 1.45;
}

.recent-section {
  display: grid;
  gap: 1rem;
}

.section-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
}

.section-heading h2 {
  font-size: clamp(1.8rem, 3vw, 2.5rem);
}

.enquiry-card {
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 1.65rem;
  box-shadow: var(--shadow-sm);
}

.enquiry-table {
  min-width: 46rem;
}

.enquiry-table :deep(thead) {
  background: color-mix(in srgb, var(--sand) 44%, var(--white));
}

.enquiry-table :deep(th) {
  padding-block: 0.9rem;
  color: var(--caramel);
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.enquiry-table :deep(td) {
  padding-block: 0.9rem;
  vertical-align: middle;
}

.enquiry-table :deep(tbody tr) {
  transition: background var(--motion-fast) ease;
}

.enquiry-table :deep(tbody tr:hover) {
  background: color-mix(in srgb, var(--terracotta) 10%, transparent);
}

.table-contact {
  display: flex;
  min-width: 12rem;
  align-items: center;
  gap: 0.75rem;
}

.table-avatar {
  flex: none;
  color: var(--ink);
  background: var(--sage);
  font-family: var(--font-heading);
  font-weight: 700;
}

.table-contact div {
  display: grid;
  min-width: 0;
}

.table-contact strong,
.table-contact a {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.table-contact strong {
  color: var(--ink);
  font-size: 0.78rem;
}

.table-contact a,
.table-date {
  color: var(--ui-text-muted);
  font-size: 0.67rem;
}

.table-contact a {
  text-decoration: none;
}

.table-contact a:hover {
  color: var(--caramel);
}

.empty-state {
  display: grid;
  min-height: 16rem;
  place-items: center;
  align-content: center;
  padding: 2rem;
  text-align: center;
}

.empty-state span {
  display: grid;
  width: 4rem;
  aspect-ratio: 1;
  place-items: center;
  border-radius: 1.4rem;
  color: var(--caramel);
  background: var(--sage);
  font-size: 1.4rem;
}

.empty-state h3 { margin: 1rem 0 0; color: var(--ink); }
.empty-state p { margin: 0.4rem 0 0; font-size: 0.75rem; }

@keyframes dashboard-rise {
  from { opacity: 0; transform: translateY(1rem); }
}

@media (max-width: 75rem) {
  .stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 58rem) {
  .enquiry-card { overflow-x: auto; }
}

@media (max-width: 34rem) {
  .stats-grid { grid-template-columns: minmax(0, 1fr); }
  .dashboard-intro { min-height: 13rem; }
  .dashboard-intro p:last-child { font-size: 0.75rem; }
  .section-heading { align-items: center; }
}

@media (prefers-reduced-motion: reduce) {
  .dashboard-intro, .stat-card { animation: none; }
  .stat-card, .enquiry-table :deep(tbody tr) { transition: none; }
}
</style>
