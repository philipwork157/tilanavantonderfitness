<script setup lang="ts">
definePageMeta({ layout: 'dashboard' });

interface Campaign {
  id: string;
  subject: string;
  previewText: string | null;
  blogTitle: string;
  introduction: string;
  blogUrl: string;
  status: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  testSentCount: number;
  lastTestSentAt: string | Date | null;
  createdAt: string | Date;
  sentAt: string | Date | null;
}

const search = ref('');
const statusFilter = ref('all');
const { data, status, error, refresh } = await useFetch('/api/admin/newsletter', { lazy: true });
const {
  data: campaignData,
  status: campaignStatus,
  error: campaignLoadError,
  refresh: refreshCampaigns,
} = await useFetch<{ campaigns: Campaign[] }>('/api/admin/newsletter/campaigns', { lazy: true });
const campaignForm = reactive({ subject: '', previewText: '', blogTitle: '', introduction: '', blogUrl: '' });
const campaignId = ref<string | null>(null);
const campaignNotice = ref('');
const campaignError = ref('');
const savingCampaign = ref(false);
const testingCampaign = ref(false);
const sendingCampaign = ref(false);
const showSendConfirmation = ref(false);
const campaigns = computed(() => campaignData.value?.campaigns ?? []);

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

function campaignStatusColor(value: string): 'success' | 'warning' | 'neutral' | 'error' {
  if (value === 'sent') return 'success';
  if (value === 'sending' || value === 'draft') return 'warning';
  if (value === 'failed' || value === 'partially_failed') return 'error';
  return 'neutral';
}

function readableError(value: unknown, fallback: string) {
  if (value && typeof value === 'object') {
    const error = value as { data?: { statusMessage?: string }; statusMessage?: string; message?: string };
    return error.data?.statusMessage || error.statusMessage || error.message || fallback;
  }
  return fallback;
}

function campaignPayload() {
  return { ...campaignForm };
}

async function saveCampaign() {
  campaignError.value = '';
  campaignNotice.value = '';
  savingCampaign.value = true;
  try {
    const response = campaignId.value
      ? await $fetch<{ campaign: Campaign }>(`/api/admin/newsletter/campaigns/${campaignId.value}`, { method: 'PATCH', body: campaignPayload() })
      : await $fetch<{ campaign: Campaign }>('/api/admin/newsletter/campaigns', { method: 'POST', body: campaignPayload() });
    campaignId.value = response.campaign.id;
    campaignNotice.value = 'Draft saved. You can now send a test or review the final delivery.';
    await refreshCampaigns();
    return response.campaign.id;
  } catch (value) {
    campaignError.value = readableError(value, 'The campaign could not be saved.');
    return null;
  } finally {
    savingCampaign.value = false;
  }
}

async function sendTest() {
  testingCampaign.value = true;
  campaignNotice.value = '';
  campaignError.value = '';
  try {
    const id = await saveCampaign();
    if (!id) return;
    await $fetch(`/api/admin/newsletter/campaigns/${id}/test`, { method: 'POST' });
    campaignNotice.value = 'Test email sent to Tilana. Check the inbox before sending to subscribers.';
  } catch (value) {
    campaignError.value = readableError(value, 'The test email could not be sent.');
  } finally {
    testingCampaign.value = false;
  }
}

async function sendCampaign() {
  showSendConfirmation.value = false;
  sendingCampaign.value = true;
  campaignNotice.value = '';
  campaignError.value = '';
  try {
    const id = await saveCampaign();
    if (!id) return;
    const result = await $fetch<{ mode: 'live' | 'preview'; sentCount: number; failedCount: number }>(`/api/admin/newsletter/campaigns/${id}/send`, { method: 'POST' });
    campaignNotice.value = result.mode === 'preview'
      ? 'Development preview sent only to Tilana. No subscriber delivery was recorded.'
      : `Campaign complete: ${result.sentCount} sent${result.failedCount ? `, ${result.failedCount} failed` : ''}.`;
    await refreshCampaigns();
  } catch (value) {
    campaignError.value = readableError(value, 'The campaign could not be sent.');
  } finally {
    sendingCampaign.value = false;
  }
}

function newCampaign() {
  campaignId.value = null;
  Object.assign(campaignForm, { subject: '', previewText: '', blogTitle: '', introduction: '', blogUrl: '' });
  campaignNotice.value = '';
  campaignError.value = '';
}

function populateCampaignForm(campaign: Campaign) {
  Object.assign(campaignForm, {
    subject: campaign.subject,
    previewText: campaign.previewText ?? '',
    blogTitle: campaign.blogTitle,
    introduction: campaign.introduction,
    blogUrl: campaign.blogUrl,
  });
  campaignError.value = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function editCampaign(campaign: Campaign) {
  if (campaign.status !== 'draft') return;
  campaignId.value = campaign.id;
  populateCampaignForm(campaign);
  campaignNotice.value = 'Draft loaded. Make your changes, then save or send a test.';
}

function duplicateCampaign(campaign: Campaign) {
  campaignId.value = null;
  populateCampaignForm(campaign);
  campaignNotice.value = 'Campaign copied into a new draft. Review it before sending again.';
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

    <section class="campaign-workspace">
      <div class="campaign-editor">
        <div class="section-title">
          <div><p class="eyebrow">New email</p><h2>Share a new blog</h2></div>
          <UButton v-if="campaignId" label="New campaign" icon="i-lucide-plus" color="neutral" variant="soft" @click="newCampaign" />
        </div>
        <p class="section-copy">Paste the published blog link, add a warm introduction, then send yourself a test before sharing it with confirmed subscribers.</p>
        <UAlert v-if="campaignNotice" color="success" variant="soft" icon="i-lucide-circle-check" :title="campaignNotice" />
        <UAlert v-if="campaignError" color="error" variant="soft" icon="i-lucide-circle-alert" :title="campaignError" />
        <div class="campaign-fields">
          <UFormField label="Email subject" required><UInput v-model="campaignForm.subject" placeholder="A new note from Tilana" class="w-full" /></UFormField>
          <UFormField label="Preview text" help="The short line shown beside the subject in an inbox."><UInput v-model="campaignForm.previewText" placeholder="A thoughtful note for your week" class="w-full" /></UFormField>
          <UFormField label="Blog title" required><UInput v-model="campaignForm.blogTitle" placeholder="Welcome — a little about me" class="w-full" /></UFormField>
          <UFormField label="Published blog link" required><UInput v-model="campaignForm.blogUrl" type="url" placeholder="https://tilanavantonder.co.za/blog/..." class="w-full" /></UFormField>
          <UFormField label="Personal introduction" required class="full-field"><UTextarea v-model="campaignForm.introduction" :rows="5" placeholder="Write a short, personal reason to read this post…" class="w-full" /></UFormField>
        </div>
        <div class="campaign-actions">
          <UButton label="Save draft" icon="i-lucide-save" color="neutral" variant="soft" :loading="savingCampaign" @click="saveCampaign" />
          <UButton label="Send test to Tilana" icon="i-lucide-send" color="neutral" variant="outline" :loading="testingCampaign" @click="sendTest" />
          <UButton label="Send to subscribers" icon="i-lucide-mail-check" :loading="sendingCampaign" @click="showSendConfirmation = true" />
        </div>
      </div>

      <aside class="campaign-preview" aria-label="Newsletter preview">
        <p class="eyebrow">Live preview</p>
        <div class="preview-card">
          <div class="preview-head"><small>A thoughtful note from Tilana</small><h3>{{ campaignForm.blogTitle || 'Your blog title' }}</h3></div>
          <div class="preview-body"><p>{{ campaignForm.introduction || 'Your personal introduction will appear here, followed by a clear link to the new blog.' }}</p><span>Read the blog →</span><small>You are receiving this because you confirmed your subscription.</small></div>
        </div>
      </aside>
    </section>

    <USkeleton v-if="campaignStatus === 'pending'" class="h-48 rounded-3xl" />

    <UAlert
      v-else-if="campaignLoadError"
      color="error"
      variant="soft"
      icon="i-lucide-database-zap"
      title="Campaign history could not be loaded"
      description="Apply the latest database migration, then refresh this page. Your saved campaigns have not been deleted."
    />

    <section v-else class="campaign-history">
      <div class="section-title"><div><p class="eyebrow">Campaign history</p><h2>Previous sends</h2></div></div>
      <div v-if="campaigns.length" class="history-grid">
        <article v-for="campaign in campaigns" :key="campaign.id">
          <div><h3>{{ campaign.subject }}</h3><p>{{ campaign.blogTitle }}</p></div>
          <UBadge :color="campaignStatusColor(campaign.status)" variant="subtle">{{ campaign.status.replace('_', ' ') }}</UBadge>
          <dl>
            <div><dt>Delivery</dt><dd>{{ campaign.status === 'draft' ? 'Not sent' : `${campaign.sentCount}/${campaign.recipientCount} sent` }}</dd></div>
            <div><dt>Tests</dt><dd>{{ campaign.testSentCount }} sent<span v-if="campaign.lastTestSentAt"> · {{ formatDate(campaign.lastTestSentAt) }}</span></dd></div>
            <div><dt>Created</dt><dd>{{ formatDate(campaign.createdAt) }}</dd></div>
          </dl>
          <UButton
            v-if="campaign.status === 'draft'"
            label="Edit draft"
            icon="i-lucide-pencil"
            color="neutral"
            variant="soft"
            size="sm"
            @click="editCampaign(campaign)"
          />
          <UButton
            v-else
            label="Send again"
            icon="i-lucide-copy-plus"
            color="neutral"
            variant="soft"
            size="sm"
            @click="duplicateCampaign(campaign)"
          />
        </article>
      </div>
      <div v-else class="campaign-empty">
        <span><UIcon name="i-lucide-file-pen-line" /></span>
        <div><h3>No campaigns yet</h3><p>Your saved drafts and completed sends will appear here.</p></div>
      </div>
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

    <UModal v-model:open="showSendConfirmation" title="Send this newsletter?">
      <template #body>
        <div class="send-confirmation">
          <span><UIcon name="i-lucide-mail-check" /></span>
          <h3>Ready to share “{{ campaignForm.blogTitle || 'this blog' }}”?</h3>
          <p>This will email all {{ counts.subscribed }} confirmed subscribers individually. Anyone who has unsubscribed will be skipped.</p>
          <div><UButton label="Go back" color="neutral" variant="ghost" @click="showSendConfirmation = false" /><UButton label="Yes, send newsletter" icon="i-lucide-send" @click="sendCampaign" /></div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.newsletter-page { display: grid; gap: 1.5rem; }

.campaign-workspace { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(19rem, 0.85fr); overflow: hidden; border: 1px solid var(--color-border); border-radius: 2rem; background: color-mix(in srgb, var(--white) 84%, var(--cream)); box-shadow: var(--shadow-md); }
.campaign-editor, .campaign-preview { padding: clamp(1.4rem, 3vw, 2.4rem); }
.campaign-preview { background: color-mix(in srgb, var(--sage) 70%, var(--cream)); }
.section-title { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.section-title h2 { margin: 0; color: var(--ink); font-family: var(--font-heading); font-size: clamp(2rem, 4vw, 3rem); line-height: 1; }
.section-copy { max-width: 44rem; margin: 0.8rem 0 1.4rem; font-size: 0.76rem; line-height: 1.7; }
.campaign-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; margin-top: 1.2rem; }
.full-field { grid-column: 1 / -1; }
.campaign-actions { display: flex; flex-wrap: wrap; gap: 0.7rem; margin-top: 1.4rem; }
.preview-card { overflow: hidden; margin-top: 1rem; border: 1px solid var(--color-border); border-radius: 1.6rem; background: #fffaf7; box-shadow: var(--shadow-sm); }
.preview-head { padding: 2rem; background: #c9d2b3; }
.preview-head small { color: #795744; font-size: 0.62rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
.preview-head h3 { margin: 0.6rem 0 0; color: #0f0e13; font-family: Georgia, serif; font-size: 1.75rem; line-height: 1.15; }
.preview-body { padding: 2rem; color: #614635; }
.preview-body p { min-height: 5rem; margin: 0 0 1.3rem; font-size: 0.78rem; line-height: 1.7; white-space: pre-line; }
.preview-body > span { display: inline-block; padding: 0.8rem 1.1rem; border-radius: 999px; color: #0f0e13; background: #d5a27f; font-size: 0.7rem; font-weight: 700; }
.preview-body > small { display: block; margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #ead3c5; font-size: 0.58rem; }
.campaign-history { padding: clamp(1.4rem, 3vw, 2.2rem); border: 1px solid var(--color-border); border-radius: 2rem; background: color-mix(in srgb, var(--white) 75%, transparent); }
.history-grid { display: grid; gap: 0.7rem; margin-top: 1.2rem; }
.history-grid article { display: grid; grid-template-columns: minmax(0, 1fr) auto auto auto; align-items: center; gap: 1rem; padding: 1rem 1.2rem; border: 1px solid var(--color-border); border-radius: 1.2rem; background: color-mix(in srgb, var(--white) 82%, var(--cream)); }
.history-grid h3, .history-grid p { margin: 0; }
.history-grid h3 { color: var(--ink); font-size: 0.78rem; }
.history-grid p { margin-top: 0.2rem; font-size: 0.65rem; }
.history-grid dl { display: flex; gap: 1.5rem; margin: 0; }
.history-grid dl div { display: grid; }
.history-grid dt { color: var(--ui-text-muted); font-size: 0.55rem; text-transform: uppercase; }
.history-grid dd { margin: 0.15rem 0 0; color: var(--ink); font-size: 0.68rem; font-weight: 700; }
.campaign-empty { display: flex; align-items: center; gap: 1rem; margin-top: 1.2rem; padding: 1.2rem; border: 1px dashed var(--color-border); border-radius: 1.2rem; }
.campaign-empty > span { display: grid; width: 2.8rem; aspect-ratio: 1; flex: none; place-items: center; border-radius: 0.9rem; color: var(--ink); background: var(--sage); }
.campaign-empty h3, .campaign-empty p { margin: 0; }
.campaign-empty h3 { color: var(--ink); font-family: var(--font-heading); font-size: 1.2rem; }
.campaign-empty p { margin-top: 0.2rem; font-size: 0.68rem; }
.send-confirmation { display: grid; justify-items: center; padding: 1rem; text-align: center; }
.send-confirmation > span { display: grid; width: 4rem; aspect-ratio: 1; place-items: center; border-radius: 1.2rem; background: var(--sage); font-size: 1.4rem; }
.send-confirmation h3 { margin: 1rem 0 0; color: var(--ink); font-family: var(--font-heading); font-size: 1.6rem; }
.send-confirmation p { max-width: 30rem; margin: 0.6rem 0 1.4rem; font-size: 0.75rem; line-height: 1.7; }
.send-confirmation > div { display: flex; gap: 0.7rem; }

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
  .campaign-workspace { grid-template-columns: 1fr; }
}

@media (max-width: 42rem) {
  .newsletter-heading { align-items: center; }
  .subscriber-total { min-width: 5rem; }
  .newsletter-tools { flex-wrap: wrap; }
  .search-input { min-width: 100%; }
  .status-select { flex: 1; width: auto; }
  .campaign-fields { grid-template-columns: 1fr; }
  .full-field { grid-column: auto; }
  .campaign-actions > * { width: 100%; justify-content: center; }
  .history-grid article { grid-template-columns: 1fr auto; }
  .history-grid dl { grid-column: 1 / -1; }
  .history-grid article > :last-child { grid-column: 1 / -1; justify-self: start; }
}
</style>
