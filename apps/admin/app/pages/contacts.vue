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

    <div v-if="status === 'pending'" class="contact-list">
      <USkeleton v-for="item in 4" :key="item" class="h-52 rounded-3xl" />
    </div>

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

    <section v-else class="contact-list" aria-label="Contact submissions">
      <UCard
        v-for="submission in filteredSubmissions"
        :key="submission.id"
        class="contact-card"
        :ui="{ body: 'p-5 sm:p-6' }"
      >
        <div class="card-topline">
          <div class="contact-identity">
            <span class="contact-avatar">{{ submission.fullName.slice(0, 1).toUpperCase() }}</span>
            <div>
              <h2>{{ submission.fullName }}</h2>
              <a :href="`mailto:${submission.email}`">{{ submission.email }}</a>
            </div>
          </div>
          <div class="card-badges">
            <UBadge color="neutral" variant="soft">{{ contactInterestLabels[submission.interest] ?? submission.interest }}</UBadge>
            <UBadge :color="statusColor(submission.status)" variant="subtle">{{ submission.status }}</UBadge>
          </div>
        </div>

        <p class="contact-message">{{ submission.message }}</p>

        <div class="card-footer">
          <span><UIcon name="i-lucide-clock-3" />{{ formatDate(submission.createdAt) }}</span>
          <div class="card-actions">
            <UButton
              :to="`/clients?enquiry=${encodeURIComponent(submission.id)}`"
              label="Add as client"
              icon="i-lucide-user-plus"
              color="neutral"
              variant="soft"
            />
            <UButton
              :to="`mailto:${submission.email}?subject=${encodeURIComponent(`Your ${contactInterestLabels[submission.interest] ?? submission.interest} enquiry`)}`"
              label="Reply by email"
              icon="i-lucide-send"
              trailing
              variant="soft"
            />
          </div>
        </div>
      </UCard>
    </section>
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

.contacts-heading > div {
  max-width: 49rem;
}

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

.enquiry-total strong {
  font-family: var(--font-heading);
  font-size: 2rem;
  line-height: 1;
}

.enquiry-total small {
  margin-top: 0.2rem;
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
}

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

.contact-list {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.contact-card {
  min-width: 0;
  overflow: hidden;
  border-radius: 1.65rem;
  box-shadow: var(--shadow-sm);
  transition: transform var(--motion-base) var(--ease-out), box-shadow var(--motion-base) var(--ease-out);
  animation: card-in 500ms var(--ease-out) both;
}

.contact-card:hover {
  box-shadow: var(--shadow-hover);
  transform: translateY(-0.25rem);
}

.card-topline,
.card-footer,
.contact-identity,
.card-badges,
.card-actions {
  display: flex;
  align-items: center;
}

.card-topline,
.card-footer {
  justify-content: space-between;
  gap: 1rem;
}

.contact-identity { min-width: 0; gap: 0.75rem; }
.card-badges { flex-wrap: wrap; justify-content: end; gap: 0.45rem; }
.card-actions { flex-wrap: wrap; justify-content: end; gap: 0.5rem; }

.contact-avatar {
  display: grid;
  width: 2.85rem;
  aspect-ratio: 1;
  flex: none;
  place-items: center;
  border-radius: 1rem;
  color: var(--ink);
  background: linear-gradient(145deg, var(--terracotta), var(--sage));
  font-family: var(--font-heading);
  font-size: 1.15rem;
  font-weight: 700;
}

.contact-identity h2 {
  margin: 0;
  overflow: hidden;
  color: var(--ink);
  font-family: var(--font-heading);
  font-size: 1.15rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.contact-identity a {
  display: block;
  margin-top: 0.2rem;
  overflow: hidden;
  color: var(--caramel);
  font-size: 0.66rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.contact-message {
  min-height: 6rem;
  margin: 1.3rem 0;
  padding: 1rem;
  border-radius: 1rem;
  color: var(--chocolate);
  background: color-mix(in srgb, var(--sand) 36%, transparent);
  font-size: 0.74rem;
  line-height: 1.7;
  white-space: pre-wrap;
}

.card-footer {
  padding-top: 0.9rem;
  border-top: 1px solid var(--color-border);
}

.card-footer > span {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--ui-text-muted);
  font-size: 0.62rem;
}

.empty-results {
  display: grid;
  min-height: 22rem;
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

@keyframes card-in {
  from { opacity: 0; transform: translateY(0.8rem); }
}

@media (max-width: 68rem) {
  .contact-list { grid-template-columns: minmax(0, 1fr); }
}

@media (max-width: 42rem) {
  .contacts-heading { align-items: center; }
  .enquiry-total { min-width: 5rem; }
  .contact-tools { flex-wrap: wrap; }
  .search-input { min-width: 100%; }
  .status-select { flex: 1; width: auto; }
  .card-topline { align-items: flex-start; }
  .card-badges { display: none; }
}

@media (max-width: 30rem) {
  .enquiry-total { display: none; }
  .card-footer { align-items: stretch; flex-direction: column; }
  .card-actions { align-items: stretch; flex-direction: column; }
}

@media (prefers-reduced-motion: reduce) {
  .contact-card { animation: none; transition: none; }
}
</style>
