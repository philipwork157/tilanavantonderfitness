<script setup lang="ts">
definePageMeta({ layout: 'dashboard' });

const { data, status, error, refresh } = await useFetch('/api/admin/dashboard', { lazy: true });

const stats = computed(() => [
  {
    label: 'New enquiries',
    value: data.value?.stats.newContacts ?? 0,
    detail: 'Waiting for your attention',
    icon: 'i-lucide-message-square-text',
    tone: 'terracotta',
  },
  {
    label: 'Clients',
    value: data.value?.stats.clients ?? 0,
    detail: 'Total client records',
    icon: 'i-lucide-users',
    tone: 'sage',
  },
  {
    label: 'Newsletter subscribers',
    value: data.value?.stats.subscribers ?? 0,
    detail: 'Active subscribers',
    icon: 'i-lucide-mail-check',
    tone: 'sand',
  },
]);

const salesSeries = computed(() => data.value?.sales.series ?? []);
const salesMode = computed(() => data.value?.sales.environment === 'live' ? 'Live data' : 'Test data');

function formatMoney(cents: number) {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

useSeoMeta({ title: 'Dashboard | Tilana Admin', robots: 'noindex, nofollow' });
</script>

<template>
  <div class="dashboard-page">
    <template v-if="status === 'pending'">
      <div class="stats-grid" aria-label="Loading dashboard">
        <USkeleton v-for="item in 3" :key="item" class="h-36 rounded-3xl" />
      </div>
      <USkeleton class="chart-skeleton rounded-3xl" />
    </template>

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

      <section class="sales-section" aria-labelledby="sales-heading">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Paystack performance</p>
            <h1 id="sales-heading">Recent sales</h1>
          </div>
          <UBadge color="neutral" variant="soft" size="lg">
            {{ salesMode }} · Last {{ data?.sales.periodDays ?? 30 }} days
          </UBadge>
        </div>

        <UCard class="sales-card" :ui="{ body: 'p-5 sm:p-7' }">
          <div class="sales-summary">
            <div>
              <span>Net sales</span>
              <strong>{{ formatMoney(data?.sales.totalCents ?? 0) }}</strong>
            </div>
            <div>
              <span>Successful sales</span>
              <strong>{{ data?.sales.saleCount ?? 0 }}</strong>
            </div>
          </div>

          <ClientOnly>
            <DashboardSalesChart :series="salesSeries" />
            <template #fallback>
              <USkeleton class="chart-fallback rounded-2xl" />
            </template>
          </ClientOnly>
        </UCard>
      </section>
    </template>
  </div>
</template>

<style scoped>
.dashboard-page {
  display: grid;
  gap: clamp(1.25rem, 2.5vw, 2rem);
}

.stats-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.stat-card {
  display: flex;
  min-height: 8.75rem;
  align-items: flex-start;
  gap: 1rem;
  padding: 1.25rem;
  border: 1px solid var(--color-border);
  border-radius: 1.65rem;
  box-shadow: var(--shadow-sm);
  transition: transform var(--motion-base) var(--ease-out), box-shadow var(--motion-base) var(--ease-out);
  animation: dashboard-rise 500ms var(--ease-out) both;
}

.stat-card:hover {
  box-shadow: var(--shadow-hover);
  transform: translateY(-0.25rem);
}

.tone-terracotta { background: color-mix(in srgb, var(--terracotta) 72%, var(--white)); }
.tone-sage { background: color-mix(in srgb, var(--sage) 72%, var(--white)); }
.tone-sand { background: color-mix(in srgb, var(--sand) 78%, var(--white)); }

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

.sales-section {
  display: grid;
  gap: 1rem;
}

.section-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
}

.eyebrow {
  margin: 0 0 0.4rem;
  color: var(--caramel);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

.section-heading h1 {
  margin: 0;
  color: var(--ink);
  font-family: var(--font-heading);
  font-size: clamp(1.8rem, 3vw, 2.5rem);
  font-weight: 600;
  letter-spacing: -0.045em;
}

.sales-card {
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 1.65rem;
  box-shadow: var(--shadow-sm);
}

.sales-summary {
  display: flex;
  flex-wrap: wrap;
  gap: clamp(2rem, 7vw, 5rem);
  margin-bottom: 1.75rem;
}

.sales-summary div {
  display: grid;
  gap: 0.3rem;
}

.sales-summary span {
  color: var(--ui-text-muted);
  font-size: 0.7rem;
}

.sales-summary strong {
  color: var(--ink);
  font-family: var(--font-heading);
  font-size: clamp(1.65rem, 3vw, 2.25rem);
  line-height: 1;
}

.chart-skeleton,
.chart-fallback {
  min-height: 25rem;
}

@keyframes dashboard-rise {
  from { opacity: 0; transform: translateY(0.75rem); }
}

@media (max-width: 54rem) {
  .stats-grid { grid-template-columns: minmax(0, 1fr); }
  .stat-card { min-height: 7.75rem; }
}

@media (max-width: 34rem) {
  .section-heading { align-items: flex-start; flex-direction: column; }
}

@media (prefers-reduced-motion: reduce) {
  .stat-card { animation: none; transition: none; }
}
</style>
