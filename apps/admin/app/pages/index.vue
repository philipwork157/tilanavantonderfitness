<script setup lang="ts">
useSeoMeta({ title: 'Overview | Tilana Admin', robots: 'noindex, nofollow' });

const { data } = await useFetch('/api/overview');

const inquiryCount = computed(() => data.value?.inquiries.active ?? 0);
const newCount = computed(() => data.value?.inquiries.new ?? 0);
const subscriberCount = computed(() => data.value?.newsletter.subscribers ?? 0);
const inquiryHint = computed(() => {
  if (!inquiryCount.value) return 'Nothing waiting';
  return newCount.value ? `${newCount.value} new` : 'All read';
});
</script>

<template>
  <AdminPage id="overview" title="Overview">
    <section class="stat-grid" aria-label="Summary">
      <AdminStatTile
        to="/inquiries"
        icon="i-lucide-inbox"
        :label="inquiryCount === 1 ? 'Inquiry' : 'Inquiries'"
        :value="inquiryCount"
        :hint="inquiryHint"
      />
      <AdminStatTile
        to="/newsletter"
        icon="i-lucide-mail"
        :label="subscriberCount === 1 ? 'Subscriber' : 'Subscribers'"
        :value="subscriberCount"
        hint="Confirmed newsletter readers"
      />
    </section>
  </AdminPage>
</template>

<style scoped>
.stat-grid {
  display: grid;
  gap: var(--space-4);
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 15rem), 1fr));
}
</style>
