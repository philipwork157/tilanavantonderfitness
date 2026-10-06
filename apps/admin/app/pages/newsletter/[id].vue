<script setup lang="ts">
const route = useRoute();
const id = Number(route.params.id);
const toast = useToast();

const { data, error, refresh } = await useFetch(`/api/newsletter-campaigns/${id}`);
if (error.value) {
  throw createError({ statusCode: error.value.statusCode ?? 404, statusMessage: 'Email not found.', fatal: true });
}

const campaign = computed(() => data.value!.campaign);
const counts = computed(() => data.value!.counts);
const isDraft = computed(() => campaign.value.status === 'draft');

function toForm() {
  return {
    blogPostId: campaign.value.blogPostId ?? undefined,
    subject: campaign.value.subject,
    previewText: campaign.value.previewText,
    introduction: campaign.value.introduction,
  };
}
const form = reactive(toForm());
const saved = ref(JSON.stringify(form));
const dirty = computed(() => JSON.stringify(form) !== saved.value);

useSeoMeta({ title: () => `${form.subject || 'Newsletter email'} | Tilana Admin`, robots: 'noindex, nofollow' });

function errorMessage(caught: unknown, fallback: string) {
  return (caught as { data?: { statusMessage?: string } }).data?.statusMessage ?? fallback;
}

/* Blog posts to choose from */
const { data: postData } = await useFetch('/api/blog-posts', { lazy: true });
const postItems = computed(() => (postData.value?.posts ?? [])
  .filter(post => post.status === 'published')
  .map(post => ({ label: post.title, value: post.id })));

/* Live preview, rendered by the server from the form as it is typed */
const preview = ref<{ subject: string; previewText: string; html: string } | null>(null);
const previewError = ref('');
const previewWidth = ref<'desktop' | 'mobile'>('desktop');
const widthItems = [
  { label: 'Desktop', value: 'desktop', icon: 'i-lucide-monitor' },
  { label: 'Phone', value: 'mobile', icon: 'i-lucide-smartphone' },
];
let previewTimer: ReturnType<typeof setTimeout> | undefined;
async function loadPreview() {
  if (!form.blogPostId) return;
  try {
    // A plain string URL keeps TypeScript from expanding every API route type.
    const url: string = `/api/newsletter-campaigns/${id}/preview`;
    preview.value = await $fetch<{ subject: string; previewText: string; html: string }>(url, { method: 'POST', body: form });
    previewError.value = '';
  }
  catch (caught) {
    previewError.value = errorMessage(caught, 'The preview could not be shown.');
  }
}
watch(form, () => {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(loadPreview, 400);
});
onMounted(loadPreview);

/* Save */
const saving = ref(false);
async function save(options: { quiet?: boolean } = {}) {
  saving.value = true;
  try {
    await $fetch(`/api/newsletter-campaigns/${id}`, { method: 'PUT', body: form });
    saved.value = JSON.stringify(form);
    await refresh();
    if (!options.quiet) toast.add({ title: 'Saved', icon: 'i-lucide-check' });
    return true;
  }
  catch (caught) {
    toast.add({ title: 'Not saved', description: errorMessage(caught, 'Please try again.'), color: 'error', icon: 'i-lucide-circle-alert' });
    return false;
  }
  finally {
    saving.value = false;
  }
}

/* Test email */
const testing = ref(false);
async function sendTest() {
  testing.value = true;
  try {
    if (dirty.value && !(await save({ quiet: true }))) return;
    const result = await $fetch(`/api/newsletter-campaigns/${id}/test`, { method: 'POST' });
    await refresh();
    toast.add({ title: 'Test email sent', description: result.recipients.join(', '), icon: 'i-lucide-mail-check' });
  }
  catch (caught) {
    toast.add({ title: 'Test not sent', description: errorMessage(caught, 'Please try again.'), color: 'error', icon: 'i-lucide-circle-alert' });
  }
  finally {
    testing.value = false;
  }
}

/* Review and send */
const reviewOpen = ref(false);
const recipients = ref<string[]>([]);
const loadingRecipients = ref(false);
const checked = ref(false);
async function openReview() {
  checked.value = false;
  loadingRecipients.value = true;
  reviewOpen.value = true;
  try {
    recipients.value = (await $fetch(`/api/newsletter-campaigns/${id}/recipients`)).recipients;
  }
  finally {
    loadingRecipients.value = false;
  }
}

const sending = ref(false);
async function sendCampaign() {
  sending.value = true;
  try {
    await $fetch(`/api/newsletter-campaigns/${id}/send`, { method: 'POST', body: { recipientCount: recipients.value.length } });
    reviewOpen.value = false;
    toast.add({ title: 'Sending started', description: `Going to ${recipients.value.length} ${recipients.value.length === 1 ? 'person' : 'people'}.`, icon: 'i-lucide-send' });
    await refresh();
    await refreshDeliveries();
  }
  catch (caught) {
    toast.add({ title: 'Not sent', description: errorMessage(caught, 'Please try again.'), color: 'error', icon: 'i-lucide-circle-alert' });
    if (reviewOpen.value) await openReview();
  }
  finally {
    sending.value = false;
  }
}

/* Progress */
const { data: deliveryData, refresh: refreshDeliveries } = await useFetch(`/api/newsletter-campaigns/${id}/deliveries`, {
  immediate: !isDraft.value,
});
const deliveries = computed(() => deliveryData.value?.deliveries ?? []);
const done = computed(() => counts.value.sent + counts.value.bounced + counts.value.complained + counts.value.skipped + counts.value.failed);
const progress = computed(() => (campaign.value.recipientCount ? Math.round((done.value / campaign.value.recipientCount) * 100) : 0));
const deliveryColumns = [
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'sentAt', header: 'Sent' },
];

let poller: ReturnType<typeof setInterval> | undefined;
watch(() => campaign.value.status, (status) => {
  clearInterval(poller);
  if (status === 'sending') {
    poller = setInterval(async () => {
      await Promise.all([refresh(), refreshDeliveries()]);
    }, 3000);
  }
}, { immediate: true });
onBeforeUnmount(() => {
  clearInterval(poller);
  clearTimeout(previewTimer);
});

const resuming = ref(false);
async function resume() {
  resuming.value = true;
  try {
    await $fetch(`/api/newsletter-campaigns/${id}/resume`, { method: 'POST' });
    await refresh();
  }
  catch (caught) {
    toast.add({ title: 'Could not resume', description: errorMessage(caught, 'Please try again.'), color: 'error' });
  }
  finally {
    resuming.value = false;
  }
}

/* Delete draft */
const deleteOpen = ref(false);
const deleting = ref(false);
async function deleteDraft() {
  deleting.value = true;
  try {
    await $fetch(`/api/newsletter-campaigns/${id}`, { method: 'DELETE' });
    saved.value = JSON.stringify(form);
    await navigateTo({ path: '/newsletter', query: { deleted: '1' } });
  }
  catch (caught) {
    toast.add({ title: 'Not deleted', description: errorMessage(caught, 'Please try again.'), color: 'error' });
  }
  finally {
    deleting.value = false;
  }
}

onBeforeRouteLeave(() => {
  if (isDraft.value && dirty.value && !window.confirm('You have unsaved changes. Leave without saving?')) return false;
});

const testRecipients = computed(() => data.value!.testRecipients);
const subscriberCount = computed(() => data.value!.subscriberCount);
const testedAndSaved = computed(() => Boolean(campaign.value.testSentAt) && !dirty.value);
</script>

<template>
  <AdminPage id="newsletter-email" :title="form.subject || 'Newsletter email'">
    <template #actions>
      <UBadge
        :label="campaignStatusLabel[campaign.status] ?? campaign.status"
        color="neutral"
        variant="subtle"
        class="max-sm:hidden"
        :class="`badge-${campaign.status}`"
      />
      <UButton
        v-if="isDraft"
        label="Save"
        icon="i-lucide-save"
        color="neutral"
        variant="outline"
        :ui="{ label: 'max-sm:sr-only' }"
        :loading="saving"
        :disabled="!dirty"
        @click="save()"
      />
    </template>

    <div class="back-row">
      <UButton to="/newsletter" label="All emails" icon="i-lucide-arrow-left" color="neutral" variant="link" />
      <span v-if="isDraft && dirty" class="unsaved">Unsaved changes</span>
    </div>

    <div class="layout">
      <div class="main-column">
        <template v-if="isDraft">
          <section class="panel" aria-labelledby="content-heading">
            <h2 id="content-heading" class="panel-title">
              Email
            </h2>
            <UFormField label="Blog post" name="blogPostId" required help="The email links to this post on the website.">
              <USelectMenu v-model="form.blogPostId" :items="postItems" value-key="value" class="w-full" />
            </UFormField>
            <UFormField label="Subject" name="subject" required>
              <UInput v-model="form.subject" maxlength="150" />
            </UFormField>
            <UFormField label="Preview line" name="previewText" help="Shown next to the subject in most inboxes. Leave empty to use the post summary.">
              <UInput v-model="form.previewText" maxlength="200" />
            </UFormField>
            <UFormField label="Personal note" name="introduction" help="Optional. A few words from you above the post summary.">
              <UTextarea v-model="form.introduction" :rows="4" autoresize maxlength="1000" />
            </UFormField>
          </section>

          <section class="panel" aria-labelledby="send-heading">
            <h2 id="send-heading" class="panel-title">
              Send
            </h2>
            <ol class="steps">
              <li class="step" :class="{ complete: testedAndSaved }">
                <span class="step-mark" aria-hidden="true">
                  <UIcon :name="testedAndSaved ? 'i-lucide-check' : 'i-lucide-mail'" />
                </span>
                <div class="step-body">
                  <p class="step-title">
                    Send a test email
                  </p>
                  <p class="step-text">
                    <template v-if="testRecipients.length">
                      Goes to {{ testRecipients.join(', ') }}.
                    </template>
                    <template v-else>
                      No test addresses are set up yet (NUXT_NEWSLETTER_TEST_TO).
                    </template>
                    <template v-if="testedAndSaved && campaign.testSentAt">
                      Sent {{ formatDateTime(campaign.testSentAt) }}.
                    </template>
                    <template v-else-if="dirty">
                      Saves your changes first.
                    </template>
                  </p>
                  <UButton
                    :label="testedAndSaved ? 'Send another test' : 'Send test email'"
                    icon="i-lucide-mail"
                    color="neutral"
                    variant="outline"
                    :loading="testing"
                    :disabled="!testRecipients.length || !form.blogPostId"
                    @click="sendTest"
                  />
                </div>
              </li>
              <li class="step">
                <span class="step-mark" aria-hidden="true">
                  <UIcon name="i-lucide-send" />
                </span>
                <div class="step-body">
                  <p class="step-title">
                    Send to subscribers
                  </p>
                  <p class="step-text">
                    {{ subscriberCount }} confirmed {{ subscriberCount === 1 ? 'subscriber' : 'subscribers' }}.
                    <template v-if="!testedAndSaved">
                      Available once the test email has been sent.
                    </template>
                  </p>
                  <UButton
                    label="Review and send"
                    icon="i-lucide-send"
                    :disabled="!testedAndSaved || !subscriberCount"
                    @click="openReview"
                  />
                </div>
              </li>
            </ol>
          </section>

          <section class="panel danger">
            <UButton label="Delete draft" icon="i-lucide-trash-2" color="error" variant="ghost" class="delete-button" @click="deleteOpen = true" />
          </section>
        </template>

        <template v-else>
          <section class="panel" aria-labelledby="progress-heading">
            <h2 id="progress-heading" class="panel-title">
              {{ campaign.status === 'sent' ? 'Sent' : campaign.status === 'paused' ? 'Paused' : 'Sending…' }}
            </h2>
            <UAlert
              v-if="campaign.status === 'paused'"
              color="warning"
              variant="subtle"
              icon="i-lucide-circle-pause"
              title="Sending stopped"
              :description="campaign.pauseReason ?? 'Something went wrong while sending.'"
            />
            <UProgress :model-value="progress" :max="100" />
            <p class="progress-text">
              {{ done }} of {{ campaign.recipientCount }} handled
              <template v-if="campaign.finishedAt">
                · finished {{ formatDateTime(campaign.finishedAt) }}
              </template>
              <template v-else-if="campaign.startedAt">
                · started {{ formatDateTime(campaign.startedAt) }}
              </template>
            </p>
            <dl class="stats">
              <div><dt>Sent</dt><dd>{{ counts.sent }}</dd></div>
              <div><dt>Waiting</dt><dd>{{ counts.queued }}</dd></div>
              <div><dt>Bounced</dt><dd>{{ counts.bounced }}</dd></div>
              <div><dt>Spam</dt><dd>{{ counts.complained }}</dd></div>
              <div v-if="counts.skipped"><dt>Skipped</dt><dd>{{ counts.skipped }}</dd></div>
              <div v-if="counts.failed"><dt>Failed</dt><dd>{{ counts.failed }}</dd></div>
            </dl>
            <p class="step-text">
              Bounced and spam addresses are never emailed again. Skipped people unsubscribed while it was sending.
            </p>
            <UButton v-if="campaign.status === 'paused'" label="Resume sending" icon="i-lucide-play" :loading="resuming" class="resume" @click="resume" />
          </section>

          <div class="table-card">
            <UTable :data="deliveries" :columns="deliveryColumns" :ui="{ separator: 'bg-(--ui-border)' }">
              <template #email-cell="{ row }">
                <span class="stack">
                  <span class="primary">{{ row.original.email }}</span>
                  <span v-if="row.original.error" class="secondary">{{ row.original.error }}</span>
                </span>
              </template>
              <template #status-cell="{ row }">
                <UBadge :label="deliveryStatusLabel[row.original.status] ?? row.original.status" color="neutral" variant="subtle" />
              </template>
              <template #sentAt-cell="{ row }">
                <span class="nowrap">{{ row.original.sentAt ? formatDateTime(row.original.sentAt) : '' }}</span>
              </template>
            </UTable>
          </div>
        </template>
      </div>

      <section class="panel preview-panel" aria-labelledby="preview-heading">
        <div class="preview-head">
          <h2 id="preview-heading" class="panel-title">
            Preview
          </h2>
          <UTabs v-model="previewWidth" :items="widthItems" :content="false" size="xs" variant="pill" />
        </div>
        <div v-if="preview" class="inbox-line">
          <span class="inbox-from">Tilana van Tonder</span>
          <span class="inbox-subject">{{ preview.subject }}</span>
          <span class="inbox-preview">{{ preview.previewText }}</span>
        </div>
        <p v-if="previewError" class="step-text">
          {{ previewError }}
        </p>
        <div class="frame-wrap" :class="previewWidth">
          <iframe
            v-if="preview"
            :srcdoc="preview.html"
            sandbox=""
            title="Email preview"
            class="frame"
          />
        </div>
      </section>
    </div>

    <UModal v-model:open="reviewOpen" :title="`Send to ${recipients.length} ${recipients.length === 1 ? 'person' : 'people'}?`" description="Everyone below has confirmed their subscription. This can't be undone.">
      <template #body>
        <div class="review">
          <p class="review-subject">
            <span>Subject</span>
            {{ form.subject }}
          </p>
          <ul class="recipient-list" aria-label="Recipients">
            <li v-for="address in recipients" :key="address">
              {{ address }}
            </li>
          </ul>
          <p v-if="loadingRecipients" class="step-text">
            Loading recipients…
          </p>
          <UCheckbox v-model="checked" label="I checked the test email and it looks right" />
        </div>
      </template>
      <template #footer>
        <div class="modal-actions">
          <UButton label="Cancel" color="neutral" variant="ghost" @click="reviewOpen = false" />
          <UButton
            :label="`Send to ${recipients.length} ${recipients.length === 1 ? 'person' : 'people'}`"
            icon="i-lucide-send"
            :loading="sending"
            :disabled="!checked || !recipients.length || loadingRecipients"
            @click="sendCampaign"
          />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="deleteOpen" title="Delete this draft?" description="The draft email is removed. The blog post is not affected.">
      <template #footer>
        <div class="modal-actions">
          <UButton label="Keep draft" color="neutral" variant="outline" @click="deleteOpen = false" />
          <UButton label="Delete draft" color="error" :loading="deleting" @click="deleteDraft" />
        </div>
      </template>
    </UModal>
  </AdminPage>
</template>

<style scoped>
.back-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: calc(var(--space-2) * -1);
}

.back-row :deep(a) {
  padding-inline: 0;
}

.unsaved {
  color: var(--color-warning);
  font-size: var(--text-body-sm);
  font-weight: var(--weight-semibold);
}

.layout {
  display: grid;
  align-items: start;
  gap: var(--space-6);
  grid-template-columns: minmax(0, 26rem) minmax(0, 1fr);
}

.main-column {
  display: grid;
  min-width: 0;
  gap: var(--space-6);
}

.panel {
  display: grid;
  min-width: 0;
  gap: var(--space-4);
  padding: var(--card-padding);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface-elevated);
  box-shadow: var(--shadow-xs);
}

.panel.danger {
  padding-block: var(--space-3);
}

.delete-button {
  justify-self: start;
}

.panel-title {
  margin: 0;
  color: var(--color-text-primary);
  font-size: var(--text-h6);
  font-weight: var(--weight-semibold);
}

.steps {
  display: grid;
  gap: var(--space-5);
  margin: 0;
  padding: 0;
  list-style: none;
}

.step {
  display: grid;
  align-items: start;
  gap: var(--space-3);
  grid-template-columns: 2rem minmax(0, 1fr);
}

.step-mark {
  display: grid;
  width: 2rem;
  height: 2rem;
  place-items: center;
  border-radius: 999px;
  color: var(--color-text-muted);
  background: var(--color-surface-subtle);
}

.step.complete .step-mark {
  color: var(--color-text-primary);
  background: var(--color-accent-subtle);
}

.step-body {
  display: grid;
  justify-items: start;
  gap: var(--space-2);
}

.step-title {
  margin: 0;
  color: var(--color-text-primary);
  font-weight: var(--weight-semibold);
}

.step-text,
.progress-text {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--text-body-sm);
  overflow-wrap: anywhere;
}

.stats {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  grid-template-columns: repeat(auto-fill, minmax(7rem, 1fr));
}

.stats div {
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.stats dt {
  color: var(--color-text-muted);
  font-size: var(--text-caption);
}

.stats dd {
  margin: 0;
  color: var(--color-text-primary);
  font-size: var(--text-h5);
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
}

.resume {
  justify-self: start;
}

.preview-panel {
  position: sticky;
  top: var(--space-4);
}

.preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.inbox-line {
  display: grid;
  gap: 2px;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  font-size: var(--text-body-sm);
}

.inbox-from {
  color: var(--color-text-muted);
}

.inbox-subject {
  color: var(--color-text-primary);
  font-weight: var(--weight-semibold);
}

.inbox-preview {
  overflow: hidden;
  color: var(--color-text-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.frame-wrap {
  display: grid;
  justify-items: center;
  overflow: hidden;
  border-radius: var(--radius-md);
  background: #f6e4d9;
}

.frame {
  width: 100%;
  height: 46rem;
  border: 0;
  transition: width 200ms ease;
}

.frame-wrap.mobile .frame {
  width: min(100%, 23.5rem);
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

.stack {
  display: grid;
  min-width: 0;
}

.primary {
  color: var(--color-text-primary);
  overflow-wrap: anywhere;
}

.secondary {
  color: var(--color-text-muted);
  font-size: var(--text-body-sm);
}

.nowrap {
  white-space: nowrap;
}

.badge-sent {
  color: var(--color-text-primary);
  background: var(--color-accent-subtle);
}

.badge-sending,
.badge-paused {
  color: var(--color-text-primary);
  background: var(--color-warning-subtle);
}

.review {
  display: grid;
  gap: var(--space-4);
}

.review-subject {
  display: grid;
  margin: 0;
  color: var(--color-text-primary);
  font-weight: var(--weight-semibold);
}

.review-subject span {
  color: var(--color-text-muted);
  font-size: var(--text-caption);
  font-weight: var(--weight-regular);
}

.recipient-list {
  max-height: 16rem;
  margin: 0;
  padding: var(--space-3) var(--space-4);
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text-primary);
  font-size: var(--text-body-sm);
  line-height: 1.9;
  list-style: none;
  overflow-wrap: anywhere;
}

.modal-actions {
  display: flex;
  width: 100%;
  justify-content: flex-end;
  gap: var(--space-2);
}

@media (max-width: 63.99rem) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .preview-panel {
    position: static;
  }

  .frame {
    height: 38rem;
  }
}

@media (max-width: 47.99rem) {
  .table-card :deep(th:nth-child(3)),
  .table-card :deep(td:nth-child(3)) {
    display: none;
  }
}
</style>
