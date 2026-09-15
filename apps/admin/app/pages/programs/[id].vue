<script setup lang="ts">
import {
  adminProgramFileUpdateRequestSchema,
  adminProgramFileUploadRequestSchema,
  adminProgramMediaUpdateRequestSchema,
  adminProgramMediaUploadRequestSchema,
  adminProgramUpdateRequestSchema,
  adminProgramVolumeCreateRequestSchema,
  adminProgramVolumeUpdateRequestSchema,
} from '@tilana/contracts/catalogue';
import type {
  AdminCatalogueFile,
  AdminCatalogueMedia,
  AdminCatalogueProgramResponse,
  AdminCatalogueProgramStatus,
  AdminCataloguePublicationResponse,
  AdminCatalogueUploadReservation,
  AdminCatalogueVolume,
} from '../../types/catalogue';
import {
  catalogueErrorMessage,
  catalogueStatusColor,
  catalogueStatusLabels,
  formatCatalogueMoney,
  normaliseCatalogueAccent,
  shouldMoveIncompleteProgramToDraft,
  slugifyCatalogueValue,
  uploadCatalogueObject,
} from '../../utils/catalogue';

definePageMeta({ layout: 'dashboard' });

const route = useRoute();
const runtimeConfig = useRuntimeConfig();
const programId = Number(route.params.id);
if (!Number.isSafeInteger(programId) || programId <= 0) {
  throw createError({ statusCode: 404, statusMessage: 'Program not found.' });
}

const { data, status, error, refresh } = await useFetch<AdminCatalogueProgramResponse>(
  `/api/admin/programs/${programId}`,
  { lazy: true },
);
const {
  data: publicationData,
  status: publicationStatus,
  refresh: refreshPublication,
} = await useFetch<AdminCataloguePublicationResponse>(
  `/api/admin/programs/${programId}/publication`,
  { lazy: true },
);

const program = computed(() => data.value?.program ?? null);
const activeCover = computed(() => program.value?.media.find(
  media => media.kind === 'cover' && media.uploadStatus === 'ready' && media.isActive,
) ?? null);
const publishedVolumes = computed(() => program.value?.volumes.filter(volume => volume.isPublished) ?? []);
const readyForPublication = computed(() => publicationData.value?.checklist.ready ?? false);
const nextVolumeNumber = computed(() => Math.max(
  0,
  ...(program.value?.volumes.map(volume => volume.volumeNumber) ?? []),
) + 1);
const nextVolumeLabel = computed(() => `Add Volume ${nextVolumeNumber.value}`);
const publicProgramUrl = computed(() => {
  const siteUrl = String(runtimeConfig.public.siteUrl || 'http://127.0.0.1:4321').replace(/\/$/, '');
  return `${siteUrl}/program`;
});

const programForm = reactive({
  name: '',
  slug: '',
  cardLabel: '',
  headline: '',
  description: '',
  accent: 'terracotta',
  sortOrder: 0,
});
const savingProgram = ref(false);
const actionError = ref('');
const actionNotice = ref('');
const changingStatus = ref(false);

const showVolumeForm = ref(false);
const editingVolumeId = ref<number | null>(null);
const savingVolume = ref(false);
const volumeError = ref('');
const volumeForm = reactive({
  name: '',
  slug: '',
  volumeNumber: 1,
  description: '',
  priceRands: 399,
  sortOrder: 0,
  isPublished: false,
});

const coverUploading = ref(false);
const coverUploadStage = ref('');
const coverAltText = ref('');
const savingMedia = ref(false);

const uploadingVolumeId = ref<number | null>(null);
const pdfUploadStage = ref('');
const editingFileId = ref<number | null>(null);
const showFileForm = ref(false);
const savingFile = ref(false);
const fileError = ref('');
const fileForm = reactive({ displayName: '', sortOrder: 0 });

const genericMarketingValues = new Set(['card', 'headline', 'description', 'test', 'testing', 'placeholder']);
const marketingGuidance = computed(() => {
  const guidance: string[] = [];
  const cardLabel = programForm.cardLabel.trim();
  const headline = programForm.headline.trim();
  const description = programForm.description.trim();

  if (cardLabel && (cardLabel.length < 4 || genericMarketingValues.has(cardLabel.toLowerCase()))) {
    guidance.push('Make the card label a specific category, such as Strength or Nourishment.');
  }
  if (headline && (headline.length < 12 || genericMarketingValues.has(headline.toLowerCase()))) {
    guidance.push('Use a customer-focused headline that clearly communicates the main outcome.');
  }
  if (description && (description.length < 50 || genericMarketingValues.has(description.toLowerCase()))) {
    guidance.push('Add a fuller description explaining who the program is for and what it helps them achieve.');
  }
  return guidance;
});

type ConfirmationColor = 'error' | 'warning' | 'primary';
interface ConfirmationAction {
  title: string;
  description: string;
  label: string;
  color: ConfirmationColor;
  run: () => Promise<void>;
}
const confirmation = shallowRef<ConfirmationAction | null>(null);
const confirming = ref(false);
const confirmationOpen = computed({
  get: () => confirmation.value !== null,
  set: (open: boolean) => {
    if (!open && !confirming.value) confirmation.value = null;
  },
});

watch(program, (value) => {
  if (!value) return;
  Object.assign(programForm, {
    name: value.name,
    slug: value.slug,
    cardLabel: value.cardLabel ?? '',
    headline: value.headline ?? '',
    description: value.description ?? '',
    accent: normaliseCatalogueAccent(value.accent),
    sortOrder: value.sortOrder,
  });
  coverAltText.value = activeCover.value?.altText ?? `${value.name} program cover`;
}, { immediate: true });

function clearFeedback() {
  actionError.value = '';
  actionNotice.value = '';
}

async function refreshProgram() {
  await Promise.all([refresh(), refreshPublication()]);
}

async function saveProgram() {
  clearFeedback();
  const parsed = adminProgramUpdateRequestSchema.safeParse({
    name: programForm.name,
    slug: programForm.slug,
    cardLabel: programForm.cardLabel.trim() || null,
    headline: programForm.headline.trim() || null,
    description: programForm.description.trim() || null,
    accent: programForm.accent || null,
    sortOrder: Number(programForm.sortOrder),
  });
  if (!parsed.success) {
    actionError.value = parsed.error.issues[0]?.message ?? 'Please check the program details.';
    return;
  }

  savingProgram.value = true;
  const moveToDraft = shouldMoveIncompleteProgramToDraft(
    program.value?.status,
    publicationData.value?.checklist.ready,
  );
  try {
    if (moveToDraft) {
      await $fetch(`/api/admin/programs/${programId}/status`, {
        method: 'PATCH',
        body: { status: 'draft' },
      });
    }
    await $fetch(`/api/admin/programs/${programId}`, { method: 'PATCH', body: parsed.data });
    await refreshProgram();
    actionNotice.value = moveToDraft
      ? 'Program details saved. This incomplete program was moved to draft until its publication checklist is complete.'
      : 'Program details saved.';
  } catch (value) {
    actionError.value = catalogueErrorMessage(value, 'The program details could not be saved.');
  } finally {
    savingProgram.value = false;
  }
}

function openCreateVolume() {
  const nextNumber = nextVolumeNumber.value;
  const latestVolume = [...(program.value?.volumes ?? [])]
    .sort((left, right) => right.volumeNumber - left.volumeNumber)[0];
  const nextSortOrder = Math.max(-1, ...(program.value?.volumes.map(volume => volume.sortOrder) ?? [])) + 1;
  editingVolumeId.value = null;
  Object.assign(volumeForm, {
    name: `${program.value?.name ?? 'Program'} · Volume ${nextNumber}`,
    slug: `${program.value?.slug ?? 'program'}-volume-${nextNumber}`,
    volumeNumber: nextNumber,
    description: '',
    priceRands: latestVolume ? latestVolume.currentPriceCents / 100 : 399,
    sortOrder: nextSortOrder,
    isPublished: false,
  });
  volumeError.value = '';
  showVolumeForm.value = true;
}

function openEditVolume(volume: AdminCatalogueVolume) {
  editingVolumeId.value = volume.id;
  Object.assign(volumeForm, {
    name: volume.name,
    slug: volume.slug ?? '',
    volumeNumber: volume.volumeNumber,
    description: volume.description ?? '',
    priceRands: volume.currentPriceCents / 100,
    sortOrder: volume.sortOrder,
    isPublished: volume.isPublished,
  });
  volumeError.value = '';
  showVolumeForm.value = true;
}

function fillVolumeSlug() {
  if (!volumeForm.slug.trim()) volumeForm.slug = slugifyCatalogueValue(volumeForm.name);
}

async function saveVolume() {
  fillVolumeSlug();
  volumeError.value = '';
  const payload = {
    name: volumeForm.name,
    slug: volumeForm.slug.trim() || null,
    volumeNumber: Number(volumeForm.volumeNumber),
    description: volumeForm.description.trim() || null,
    currentPriceCents: Math.round(Number(volumeForm.priceRands) * 100),
    currency: 'ZAR' as const,
    sortOrder: Number(volumeForm.sortOrder),
    isPublished: editingVolumeId.value ? volumeForm.isPublished : false,
  };
  const parsed = editingVolumeId.value
    ? adminProgramVolumeUpdateRequestSchema.safeParse(payload)
    : adminProgramVolumeCreateRequestSchema.safeParse(payload);
  if (!parsed.success) {
    volumeError.value = parsed.error.issues[0]?.message ?? 'Please check the volume details.';
    return;
  }

  savingVolume.value = true;
  try {
    await $fetch(
      editingVolumeId.value
        ? `/api/admin/program-volumes/${editingVolumeId.value}`
        : `/api/admin/programs/${programId}/volumes`,
      { method: editingVolumeId.value ? 'PATCH' : 'POST', body: parsed.data },
    );
    showVolumeForm.value = false;
    await refreshProgram();
    actionNotice.value = editingVolumeId.value ? 'Volume details saved.' : 'Draft volume created.';
  } catch (value) {
    volumeError.value = catalogueErrorMessage(value, 'The volume could not be saved.');
  } finally {
    savingVolume.value = false;
  }
}

async function imageDimensions(file: File): Promise<{ width?: number; height?: number }> {
  try {
    const bitmap = await createImageBitmap(file);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  } catch {
    return {};
  }
}

async function uploadCover(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  clearFeedback();
  coverUploading.value = true;
  coverUploadStage.value = 'Checking image…';
  try {
    const dimensions = await imageDimensions(file);
    const parsed = adminProgramMediaUploadRequestSchema.safeParse({
      filename: file.name,
      displayName: `${program.value?.name ?? 'Program'} cover`,
      altText: coverAltText.value,
      contentType: file.type,
      sizeBytes: file.size,
      ...dimensions,
    });
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Check the cover image.');

    coverUploadStage.value = 'Preparing secure upload…';
    const reservation = await $fetch<AdminCatalogueUploadReservation>(
      `/api/admin/programs/${programId}/media/uploads`,
      { method: 'POST', body: parsed.data },
    );
    coverUploadStage.value = 'Uploading to Cloudflare…';
    await uploadCatalogueObject(reservation, file);
    coverUploadStage.value = 'Verifying image…';
    await $fetch(`/api/admin/program-media/${reservation.uploadId}/finalize`, { method: 'POST', body: {} });
    await refreshProgram();
    actionNotice.value = 'The new cover is live in the catalogue record.';
  } catch (value) {
    await refreshProgram();
    actionError.value = catalogueErrorMessage(value, 'The cover could not be uploaded.');
  } finally {
    coverUploading.value = false;
    coverUploadStage.value = '';
  }
}

async function saveCoverMetadata() {
  const cover = activeCover.value;
  if (!cover) return;
  clearFeedback();
  const parsed = adminProgramMediaUpdateRequestSchema.safeParse({
    displayName: cover.displayName,
    altText: coverAltText.value,
  });
  if (!parsed.success) {
    actionError.value = parsed.error.issues[0]?.message ?? 'Check the cover description.';
    return;
  }
  savingMedia.value = true;
  try {
    await $fetch(`/api/admin/program-media/${cover.id}`, { method: 'PATCH', body: parsed.data });
    await refreshProgram();
    actionNotice.value = 'Cover description saved.';
  } catch (value) {
    actionError.value = catalogueErrorMessage(value, 'The cover description could not be saved.');
  } finally {
    savingMedia.value = false;
  }
}

function selectCover() {
  document.getElementById('cover-upload')?.click();
}

function selectPdf(volumeId: number, replaceFileId?: number) {
  const suffix = replaceFileId ? `replace-${replaceFileId}` : `new-${volumeId}`;
  document.getElementById(`pdf-${suffix}`)?.click();
}

async function uploadPdf(event: Event, volume: AdminCatalogueVolume, replaceFile?: AdminCatalogueFile) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  clearFeedback();
  uploadingVolumeId.value = volume.id;
  pdfUploadStage.value = 'Checking PDF…';
  try {
    const displayName = replaceFile?.displayName ?? file.name.replace(/\.pdf$/i, '');
    const sortOrder = replaceFile?.sortOrder ?? volume.files.length;
    const parsed = adminProgramFileUploadRequestSchema.safeParse({
      filename: file.name,
      displayName,
      contentType: file.type,
      sizeBytes: file.size,
      sortOrder,
    });
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Check the PDF.');

    pdfUploadStage.value = 'Preparing secure upload…';
    const reservation = await $fetch<AdminCatalogueUploadReservation>(
      `/api/admin/program-volumes/${volume.id}/files/uploads`,
      { method: 'POST', body: parsed.data },
    );
    pdfUploadStage.value = 'Uploading to private storage…';
    await uploadCatalogueObject(reservation, file);
    pdfUploadStage.value = 'Verifying PDF…';
    await $fetch(`/api/admin/program-files/${reservation.uploadId}/finalize`, {
      method: 'POST',
      body: replaceFile ? { replaceFileId: replaceFile.id } : {},
    });
    await refreshProgram();
    actionNotice.value = replaceFile
      ? `${replaceFile.displayName} was replaced safely. Its history is retained.`
      : 'The PDF is ready for entitled customers.';
  } catch (value) {
    await refreshProgram();
    actionError.value = catalogueErrorMessage(value, 'The PDF could not be uploaded.');
  } finally {
    uploadingVolumeId.value = null;
    pdfUploadStage.value = '';
  }
}

function openFileEditor(file: AdminCatalogueFile) {
  editingFileId.value = file.id;
  Object.assign(fileForm, { displayName: file.displayName, sortOrder: file.sortOrder });
  fileError.value = '';
  showFileForm.value = true;
}

async function saveFile() {
  if (!editingFileId.value) return;
  fileError.value = '';
  const parsed = adminProgramFileUpdateRequestSchema.safeParse({
    displayName: fileForm.displayName,
    sortOrder: Number(fileForm.sortOrder),
  });
  if (!parsed.success) {
    fileError.value = parsed.error.issues[0]?.message ?? 'Check the file details.';
    return;
  }
  savingFile.value = true;
  try {
    await $fetch(`/api/admin/program-files/${editingFileId.value}`, { method: 'PATCH', body: parsed.data });
    showFileForm.value = false;
    await refreshProgram();
    actionNotice.value = 'PDF name and order saved.';
  } catch (value) {
    fileError.value = catalogueErrorMessage(value, 'The PDF details could not be saved.');
  } finally {
    savingFile.value = false;
  }
}

async function setProgramStatus(nextStatus: AdminCatalogueProgramStatus) {
  clearFeedback();
  changingStatus.value = true;
  try {
    await $fetch(`/api/admin/programs/${programId}/status`, {
      method: 'PATCH',
      body: { status: nextStatus },
    });
    await refreshProgram();
    actionNotice.value = nextStatus === 'published'
      ? 'Program published and available to the public catalogue API.'
      : nextStatus === 'archived'
        ? 'Program archived. Existing customer access remains available.'
        : 'Program returned to draft and removed from new purchases.';
  } catch (value) {
    actionError.value = catalogueErrorMessage(value, 'The program status could not be changed.');
  } finally {
    changingStatus.value = false;
  }
}

function requestStatusChange(statusValue: AdminCatalogueProgramStatus) {
  if (statusValue === 'published') {
    void setProgramStatus(statusValue);
    return;
  }
  confirmation.value = {
    title: statusValue === 'archived' ? 'Archive this program?' : 'Return this program to draft?',
    description: statusValue === 'archived'
      ? 'New customers will not be able to purchase it. Existing customer access and sales history will remain.'
      : 'The program will disappear from the public catalogue, but existing customers keep their access.',
    label: statusValue === 'archived' ? 'Archive program' : 'Return to draft',
    color: statusValue === 'archived' ? 'error' : 'warning',
    run: () => setProgramStatus(statusValue),
  };
}

function requestMediaDeactivation(media: AdminCatalogueMedia) {
  confirmation.value = {
    title: 'Deactivate this cover?',
    description: 'Published programs must keep an active cover. Return the program to draft first if this is its only cover.',
    label: 'Deactivate cover',
    color: 'error',
    run: async () => {
      clearFeedback();
      await $fetch(`/api/admin/program-media/${media.id}/deactivate`, { method: 'POST', body: { reason: 'Removed in admin catalogue' } });
      await refreshProgram();
      actionNotice.value = 'Cover deactivated. Its history remains stored.';
    },
  };
}

function requestFileDeactivation(file: AdminCatalogueFile) {
  confirmation.value = {
    title: 'Deactivate this PDF?',
    description: 'Customers will no longer see this file. Published volumes must retain at least one active, ready PDF.',
    label: 'Deactivate PDF',
    color: 'error',
    run: async () => {
      clearFeedback();
      await $fetch(`/api/admin/program-files/${file.id}/deactivate`, { method: 'POST', body: { reason: 'Removed in admin catalogue' } });
      await refreshProgram();
      actionNotice.value = 'PDF deactivated. Its version history remains available here.';
    },
  };
}

async function runConfirmation() {
  const action = confirmation.value;
  if (!action) return;
  confirming.value = true;
  try {
    await action.run();
    confirmation.value = null;
  } catch (value) {
    actionError.value = catalogueErrorMessage(value, 'The requested change could not be completed.');
    confirmation.value = null;
  } finally {
    confirming.value = false;
  }
}

useSeoMeta({
  title: computed(() => `${program.value?.name ?? 'Program'} | Tilana Admin`),
  robots: 'noindex, nofollow',
});
</script>

<template>
  <div class="program-page">
    <div class="page-toolbar">
      <UButton to="/programs" label="All programs" icon="i-lucide-arrow-left" color="neutral" variant="ghost" />
      <div v-if="program" class="toolbar-actions">
        <UBadge :color="catalogueStatusColor(program.status)" variant="subtle" size="lg">
          {{ catalogueStatusLabels[program.status] }}
        </UBadge>
        <UButton label="Preview" icon="i-lucide-eye" color="neutral" variant="soft" to="#program-preview" />
        <UButton
          v-if="program.status === 'draft'"
          label="Publish"
          icon="i-lucide-rocket"
          :disabled="!readyForPublication"
          :loading="changingStatus"
          @click="requestStatusChange('published')"
        />
        <UButton
          v-if="program.status === 'published'"
          label="Unpublish"
          icon="i-lucide-eye-off"
          color="warning"
          variant="soft"
          :loading="changingStatus"
          @click="requestStatusChange('draft')"
        />
        <UButton
          v-if="program.status === 'archived'"
          label="Restore draft"
          icon="i-lucide-archive-restore"
          color="warning"
          variant="soft"
          :loading="changingStatus"
          @click="requestStatusChange('draft')"
        />
        <UButton
          v-if="program.status !== 'archived'"
          label="Archive"
          icon="i-lucide-archive"
          color="error"
          variant="soft"
          :loading="changingStatus"
          @click="requestStatusChange('archived')"
        />
      </div>
    </div>

    <template v-if="status === 'pending' && !program">
      <USkeleton class="h-40 rounded-3xl" />
      <div class="workspace-grid"><USkeleton class="h-96 rounded-3xl" /><USkeleton class="h-96 rounded-3xl" /></div>
    </template>

    <UAlert
      v-else-if="error || !program"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      title="This program could not be loaded"
      description="It may have been removed, or the database and R2 configuration may be unavailable."
    >
      <template #actions><UButton label="Try again" color="error" variant="soft" @click="() => refreshProgram()" /></template>
    </UAlert>

    <template v-else>
      <header class="program-heading">
        <div>
          <p class="eyebrow">Program #{{ program.id }}</p>
          <h1>{{ program.name }}</h1>
          <p>{{ program.headline || 'Complete the marketing details, add a cover and prepare at least one volume.' }}</p>
        </div>
        <dl>
          <div>
            <dt>Gross sales <UTooltip text="Historical value of paid sales, including orders later refunded. Refunds are not deducted here."><UIcon name="i-lucide-circle-help" /></UTooltip></dt>
            <dd>{{ formatCatalogueMoney(program.grossSalesCents) }}</dd>
          </div>
          <div>
            <dt>Paid customers <UTooltip text="Distinct customers with a paid order for any volume in this program. Fully refunded orders are excluded."><UIcon name="i-lucide-circle-help" /></UTooltip></dt>
            <dd>{{ program.buyerCount }}</dd>
          </div>
          <div>
            <dt>Active access <UTooltip text="Customers who can currently access this program. This can be lower than sales after a refund, revocation, or expiry."><UIcon name="i-lucide-circle-help" /></UTooltip></dt>
            <dd>{{ program.accessCount }}</dd>
          </div>
        </dl>
      </header>

      <UAlert v-if="actionNotice" color="success" variant="soft" icon="i-lucide-circle-check" :description="actionNotice" />
      <UAlert v-if="actionError" color="error" variant="soft" icon="i-lucide-circle-alert" :description="actionError">
        <template #actions><UButton label="Dismiss" color="error" variant="ghost" @click="actionError = ''" /></template>
      </UAlert>

      <ProgramPublicationChecklist
        :ready="readyForPublication"
        :pending="publicationStatus === 'pending' && !publicationData"
        :issues="publicationData?.checklist.issues ?? []"
      />

      <section class="workspace-grid">
        <UCard id="program-information" class="editor-card" :ui="{ body: 'p-5 sm:p-7' }">
          <form @submit.prevent="saveProgram">
            <div class="section-heading">
              <div><p class="eyebrow">Marketing details</p><h2>Program information</h2></div>
              <span>Public card content</span>
            </div>
            <div class="field-grid">
              <UFormField label="Program name" required><UInput v-model="programForm.name" size="lg" class="w-full" /></UFormField>
              <UFormField label="URL slug" required help="Changing this changes the future public URL."><UInput v-model="programForm.slug" size="lg" class="w-full" /></UFormField>
              <UFormField label="Card label" help="Use a short, specific customer-facing category."><UInput v-model="programForm.cardLabel" size="lg" class="w-full" /></UFormField>
              <UFormField label="Card colour" help="This controls the public card colours, not its volumes."><CatalogueAccentSelect v-model="programForm.accent" /></UFormField>
              <div class="volume-shortcut full-field">
                <span><UIcon name="i-lucide-layers-3" /></span>
                <div>
                  <strong>{{ program.volumes.length }} {{ program.volumes.length === 1 ? 'volume' : 'volumes' }}</strong>
                  <small>Add Nourish Volume 1, Volume 2 and future releases as separate sellable volumes.</small>
                </div>
                <UButton :label="program.volumes.length ? 'Manage volumes' : 'Add first volume'" icon="i-lucide-arrow-down" color="neutral" variant="soft" to="#program-volumes" />
              </div>
              <UFormField label="Headline" help="Lead with the outcome or transformation this program supports." class="full-field"><UInput v-model="programForm.headline" size="lg" class="w-full" /></UFormField>
              <UFormField label="Description" help="Explain who it is for, what it includes, and why it is useful." class="full-field"><UTextarea v-model="programForm.description" :rows="6" class="w-full" /></UFormField>
              <div v-if="marketingGuidance.length" class="marketing-guidance full-field">
                <span><UIcon name="i-lucide-lightbulb" /></span>
                <div>
                  <strong>Make the public card more useful</strong>
                  <ul><li v-for="guidance in marketingGuidance" :key="guidance">{{ guidance }}</li></ul>
                </div>
              </div>
              <UFormField label="Display order"><UInput v-model.number="programForm.sortOrder" type="number" min="0" step="1" size="lg" class="w-full" /></UFormField>
            </div>
            <div class="section-actions"><UButton type="submit" label="Save details" icon="i-lucide-save" :loading="savingProgram" /></div>
          </form>
        </UCard>

        <div class="side-rail">
          <ProgramCataloguePreview
            :program="program"
            :active-cover="activeCover"
            :published-volumes="publishedVolumes"
            :accent="programForm.accent"
          />

          <aside class="quick-actions-card" aria-labelledby="quick-actions-title">
            <div class="quick-actions-heading">
              <span><UIcon name="i-lucide-zap" /></span>
              <div><p class="eyebrow">Shortcuts</p><h2 id="quick-actions-title">Quick actions</h2></div>
            </div>
            <div class="quick-actions-list">
              <UButton :label="nextVolumeLabel" icon="i-lucide-layers-3" block @click="openCreateVolume" />
              <UButton :label="activeCover ? 'Replace cover' : 'Upload cover'" icon="i-lucide-image-up" color="neutral" variant="soft" block :loading="coverUploading" @click="selectCover" />
              <UButton label="Preview public page" icon="i-lucide-external-link" color="neutral" variant="soft" block :to="publicProgramUrl" target="_blank" rel="noopener noreferrer" />
            </div>
            <p>New volumes open as drafts with the next number, slug, price, and display order already filled in.</p>
          </aside>
        </div>
      </section>

      <ProgramCoverManager
        v-model:alt-text="coverAltText"
        :active-cover="activeCover"
        :uploading="coverUploading"
        :upload-stage="coverUploadStage"
        :saving="savingMedia"
        @select="selectCover"
        @upload="uploadCover"
        @save="saveCoverMetadata"
        @deactivate="requestMediaDeactivation"
      />

      <ProgramVolumeManager
        :volumes="program.volumes"
        :next-volume-label="nextVolumeLabel"
        :uploading-volume-id="uploadingVolumeId"
        :upload-stage="pdfUploadStage"
        @add-volume="openCreateVolume"
        @edit-volume="openEditVolume"
        @upload-pdf="uploadPdf"
        @select-pdf="selectPdf"
        @edit-file="openFileEditor"
        @deactivate-file="requestFileDeactivation"
      />

    </template>

    <UModal v-model:open="showVolumeForm" :title="editingVolumeId ? 'Edit volume' : nextVolumeLabel" :dismissible="!savingVolume">
      <template #body>
        <form class="modal-form" @submit.prevent="saveVolume">
          <div class="field-grid">
            <UFormField label="Volume name" required><UInput v-model="volumeForm.name" size="lg" class="w-full" @blur="fillVolumeSlug" /></UFormField>
            <UFormField label="Checkout slug" required><UInput v-model="volumeForm.slug" size="lg" class="w-full" /></UFormField>
            <UFormField label="Volume number" required><UInput v-model.number="volumeForm.volumeNumber" type="number" min="1" step="1" size="lg" class="w-full" /></UFormField>
            <UFormField label="Price (ZAR)" required><UInput v-model.number="volumeForm.priceRands" type="number" min="0" step="0.01" size="lg" class="w-full"><template #leading><span>R</span></template></UInput></UFormField>
            <UFormField label="Description" class="full-field"><UTextarea v-model="volumeForm.description" :rows="4" class="w-full" /></UFormField>
            <UFormField label="Display order"><UInput v-model.number="volumeForm.sortOrder" type="number" min="0" step="1" size="lg" class="w-full" /></UFormField>
            <UFormField v-if="editingVolumeId" label="Publication"><USwitch v-model="volumeForm.isPublished" label="Published and available for checkout" /></UFormField>
          </div>
          <UAlert v-if="volumeError" color="error" variant="soft" icon="i-lucide-circle-alert" :description="volumeError" />
          <div class="modal-actions"><UButton type="button" label="Cancel" color="neutral" variant="ghost" :disabled="savingVolume" @click="showVolumeForm = false" /><UButton type="submit" label="Save volume" icon="i-lucide-save" :loading="savingVolume" /></div>
        </form>
      </template>
    </UModal>

    <UModal v-model:open="showFileForm" title="Edit PDF details" :dismissible="!savingFile">
      <template #body>
        <form class="modal-form" @submit.prevent="saveFile">
          <UFormField label="Customer-facing name" required><UInput v-model="fileForm.displayName" size="lg" class="w-full" /></UFormField>
          <UFormField label="Display order" help="Lower numbers appear first."><UInput v-model.number="fileForm.sortOrder" type="number" min="0" step="1" size="lg" class="w-full" /></UFormField>
          <UAlert v-if="fileError" color="error" variant="soft" icon="i-lucide-circle-alert" :description="fileError" />
          <div class="modal-actions"><UButton type="button" label="Cancel" color="neutral" variant="ghost" :disabled="savingFile" @click="showFileForm = false" /><UButton type="submit" label="Save PDF" icon="i-lucide-save" :loading="savingFile" /></div>
        </form>
      </template>
    </UModal>

    <AdminConfirmationModal
      v-model:open="confirmationOpen"
      :title="confirmation?.title ?? 'Confirm change'"
      :description="confirmation?.description ?? ''"
      :confirm-label="confirmation?.label ?? 'Confirm'"
      :confirm-color="confirmation?.color ?? 'primary'"
      :loading="confirming"
      @confirm="runConfirmation"
    />
  </div>
</template>

<style scoped>
.program-page { display: grid; gap: 1.25rem; }
.page-toolbar, .toolbar-actions, .section-actions { display: flex; align-items: center; gap: 0.65rem; }
.page-toolbar { min-height: 2.5rem; justify-content: space-between; }
.toolbar-actions { flex-wrap: wrap; justify-content: flex-end; }
.program-heading { display: flex; align-items: end; justify-content: space-between; gap: 2rem; padding: 1.4rem 1.6rem; border: 1px solid var(--color-border); border-radius: 1.8rem; background: radial-gradient(circle at 90% 10%, color-mix(in srgb, var(--sage) 48%, transparent), transparent 28%), color-mix(in srgb, var(--white) 84%, var(--cream)); box-shadow: var(--shadow-sm); }
.eyebrow { margin: 0 0 0.35rem; color: var(--caramel); font-size: 0.62rem; font-weight: 700; letter-spacing: 0.13em; text-transform: uppercase; }
.program-heading h1 { margin: 0; color: var(--ink); font-family: var(--font-heading); font-size: clamp(2.2rem, 4vw, 3.6rem); font-weight: 600; letter-spacing: -0.05em; line-height: 1; }
.program-heading > div > p:last-child { max-width: 48rem; margin: 0.65rem 0 0; font-size: 0.73rem; line-height: 1.6; }
.program-heading dl { display: grid; grid-template-columns: repeat(3, minmax(6rem, 1fr)); gap: 0.6rem; margin: 0; }
.program-heading dl div { min-width: 7rem; padding: 0.8rem; border-radius: 1rem; background: color-mix(in srgb, var(--white) 68%, transparent); }
.program-heading dt { display: flex; align-items: center; gap: 0.3rem; color: var(--ui-text-muted); font-size: 0.52rem; text-transform: uppercase; }
.program-heading dt :deep(svg) { width: 0.72rem; height: 0.72rem; cursor: help; }
.program-heading dd { margin: 0.2rem 0 0; color: var(--ink); font-family: var(--font-heading); font-size: 1.2rem; font-weight: 700; }
.workspace-grid { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(19rem, 0.7fr); gap: 1rem; align-items: start; }
.editor-card { border: 1px solid var(--color-border); border-radius: 1.8rem; background: color-mix(in srgb, var(--white) 82%, var(--cream)); box-shadow: var(--shadow-md); scroll-margin-top: 6rem; }
.section-heading { display: flex; align-items: start; justify-content: space-between; gap: 1rem; }
.section-heading h2 { margin: 0; color: var(--ink); font-family: var(--font-heading); font-size: clamp(1.65rem, 3vw, 2.25rem); line-height: 1.05; }
.section-heading p:last-child { max-width: 46rem; margin: 0.45rem 0 0; font-size: 0.68rem; line-height: 1.55; }
.section-heading > span { padding: 0.45rem 0.65rem; border-radius: 999px; color: var(--caramel); background: var(--sand); font-size: 0.56rem; font-weight: 700; text-transform: uppercase; }
.field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; margin-top: 1.25rem; }
.full-field { grid-column: 1 / -1; }
.editor-card .section-actions { justify-content: flex-end; margin-top: 1.2rem; }
.volume-shortcut { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 0.8rem; padding: 0.85rem; border: 1px solid color-mix(in srgb, var(--sage) 74%, var(--color-border)); border-radius: 1.1rem; background: color-mix(in srgb, var(--sage) 38%, transparent); }
.volume-shortcut > span { display: grid; width: 2.5rem; aspect-ratio: 1; place-items: center; border-radius: 0.8rem; color: var(--ink); background: var(--sage); }
.volume-shortcut > div { display: grid; gap: 0.16rem; }
.volume-shortcut strong { color: var(--ink); font-size: 0.68rem; }
.volume-shortcut small { font-size: 0.58rem; line-height: 1.45; }
.marketing-guidance { display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.85rem; border: 1px solid color-mix(in srgb, var(--caramel) 38%, var(--color-border)); border-radius: 1rem; background: color-mix(in srgb, var(--sand) 65%, transparent); }
.marketing-guidance > span { display: grid; width: 2.25rem; aspect-ratio: 1; flex: none; place-items: center; border-radius: 0.75rem; color: var(--ink); background: var(--terracotta); }
.marketing-guidance strong { color: var(--ink); font-size: 0.68rem; }
.marketing-guidance ul { display: grid; gap: 0.22rem; margin: 0.35rem 0 0; padding-left: 1rem; font-size: 0.6rem; line-height: 1.45; }
.side-rail { position: sticky; top: 5.8rem; display: grid; gap: 1rem; min-width: 0; }
.quick-actions-card { padding: 1.1rem; border: 1px solid color-mix(in srgb, var(--sage) 68%, var(--color-border)); border-radius: 1.5rem; background: linear-gradient(145deg, color-mix(in srgb, var(--sage) 54%, var(--white)), color-mix(in srgb, var(--white) 84%, var(--cream))); box-shadow: var(--shadow-sm); }
.quick-actions-heading { display: flex; align-items: center; gap: 0.7rem; }
.quick-actions-heading > span { display: grid; width: 2.6rem; aspect-ratio: 1; flex: none; place-items: center; border-radius: 0.85rem; color: var(--ink); background: var(--sage); font-size: 1rem; }
.quick-actions-heading h2 { margin: 0; color: var(--ink); font-family: var(--font-heading); font-size: 1.35rem; line-height: 1; }
.quick-actions-list { display: grid; gap: 0.55rem; margin-top: 1rem; }
.quick-actions-card > p { margin: 0.85rem 0 0; color: var(--chocolate); font-size: 0.58rem; line-height: 1.5; }
.modal-form { display: grid; gap: 1rem; }
.modal-form .field-grid { margin-top: 0; }
.modal-actions { display: flex; justify-content: flex-end; gap: 0.65rem; }
@media (max-width: 72rem) { .workspace-grid { grid-template-columns: 1fr; } .side-rail { position: static; grid-template-columns: minmax(0, 1fr) minmax(16rem, 0.55fr); } }
@media (max-width: 52rem) { .program-heading { align-items: stretch; flex-direction: column; } .program-heading dl { grid-template-columns: repeat(3, 1fr); } .side-rail { grid-template-columns: 1fr; } }
@media (max-width: 42rem) {
  .page-toolbar { align-items: stretch; flex-direction: column; }
  .toolbar-actions { justify-content: flex-start; }
  .toolbar-actions > * { flex: 1; justify-content: center; }
  .program-heading dl, .field-grid { grid-template-columns: 1fr; }
  .full-field { grid-column: auto; }
  .section-heading { align-items: stretch; flex-direction: column; }
  .volume-shortcut { grid-template-columns: auto minmax(0, 1fr); }
  .volume-shortcut > :last-child { grid-column: 1 / -1; justify-content: center; }
}
</style>
