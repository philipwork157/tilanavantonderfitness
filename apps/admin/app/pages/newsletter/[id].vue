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

/* Test email: show exactly what will be sent, then send it */
type TestPreview = { recipients: string[]; subject: string; from: string; html: string; devRedirectTo: string | null };
const testOpen = ref(false);
const testPreview = ref<TestPreview | null>(null);
const loadingTest = ref(false);
async function openTest() {
  if (dirty.value && !(await save({ quiet: true }))) return;
  testPreview.value = null;
  testOpen.value = true;
  loadingTest.value = true;
  try {
    const url: string = `/api/newsletter-campaigns/${id}/test-preview`;
    testPreview.value = await $fetch<TestPreview>(url);
  }
  catch (caught) {
    testOpen.value = false;
    toast.add({ title: 'Could not prepare the test', description: errorMessage(caught, 'Please try again.'), color: 'error' });
  }
  finally {
    loadingTest.value = false;
  }
}

const testing = ref(false);
async function sendTest() {
  testing.value = true;
  try {
    const result = await $fetch(`/api/newsletter-campaigns/${id}/test`, { method: 'POST' });
    testOpen.value = false;
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

/* Who it goes to, shown on the page before sending */
const { data: recipientData, refresh: refreshRecipients } = await useFetch(`/api/newsletter-campaigns/${id}/recipients`, {
  immediate: isDraft.value,
});
const upcomingRecipients = computed(() => recipientData.value?.recipients ?? []);

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

const refreshing = ref(false);
async function refreshAll() {
  refreshing.value = true;
  try {
    await Promise.all([refresh(), isDraft.value ? refreshRecipients() : refreshDeliveries()]);
    if (isDraft.value) await loadPreview();
  }
  finally {
    refreshing.value = false;
  }
}

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
const testedAndSaved = computed(() => Boolean(campaign.value.testSentAt) && !dirty.value);
const devRedirectTo = computed(() => data.value!.devRedirectTo);
</script>

<template>
  <AdminPage id="newsletter-email" :title="form.subject || 'Newsletter email'">
    <template #actions>
      <span class="max-sm:hidden">
        <AdminStatusBadge :label="campaignStatusLabel[campaign.status] ?? campaign.status" :tone="campaignTone[campaign.status]" />
      </span>
      <AdminRefreshButton :loading="refreshing" @click="refreshAll" />
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

    <UAlert
      v-if="devRedirectTo"
      color="info"
      variant="subtle"
      icon="i-lucide-flask-conical"
      title="Development"
      :description="`Every email from this admin, tests and newsletters, goes only to ${devRedirectTo}.`"
      class="dev-note"
    />

    <div class="layout">
      <div class="main-column">
        <template v-if="isDraft">
          <section class="panel" aria-labelledby="content-heading">
            <div class="panel-head">
              <AdminIconChip icon="i-lucide-pen-line" tone="brand" />
              <div>
                <h2 id="content-heading" class="panel-title">
                  Email
                </h2>
                <p class="panel-sub">
                  What your subscribers see in their inbox.
                </p>
              </div>
            </div>
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
            <div class="panel-head">
              <AdminIconChip icon="i-lucide-send" tone="success" />
              <div>
                <h2 id="send-heading" class="panel-title">
                  Send
                </h2>
                <p class="panel-sub">
                  Test it first, then send it to everyone.
                </p>
              </div>
            </div>
            <ol class="steps">
              <li class="step" :class="{ complete: testedAndSaved }">
                <span class="step-mark" aria-hidden="true">
                  <UIcon :name="testedAndSaved ? 'i-lucide-check' : 'i-lucide-flask-conical'" />
                </span>
                <div class="step-body">
                  <p class="step-title">
                    1. Send a test email
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
                    :loading="saving && !testOpen"
                    :disabled="!testRecipients.length || !form.blogPostId"
                    @click="openTest"
                  />
                </div>
              </li>
              <li class="step" :class="{ ready: testedAndSaved }">
                <span class="step-mark" aria-hidden="true">
                  <UIcon name="i-lucide-users" />
                </span>
                <div class="step-body">
                  <p class="step-title">
                    2. Send to subscribers
                  </p>
                  <p class="step-text">
                    {{ upcomingRecipients.length }} confirmed {{ upcomingRecipients.length === 1 ? 'subscriber' : 'subscribers' }}.
                    <template v-if="!testedAndSaved">
                      Available once the test email has been sent.
                    </template>
                  </p>
                  <details v-if="upcomingRecipients.length" class="recipients">
                    <summary>Show who will receive it</summary>
                    <ul class="recipient-list compact">
                      <li v-for="address in upcomingRecipients" :key="address">
                        {{ address }}
                      </li>
                    </ul>
                  </details>
                  <UButton
                    label="Review and send"
                    icon="i-lucide-send"
                    :disabled="!testedAndSaved || !upcomingRecipients.length"
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
            <div class="panel-head">
              <AdminIconChip
                :icon="campaign.status === 'sent' ? 'i-lucide-circle-check' : campaign.status === 'paused' ? 'i-lucide-circle-pause' : 'i-lucide-loader'"
                :tone="campaignTone[campaign.status]"
              />
              <div>
                <h2 id="progress-heading" class="panel-title">
                  {{ campaign.status === 'sent' ? 'Sent' : campaign.status === 'paused' ? 'Paused' : 'Sending…' }}
                </h2>
                <p class="panel-sub">
                  {{ done }} of {{ campaign.recipientCount }} handled
                  <template v-if="campaign.finishedAt">
                    · finished {{ formatDateTime(campaign.finishedAt) }}
                  </template>
                  <template v-else-if="campaign.startedAt">
                    · started {{ formatDateTime(campaign.startedAt) }}
                  </template>
                </p>
              </div>
            </div>
            <UAlert
              v-if="campaign.status === 'paused'"
              color="warning"
              variant="subtle"
              icon="i-lucide-circle-pause"
              title="Sending stopped"
              :description="campaign.pauseReason ?? 'Something went wrong while sending.'"
            />
            <div class="progress-track" role="progressbar" :aria-valuenow="progress" aria-valuemin="0" aria-valuemax="100" aria-label="Sending progress">
              <span :style="{ width: `${progress}%` }" />
            </div>
            <dl class="stats">
              <div class="stat tone-success">
                <dt>Sent</dt><dd>{{ counts.sent }}</dd>
              </div>
              <div class="stat tone-info">
                <dt>Waiting</dt><dd>{{ counts.queued }}</dd>
              </div>
              <div class="stat tone-danger">
                <dt>Bounced</dt><dd>{{ counts.bounced }}</dd>
              </div>
              <div class="stat tone-warning">
                <dt>Spam</dt><dd>{{ counts.complained }}</dd>
              </div>
              <div v-if="counts.skipped" class="stat tone-neutral">
                <dt>Skipped</dt><dd>{{ counts.skipped }}</dd>
              </div>
              <div v-if="counts.failed" class="stat tone-danger">
                <dt>Failed</dt><dd>{{ counts.failed }}</dd>
              </div>
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
                <AdminStatusBadge :label="deliveryStatusLabel[row.original.status] ?? row.original.status" :tone="deliveryTone[row.original.status]" />
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
          <div class="panel-head">
            <AdminIconChip icon="i-lucide-eye" tone="info" />
            <h2 id="preview-heading" class="panel-title">
              Preview
            </h2>
          </div>
          <UTabs v-model="previewWidth" :items="widthItems" :content="false" size="xs" variant="pill" />
        </div>
        <div v-if="preview" class="inbox-line">
          <span class="inbox-avatar" aria-hidden="true">T</span>
          <span class="inbox-text">
            <span class="inbox-from">Tilana van Tonder</span>
            <span class="inbox-subject">{{ preview.subject }}</span>
            <span class="inbox-preview">{{ preview.previewText }}</span>
          </span>
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

    <UModal v-model:open="testOpen" title="Send a test email" description="This is exactly what will be sent." :ui="{ content: 'sm:max-w-3xl' }">
      <template #body>
        <div v-if="testPreview" class="review">
          <dl class="envelope">
            <div>
              <dt>To</dt>
              <dd>{{ testPreview.recipients.join(', ') }}</dd>
            </div>
            <div>
              <dt>From</dt>
              <dd>{{ testPreview.from }}</dd>
            </div>
            <div>
              <dt>Subject</dt>
              <dd>{{ testPreview.subject }}</dd>
            </div>
          </dl>
          <p v-if="testPreview.devRedirectTo" class="step-text">
            Development: only {{ testPreview.devRedirectTo }} receives this test.
          </p>
          <div class="frame-wrap modal-frame">
            <iframe :srcdoc="testPreview.html" sandbox="" title="Test email" class="frame" />
          </div>
        </div>
        <p v-else class="step-text">
          Preparing the test email…
        </p>
      </template>
      <template #footer>
        <div class="modal-actions">
          <UButton label="Cancel" color="neutral" variant="ghost" @click="testOpen = false" />
          <UButton
            :label="`Send test to ${testPreview?.recipients.length ?? 0} ${testPreview?.recipients.length === 1 ? 'address' : 'addresses'}`"
            icon="i-lucide-mail"
            :loading="testing"
            :disabled="!testPreview || loadingTest"
            @click="sendTest"
          />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="reviewOpen" :title="`Send to ${recipients.length} ${recipients.length === 1 ? 'person' : 'people'}?`" description="Everyone below has confirmed their subscription. This can't be undone.">
      <template #body>
        <div class="review">
          <dl class="envelope">
            <div>
              <dt>Subject</dt>
              <dd>{{ form.subject }}</dd>
            </div>
          </dl>
          <p v-if="devRedirectTo" class="step-text">
            Development: these emails all go to {{ devRedirectTo }} instead.
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
  grid-template-columns: minmax(22rem, 2fr) minmax(0, 3fr);
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

.panel-head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.panel-title {
  margin: 0;
  color: var(--color-text-primary);
  font-size: var(--text-h6);
  font-weight: var(--weight-semibold);
}

.panel-sub {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--text-body-sm);
}

.steps {
  display: grid;
  gap: var(--space-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.step {
  display: grid;
  align-items: start;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  grid-template-columns: 2.25rem minmax(0, 1fr);
}

.step-mark {
  display: grid;
  width: 2.25rem;
  height: 2.25rem;
  place-items: center;
  border-radius: 999px;
  color: var(--color-info);
  background: var(--color-info-subtle);
}

.step.complete {
  border-color: color-mix(in srgb, var(--color-success) 30%, transparent);
  background: color-mix(in srgb, var(--color-success-subtle) 55%, var(--color-surface-elevated));
}

.step.complete .step-mark,
.step.ready .step-mark {
  color: var(--color-success);
  background: var(--color-success-subtle);
}

.step-body {
  display: grid;
  justify-items: start;
  gap: var(--space-2);
  min-width: 0;
}

.step-title {
  margin: 0;
  color: var(--color-text-primary);
  font-weight: var(--weight-semibold);
}

.step-text {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--text-body-sm);
  overflow-wrap: anywhere;
}

.recipients {
  width: 100%;
  font-size: var(--text-body-sm);
}

.recipients summary {
  color: var(--color-text-accent);
  font-weight: var(--weight-semibold);
  cursor: pointer;
}

.recipients[open] summary {
  margin-bottom: var(--space-2);
}

.progress-track {
  height: 0.6rem;
  overflow: hidden;
  border-radius: 999px;
  background: var(--color-surface-subtle);
}

.progress-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--color-primary), var(--color-accent));
  transition: width 400ms ease;
}

.stats {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  grid-template-columns: repeat(auto-fit, minmax(6.25rem, 1fr));
}

.stat {
  padding: var(--space-3) var(--space-4);
  border-left: 3px solid var(--tone-text);
  border-radius: var(--radius-md);
  background: var(--tone-bg);
}

.stat dt {
  color: var(--color-text-muted);
  font-size: var(--text-caption);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-eyebrow);
  text-transform: uppercase;
}

.stat dd {
  margin: 0;
  color: var(--tone-text);
  font-size: var(--text-h4);
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
}

.tone-neutral { --tone-text: var(--color-text-secondary); --tone-bg: var(--color-surface); }
.tone-success { --tone-text: var(--color-success); --tone-bg: var(--color-success-subtle); }
.tone-warning { --tone-text: var(--color-warning); --tone-bg: var(--color-warning-subtle); }
.tone-danger { --tone-text: var(--color-error); --tone-bg: var(--color-error-subtle); }
.tone-info { --tone-text: var(--color-info); --tone-bg: var(--color-info-subtle); }

.resume {
  justify-self: start;
}

.preview-panel {
  position: sticky;
  top: var(--space-4);
}

.preview-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.inbox-line {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  font-size: var(--text-body-sm);
}

.inbox-avatar {
  display: grid;
  width: 2.25rem;
  height: 2.25rem;
  flex: none;
  place-items: center;
  border-radius: 999px;
  color: var(--color-on-primary);
  background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
  font-family: var(--font-display);
  font-weight: var(--weight-semibold);
}

.inbox-text {
  display: grid;
  min-width: 0;
  gap: 1px;
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
  height: 52rem;
  border: 0;
  transition: width 200ms ease;
}

.frame-wrap.mobile .frame {
  width: min(100%, 23.5rem);
}

.modal-frame .frame {
  height: 32rem;
}

.envelope {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  font-size: var(--text-body-sm);
}

.envelope div {
  display: grid;
  gap: var(--space-3);
  grid-template-columns: 4.5rem minmax(0, 1fr);
}

.envelope dt {
  color: var(--color-text-muted);
}

.envelope dd {
  margin: 0;
  color: var(--color-text-primary);
  font-weight: var(--weight-semibold);
  overflow-wrap: anywhere;
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

.review {
  display: grid;
  gap: var(--space-4);
}

.recipient-list {
  max-height: 16rem;
  margin: 0;
  padding: var(--space-3) var(--space-4);
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-elevated);
  color: var(--color-text-primary);
  font-size: var(--text-body-sm);
  line-height: 1.9;
  list-style: none;
  overflow-wrap: anywhere;
}

.recipient-list.compact {
  max-height: 12rem;
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
