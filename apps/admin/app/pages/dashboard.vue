<script setup lang="ts">
import type { AdminDashboardPeriod } from '@tilana/contracts/dashboard';

definePageMeta({ layout: 'dashboard' });

const selectedPeriod = ref<AdminDashboardPeriod>(30);
const periodOptions: Array<{ label: string; value: AdminDashboardPeriod }> = [
  { label: 'Last 7 days', value: 7 },
  { label: 'Last month', value: 30 },
  { label: 'Last 2 months', value: 60 },
  { label: 'Last 3 months', value: 90 },
  { label: 'Last 4 months', value: 120 },
  { label: 'Last 5 months', value: 150 },
  { label: 'Last 6 months', value: 180 },
];

const { data, status, error, refresh } = await useFetch('/api/admin/dashboard', {
  lazy: true,
  query: computed(() => ({ periodDays: selectedPeriod.value })),
});

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
const paymentAlerts = computed(() => [
  {
    label: 'Failed checkouts',
    value: data.value?.alerts.failedPayments ?? 0,
    detail: 'Failed, abandoned or reversed in this period',
    icon: 'i-lucide-circle-x',
  },
  {
    label: 'Pending too long',
    value: data.value?.alerts.stalePayments ?? 0,
    detail: 'Pending for more than 30 minutes',
    icon: 'i-lucide-clock-alert',
  },
  {
    label: 'Refunds to review',
    value: data.value?.alerts.refundsNeedingAttention ?? 0,
    detail: 'Unresolved Paystack refund responses',
    icon: 'i-lucide-rotate-ccw',
  },
]);
const totalPaymentAlerts = computed(() => paymentAlerts.value.reduce((total, item) => total + item.value, 0));

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
    <template v-if="status === 'pending' && !data">
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
          <div class="sales-filters">
            <UBadge color="neutral" variant="soft" size="lg">
              {{ salesMode }}
            </UBadge>
            <USelect
              v-model="selectedPeriod"
              :items="periodOptions"
              value-key="value"
              icon="i-lucide-calendar-range"
              size="lg"
              class="period-select"
              aria-label="Sales reporting period"
              :disabled="status === 'pending'"
            />
          </div>
        </div>

        <UCard class="sales-card" :class="{ 'is-refreshing': status === 'pending' }" :ui="{ body: 'p-5 sm:p-7' }">
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
            <DashboardSalesChart :series="salesSeries" :period-days="data?.sales.periodDays ?? 30" />
            <template #fallback>
              <USkeleton class="chart-fallback rounded-2xl" />
            </template>
          </ClientOnly>
        </UCard>
      </section>

      <section class="alerts-section" aria-labelledby="alerts-heading">
        <UCard class="alerts-card" :class="{ 'has-alerts': totalPaymentAlerts > 0 }" :ui="{ body: 'p-5 sm:p-6' }">
          <div class="alerts-heading">
            <span class="alerts-icon" aria-hidden="true">
              <UIcon :name="totalPaymentAlerts ? 'i-lucide-bell-ring' : 'i-lucide-circle-check'" />
            </span>
            <div>
              <p class="eyebrow">Payment monitoring</p>
              <h2 id="alerts-heading">
                {{ totalPaymentAlerts ? `${totalPaymentAlerts} items need attention` : 'Everything looks clear' }}
              </h2>
            </div>
            <UButton
              v-if="totalPaymentAlerts"
              label="Review clients"
              to="/clients"
              icon="i-lucide-arrow-up-right"
              trailing
              color="neutral"
              variant="soft"
              class="review-button"
            />
          </div>

          <div class="alerts-grid">
            <article v-for="item in paymentAlerts" :key="item.label" class="alert-item">
              <span><UIcon :name="item.icon" /></span>
              <div>
                <strong>{{ item.value }}</strong>
                <h3>{{ item.label }}</h3>
                <p>{{ item.detail }}</p>
              </div>
            </article>
          </div>
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

.sales-filters {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.period-select {
  width: 11rem;
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
  transition: opacity var(--motion-fast) ease;
}

.sales-card.is-refreshing {
  opacity: 0.58;
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

.alerts-card {
  border: 1px solid color-mix(in srgb, var(--sage) 68%, var(--color-border));
  border-radius: 1.65rem;
  background: color-mix(in srgb, var(--sage) 20%, var(--white));
  box-shadow: var(--shadow-sm);
}

.alerts-card.has-alerts {
  border-color: color-mix(in srgb, var(--terracotta) 70%, var(--color-border));
  background: color-mix(in srgb, var(--terracotta) 13%, var(--white));
}

.alerts-heading {
  display: grid;
  align-items: center;
  gap: 0.9rem;
  grid-template-columns: auto minmax(0, 1fr) auto;
}

.alerts-heading .eyebrow {
  margin-bottom: 0.25rem;
}

.alerts-heading h2 {
  margin: 0;
  color: var(--ink);
  font-family: var(--font-heading);
  font-size: clamp(1.35rem, 2.5vw, 1.8rem);
  font-weight: 600;
  letter-spacing: -0.035em;
}

.alerts-icon {
  display: grid;
  width: 3rem;
  aspect-ratio: 1;
  place-items: center;
  border-radius: 1rem;
  color: var(--ink);
  background: color-mix(in srgb, var(--white) 70%, transparent);
  font-size: 1.2rem;
}

.alerts-grid {
  display: grid;
  gap: 0.75rem;
  margin-top: 1.25rem;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.alert-item {
  display: flex;
  align-items: flex-start;
  gap: 0.8rem;
  padding: 1rem;
  border: 1px solid color-mix(in srgb, var(--color-border) 76%, transparent);
  border-radius: 1.15rem;
  background: color-mix(in srgb, var(--white) 62%, transparent);
}

.alert-item > span {
  margin-top: 0.15rem;
  color: var(--caramel);
  font-size: 1rem;
}

.alert-item strong {
  color: var(--ink);
  font-family: var(--font-heading);
  font-size: 1.55rem;
  line-height: 1;
}

.alert-item h3 {
  margin: 0.25rem 0 0;
  color: var(--ink);
  font-size: 0.76rem;
}

.alert-item p {
  margin: 0.25rem 0 0;
  color: var(--ui-text-muted);
  font-size: 0.64rem;
  line-height: 1.45;
}

@keyframes dashboard-rise {
  from { opacity: 0; transform: translateY(0.75rem); }
}

@media (max-width: 54rem) {
  .stats-grid { grid-template-columns: minmax(0, 1fr); }
  .stat-card { min-height: 7.75rem; }
  .alerts-grid { grid-template-columns: minmax(0, 1fr); }
}

@media (max-width: 34rem) {
  .section-heading { align-items: flex-start; flex-direction: column; }
  .sales-filters { width: 100%; align-items: stretch; flex-direction: column; }
  .period-select { width: 100%; }
  .alerts-heading { grid-template-columns: auto minmax(0, 1fr); }
  .review-button { grid-column: 1 / -1; justify-self: stretch; }
}

@media (prefers-reduced-motion: reduce) {
  .stat-card { animation: none; transition: none; }
}
</style>
