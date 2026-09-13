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
  formatCatalogueFileSize,
  formatCatalogueMoney,
  slugifyCatalogueValue,
  uploadCatalogueObject,
} from '../../utils/catalogue';

definePageMeta({ layout: 'dashboard' });

const route = useRoute();
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

const programForm = reactive({
  name: '',
  slug: '',
  cardLabel: '',
  headline: '',
  description: '',
  accent: 'reconnect',
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

const accentOptions = [
  { label: 'Beginner · Terracotta', value: 'beginner' },
  { label: 'Intermediate · Sage', value: 'intermediate' },
  { label: 'Advanced · Caramel', value: 'advanced' },
  { label: 'Reconnect · Terracotta', value: 'reconnect' },
  { label: 'Nourish · Sage', value: 'nourish' },
];

watch(program, (value) => {
  if (!value) return;
  Object.assign(programForm, {
    name: value.name,
    slug: value.slug,
    cardLabel: value.cardLabel ?? '',
    headline: value.headline ?? '',
    description: value.description ?? '',
    accent: value.accent ?? 'reconnect',
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
  try {
    await $fetch(`/api/admin/programs/${programId}`, { method: 'PATCH', body: parsed.data });
    await refreshProgram();
    actionNotice.value = 'Program details saved.';
  } catch (value) {
    actionError.value = catalogueErrorMessage(value, 'The program details could not be saved.');
  } finally {
    savingProgram.value = false;
  }
}

function openCreateVolume() {
  const nextNumber = Math.max(0, ...(program.value?.volumes.map(volume => volume.volumeNumber) ?? [])) + 1;
  editingVolumeId.value = null;
  Object.assign(volumeForm, {
    name: `${program.value?.name ?? 'Program'} · Volume ${nextNumber}`,
    slug: `${program.value?.slug ?? 'program'}-volume-${nextNumber}`,
    volumeNumber: nextNumber,
    description: '',
    priceRands: 399,
    sortOrder: program.value?.volumes.length ?? 0,
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

function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'medium',
    timeZone: 'Africa/Johannesburg',
  }).format(new Date(value));
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
          <div><dt>Gross sales</dt><dd>{{ formatCatalogueMoney(program.grossSalesCents) }}</dd></div>
          <div><dt>Purchases</dt><dd>{{ program.salesCount }}</dd></div>
          <div><dt>Current access</dt><dd>{{ program.accessCount }}</dd></div>
        </dl>
      </header>

      <UAlert v-if="actionNotice" color="success" variant="soft" icon="i-lucide-circle-check" :description="actionNotice" />
      <UAlert v-if="actionError" color="error" variant="soft" icon="i-lucide-circle-alert" :description="actionError">
        <template #actions><UButton label="Dismiss" color="error" variant="ghost" @click="actionError = ''" /></template>
      </UAlert>

      <section class="workspace-grid">
        <UCard class="editor-card" :ui="{ body: 'p-5 sm:p-7' }">
          <form @submit.prevent="saveProgram">
            <div class="section-heading">
              <div><p class="eyebrow">Marketing details</p><h2>Program information</h2></div>
              <span>Saved details</span>
            </div>
            <div class="field-grid">
              <UFormField label="Program name" required><UInput v-model="programForm.name" size="lg" class="w-full" /></UFormField>
              <UFormField label="URL slug" required help="Changing this changes the future public URL."><UInput v-model="programForm.slug" size="lg" class="w-full" /></UFormField>
              <UFormField label="Card label"><UInput v-model="programForm.cardLabel" size="lg" class="w-full" /></UFormField>
              <UFormField label="Visual accent"><USelect v-model="programForm.accent" :items="accentOptions" value-key="value" size="lg" class="w-full" /></UFormField>
              <UFormField label="Headline" class="full-field"><UInput v-model="programForm.headline" size="lg" class="w-full" /></UFormField>
              <UFormField label="Description" class="full-field"><UTextarea v-model="programForm.description" :rows="6" class="w-full" /></UFormField>
              <UFormField label="Display order"><UInput v-model.number="programForm.sortOrder" type="number" min="0" step="1" size="lg" class="w-full" /></UFormField>
            </div>
            <div class="section-actions"><UButton type="submit" label="Save details" icon="i-lucide-save" :loading="savingProgram" /></div>
          </form>
        </UCard>

        <aside id="program-preview" class="preview-card" :class="`accent-${program.accent ?? 'default'}`">
          <div class="preview-cover">
            <img v-if="activeCover?.publicUrl" :src="activeCover.publicUrl" :alt="activeCover.altText">
            <span v-else><UIcon name="i-lucide-image" /><small>Cover preview</small></span>
          </div>
          <div class="preview-copy">
            <div><span>{{ program.cardLabel || 'Program label' }}</span><UBadge color="neutral" variant="soft">Preview</UBadge></div>
            <h2>{{ program.name }}</h2>
            <h3>{{ program.headline || 'Your program headline will appear here.' }}</h3>
            <p>{{ program.description || 'Add a concise description to help customers understand what this program offers.' }}</p>
            <div v-if="publishedVolumes.length" class="preview-prices">
              <span v-for="volume in publishedVolumes" :key="volume.id">{{ volume.name }} · {{ formatCatalogueMoney(volume.currentPriceCents) }}</span>
            </div>
            <span v-else class="preview-empty">Publish a prepared volume to show pricing.</span>
          </div>
        </aside>
      </section>

      <section class="management-card cover-manager">
        <div class="section-heading">
          <div><p class="eyebrow">Public media</p><h2>Program cover</h2><p>JPEG, PNG, WebP or AVIF · maximum 10 MB.</p></div>
          <div class="section-actions">
            <input id="cover-upload" type="file" accept="image/jpeg,image/png,image/webp,image/avif" hidden @change="uploadCover">
            <UButton
              :label="activeCover ? 'Replace cover' : 'Upload cover'"
              icon="i-lucide-upload"
              :loading="coverUploading"
              @click="selectCover"
            />
          </div>
        </div>
        <div v-if="activeCover" class="cover-details">
          <img v-if="activeCover.publicUrl" :src="activeCover.publicUrl" :alt="activeCover.altText">
          <div>
            <UFormField label="Alternative text" help="Describe the image for someone who cannot see it.">
              <UInput v-model="coverAltText" size="lg" class="w-full" />
            </UFormField>
            <p>Version {{ activeCover.version }} · {{ formatCatalogueFileSize(activeCover.sizeBytes) }} · uploaded {{ formatDate(activeCover.createdAt) }}</p>
            <div class="inline-actions">
              <UButton label="Save description" icon="i-lucide-save" color="neutral" variant="soft" :loading="savingMedia" @click="saveCoverMetadata" />
              <UButton label="Deactivate" icon="i-lucide-trash-2" color="error" variant="ghost" @click="requestMediaDeactivation(activeCover)" />
            </div>
          </div>
        </div>
        <div v-else class="empty-manager"><span><UIcon name="i-lucide-image-plus" /></span><div><h3>No active cover</h3><p>Add one before publishing this program.</p></div></div>
        <p v-if="coverUploadStage" class="upload-stage" role="status"><UIcon name="i-lucide-loader-circle" class="spin" />{{ coverUploadStage }}</p>
      </section>

      <section class="management-card volume-manager">
        <div class="section-heading">
          <div><p class="eyebrow">Products and delivery</p><h2>Volumes, prices and PDFs</h2><p>Each published volume needs a stable slug, price above zero and at least one ready PDF.</p></div>
          <UButton label="Add volume" icon="i-lucide-plus" @click="openCreateVolume" />
        </div>

        <div v-if="program.volumes.length" class="volume-list">
          <article v-for="volume in program.volumes" :key="volume.id" class="volume-card">
            <header>
              <span class="volume-number">{{ volume.volumeNumber }}</span>
              <div><h3>{{ volume.name }}</h3><p>{{ volume.slug || 'Checkout slug needed' }}</p></div>
              <UBadge :color="volume.isPublished ? 'success' : 'warning'" variant="subtle">{{ volume.isPublished ? 'Published' : 'Draft' }}</UBadge>
              <UButton label="Edit" icon="i-lucide-pencil" color="neutral" variant="soft" @click="openEditVolume(volume)" />
            </header>
            <dl>
              <div><dt>Current price</dt><dd>{{ formatCatalogueMoney(volume.currentPriceCents) }}</dd></div>
              <div><dt>Sales</dt><dd>{{ volume.salesCount }}</dd></div>
              <div><dt>Gross sales</dt><dd>{{ formatCatalogueMoney(volume.grossSalesCents) }}</dd></div>
              <div><dt>Access</dt><dd>{{ volume.accessCount }}</dd></div>
            </dl>

            <div class="files-heading">
              <div><h4>Private PDFs</h4><p>Only customers with active access receive a temporary download link.</p></div>
              <input :id="`pdf-new-${volume.id}`" type="file" accept="application/pdf,.pdf" hidden @change="(event: Event) => uploadPdf(event, volume)">
              <UButton
                label="Add PDF"
                icon="i-lucide-file-up"
                color="neutral"
                variant="soft"
                :loading="uploadingVolumeId === volume.id"
                @click="selectPdf(volume.id)"
              />
            </div>

            <div v-if="volume.files.length" class="file-list">
              <div v-for="file in volume.files" :key="file.id" class="file-row" :class="{ inactive: !file.isActive }">
                <span class="file-icon"><UIcon :name="file.uploadStatus === 'ready' ? 'i-lucide-file-check-2' : file.uploadStatus === 'failed' ? 'i-lucide-file-x-2' : 'i-lucide-file-clock'" /></span>
                <div class="file-copy">
                  <strong>{{ file.displayName }}</strong>
                  <span>v{{ file.version }} · {{ formatCatalogueFileSize(file.sizeBytes) }} · order {{ file.sortOrder }}</span>
                </div>
                <UBadge :color="file.uploadStatus === 'ready' && file.isActive ? 'success' : file.uploadStatus === 'failed' ? 'error' : 'neutral'" variant="subtle">
                  {{ !file.isActive ? 'Inactive' : file.uploadStatus }}
                </UBadge>
                <div v-if="file.isActive && file.uploadStatus === 'ready'" class="file-actions">
                  <input :id="`pdf-replace-${file.id}`" type="file" accept="application/pdf,.pdf" hidden @change="(event: Event) => uploadPdf(event, volume, file)">
                  <UTooltip text="Edit name and display order"><UButton icon="i-lucide-pencil" color="neutral" variant="ghost" aria-label="Edit PDF details" @click="openFileEditor(file)" /></UTooltip>
                  <UTooltip text="Replace this version"><UButton icon="i-lucide-replace" color="neutral" variant="ghost" aria-label="Replace PDF" @click="selectPdf(volume.id, file.id)" /></UTooltip>
                  <UTooltip text="Deactivate this file"><UButton icon="i-lucide-trash-2" color="error" variant="ghost" aria-label="Deactivate PDF" @click="requestFileDeactivation(file)" /></UTooltip>
                </div>
              </div>
            </div>
            <div v-else class="empty-file"><UIcon name="i-lucide-file-plus-2" /><span>No PDF has been uploaded for this volume.</span></div>
            <p v-if="uploadingVolumeId === volume.id" class="upload-stage" role="status"><UIcon name="i-lucide-loader-circle" class="spin" />{{ pdfUploadStage }}</p>
          </article>
        </div>
        <div v-else class="empty-manager"><span><UIcon name="i-lucide-layers-3" /></span><div><h3>No volumes yet</h3><p>Add the first sellable volume, its price and private PDF.</p></div></div>
      </section>

      <section class="management-card publication-manager">
        <div class="publication-copy">
          <span :class="{ ready: readyForPublication }"><UIcon :name="readyForPublication ? 'i-lucide-badge-check' : 'i-lucide-list-checks'" /></span>
          <div>
            <p class="eyebrow">Publication checklist</p>
            <h2>{{ readyForPublication ? 'Ready to publish' : 'A few details still need attention' }}</h2>
            <p>{{ readyForPublication ? 'The public catalogue has everything it needs.' : 'Complete the items below before publishing.' }}</p>
          </div>
        </div>
        <USkeleton v-if="publicationStatus === 'pending' && !publicationData" class="h-28 rounded-2xl" />
        <ul v-else-if="publicationData?.checklist.issues.length" class="issue-list">
          <li v-for="issue in publicationData.checklist.issues" :key="`${issue.code}-${issue.volumeId ?? 'program'}`"><UIcon name="i-lucide-circle-alert" /><span>{{ issue.message }}</span></li>
        </ul>
        <div v-else class="ready-note"><UIcon name="i-lucide-circle-check-big" /><span>Cover, marketing copy, published volume, price and private PDF are ready.</span></div>
      </section>
    </template>

    <UModal v-model:open="showVolumeForm" :title="editingVolumeId ? 'Edit volume' : 'Add volume'" :dismissible="!savingVolume">
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

    <UModal v-model:open="confirmationOpen" :title="confirmation?.title ?? 'Confirm change'" :dismissible="!confirming">
      <template #body>
        <div class="confirmation-body">
          <span><UIcon name="i-lucide-triangle-alert" /></span>
          <p>{{ confirmation?.description }}</p>
          <div><UButton label="Cancel" color="neutral" variant="ghost" :disabled="confirming" @click="confirmation = null" /><UButton :label="confirmation?.label" :color="confirmation?.color" :loading="confirming" @click="runConfirmation" /></div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.program-page { display: grid; gap: 1.25rem; }
.page-toolbar, .toolbar-actions, .section-actions, .inline-actions { display: flex; align-items: center; gap: 0.65rem; }
.page-toolbar { min-height: 2.5rem; justify-content: space-between; }
.toolbar-actions { flex-wrap: wrap; justify-content: flex-end; }
.program-heading { display: flex; align-items: end; justify-content: space-between; gap: 2rem; padding: 1.4rem 1.6rem; border: 1px solid var(--color-border); border-radius: 1.8rem; background: radial-gradient(circle at 90% 10%, color-mix(in srgb, var(--sage) 48%, transparent), transparent 28%), color-mix(in srgb, var(--white) 84%, var(--cream)); box-shadow: var(--shadow-sm); }
.eyebrow { margin: 0 0 0.35rem; color: var(--caramel); font-size: 0.62rem; font-weight: 700; letter-spacing: 0.13em; text-transform: uppercase; }
.program-heading h1 { margin: 0; color: var(--ink); font-family: var(--font-heading); font-size: clamp(2.2rem, 4vw, 3.6rem); font-weight: 600; letter-spacing: -0.05em; line-height: 1; }
.program-heading > div > p:last-child { max-width: 48rem; margin: 0.65rem 0 0; font-size: 0.73rem; line-height: 1.6; }
.program-heading dl { display: grid; grid-template-columns: repeat(3, minmax(6rem, 1fr)); gap: 0.6rem; margin: 0; }
.program-heading dl div { min-width: 7rem; padding: 0.8rem; border-radius: 1rem; background: color-mix(in srgb, var(--white) 68%, transparent); }
.program-heading dt { color: var(--ui-text-muted); font-size: 0.52rem; text-transform: uppercase; }
.program-heading dd { margin: 0.2rem 0 0; color: var(--ink); font-family: var(--font-heading); font-size: 1.2rem; font-weight: 700; }
.workspace-grid { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(19rem, 0.7fr); gap: 1rem; align-items: start; }
.editor-card, .management-card, .preview-card { border: 1px solid var(--color-border); border-radius: 1.8rem; background: color-mix(in srgb, var(--white) 82%, var(--cream)); box-shadow: var(--shadow-md); }
.section-heading { display: flex; align-items: start; justify-content: space-between; gap: 1rem; }
.section-heading h2, .publication-copy h2 { margin: 0; color: var(--ink); font-family: var(--font-heading); font-size: clamp(1.65rem, 3vw, 2.25rem); line-height: 1.05; }
.section-heading p:last-child, .publication-copy p:last-child { max-width: 46rem; margin: 0.45rem 0 0; font-size: 0.68rem; line-height: 1.55; }
.section-heading > span { padding: 0.45rem 0.65rem; border-radius: 999px; color: var(--caramel); background: var(--sand); font-size: 0.56rem; font-weight: 700; text-transform: uppercase; }
.field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; margin-top: 1.25rem; }
.full-field { grid-column: 1 / -1; }
.editor-card .section-actions { justify-content: flex-end; margin-top: 1.2rem; }
.preview-card { position: sticky; top: 5.8rem; overflow: hidden; scroll-margin-top: 6rem; }
.preview-card.accent-intermediate, .preview-card.accent-nourish { --preview-accent: var(--sage); }
.preview-card.accent-advanced { --preview-accent: var(--caramel); }
.preview-card.accent-beginner, .preview-card.accent-reconnect, .preview-card.accent-default { --preview-accent: var(--terracotta); }
.preview-cover { display: grid; min-height: 13rem; place-items: center; overflow: hidden; background: linear-gradient(145deg, var(--preview-accent), var(--sand)); }
.preview-cover img { width: 100%; height: 13rem; object-fit: cover; }
.preview-cover > span { display: grid; justify-items: center; gap: 0.45rem; color: var(--ink); font-size: 1.5rem; }
.preview-cover small { font-size: 0.58rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
.preview-copy { padding: 1.35rem; border-top: 5px solid var(--preview-accent); }
.preview-copy > div:first-child { display: flex; align-items: center; justify-content: space-between; gap: 0.7rem; }
.preview-copy > div:first-child > span { color: var(--caramel); font-size: 0.56rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
.preview-copy h2 { margin: 1rem 0 0; color: var(--ink); font-family: var(--font-heading); font-size: 2rem; line-height: 1; }
.preview-copy h3 { margin: 0.6rem 0 0; color: var(--ink); font-size: 0.78rem; line-height: 1.4; }
.preview-copy p { margin: 0.65rem 0 0; font-size: 0.67rem; line-height: 1.65; }
.preview-prices { display: grid; gap: 0.35rem; margin-top: 1rem; padding-top: 0.8rem; border-top: 1px solid var(--color-border); color: var(--ink); font-size: 0.61rem; font-weight: 700; }
.preview-empty { display: block; margin-top: 1rem; padding-top: 0.8rem; border-top: 1px solid var(--color-border); font-size: 0.6rem; }
.management-card { padding: clamp(1.25rem, 2.5vw, 2rem); }
.cover-details { display: grid; grid-template-columns: minmax(12rem, 0.42fr) minmax(0, 1fr); gap: 1.2rem; align-items: center; margin-top: 1.2rem; padding: 1rem; border-radius: 1.35rem; background: color-mix(in srgb, var(--sage) 44%, transparent); }
.cover-details img { width: 100%; height: 11rem; border-radius: 1rem; object-fit: cover; }
.cover-details p { margin: 0.65rem 0; font-size: 0.61rem; }
.empty-manager { display: flex; align-items: center; gap: 0.9rem; margin-top: 1.2rem; padding: 1rem; border: 1px dashed var(--color-border); border-radius: 1.2rem; }
.empty-manager > span { display: grid; width: 3rem; aspect-ratio: 1; flex: none; place-items: center; border-radius: 0.95rem; color: var(--ink); background: var(--sage); font-size: 1.1rem; }
.empty-manager h3, .empty-manager p { margin: 0; }
.empty-manager h3 { color: var(--ink); font-family: var(--font-heading); font-size: 1.2rem; }
.empty-manager p { margin-top: 0.2rem; font-size: 0.64rem; }
.volume-list { display: grid; gap: 1rem; margin-top: 1.25rem; }
.volume-card { padding: 1rem; border: 1px solid var(--color-border); border-radius: 1.4rem; background: color-mix(in srgb, var(--white) 84%, var(--cream)); }
.volume-card > header { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center; gap: 0.8rem; }
.volume-number { display: grid; width: 2.7rem; aspect-ratio: 1; place-items: center; border-radius: 0.9rem; color: var(--ink); background: var(--terracotta); font-family: var(--font-heading); font-size: 1.2rem; font-weight: 700; }
.volume-card h3, .volume-card h4, .volume-card p { margin: 0; }
.volume-card h3 { color: var(--ink); font-family: var(--font-heading); font-size: 1.3rem; }
.volume-card header p { margin-top: 0.2rem; color: var(--caramel); font-size: 0.58rem; }
.volume-card dl { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.6rem; margin: 1rem 0; }
.volume-card dl div { padding: 0.7rem; border-radius: 0.9rem; background: var(--ui-bg-muted); }
.volume-card dt { color: var(--ui-text-muted); font-size: 0.5rem; text-transform: uppercase; }
.volume-card dd { margin: 0.2rem 0 0; color: var(--ink); font-size: 0.7rem; font-weight: 700; }
.files-heading { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding-top: 0.9rem; border-top: 1px solid var(--color-border); }
.files-heading h4 { color: var(--ink); font-size: 0.72rem; }
.files-heading p { margin-top: 0.2rem; font-size: 0.58rem; }
.file-list { display: grid; gap: 0.45rem; margin-top: 0.75rem; }
.file-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center; gap: 0.7rem; padding: 0.65rem; border: 1px solid var(--color-border); border-radius: 1rem; background: color-mix(in srgb, var(--white) 80%, transparent); }
.file-row.inactive { opacity: 0.58; }
.file-icon { display: grid; width: 2.3rem; aspect-ratio: 1; place-items: center; border-radius: 0.75rem; color: var(--ink); background: var(--sand); }
.file-copy { display: grid; min-width: 0; }
.file-copy strong { overflow: hidden; color: var(--ink); font-size: 0.68rem; text-overflow: ellipsis; white-space: nowrap; }
.file-copy span { margin-top: 0.15rem; font-size: 0.54rem; }
.file-actions { display: flex; gap: 0.2rem; }
.empty-file { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.75rem; padding: 0.75rem; border-radius: 0.9rem; color: var(--ui-text-muted); background: var(--ui-bg-muted); font-size: 0.61rem; }
.upload-stage { display: flex; align-items: center; gap: 0.45rem; margin: 0.75rem 0 0; color: var(--caramel); font-size: 0.63rem; font-weight: 700; }
.spin { animation: spin 900ms linear infinite; }
.publication-manager { display: grid; grid-template-columns: minmax(18rem, 0.72fr) minmax(0, 1.28fr); gap: 1.2rem; align-items: center; }
.publication-copy { display: flex; align-items: center; gap: 1rem; }
.publication-copy > span { display: grid; width: 3.5rem; aspect-ratio: 1; flex: none; place-items: center; border-radius: 1.1rem; color: var(--ink); background: var(--terracotta); font-size: 1.3rem; }
.publication-copy > span.ready { background: var(--sage); }
.issue-list { display: grid; gap: 0.45rem; margin: 0; padding: 0; list-style: none; }
.issue-list li, .ready-note { display: flex; align-items: center; gap: 0.55rem; padding: 0.7rem; border-radius: 0.9rem; font-size: 0.62rem; }
.issue-list li { color: var(--color-error-700); background: var(--color-error-50); }
.ready-note { color: var(--ink); background: color-mix(in srgb, var(--sage) 58%, transparent); }
.modal-form { display: grid; gap: 1rem; }
.modal-form .field-grid { margin-top: 0; }
.modal-actions { display: flex; justify-content: flex-end; gap: 0.65rem; }
.confirmation-body { display: grid; justify-items: center; padding: 0.5rem; text-align: center; }
.confirmation-body > span { display: grid; width: 3.6rem; aspect-ratio: 1; place-items: center; border-radius: 1.1rem; color: var(--ink); background: var(--terracotta); font-size: 1.25rem; }
.confirmation-body p { max-width: 34rem; margin: 1rem 0 1.2rem; font-size: 0.72rem; line-height: 1.65; }
.confirmation-body > div { display: flex; gap: 0.65rem; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 72rem) { .workspace-grid { grid-template-columns: 1fr; } .preview-card { position: static; } .publication-manager { grid-template-columns: 1fr; } }
@media (max-width: 52rem) { .program-heading { align-items: stretch; flex-direction: column; } .program-heading dl { grid-template-columns: repeat(3, 1fr); } .cover-details { grid-template-columns: 1fr; } .volume-card dl { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 42rem) {
  .page-toolbar { align-items: stretch; flex-direction: column; }
  .toolbar-actions { justify-content: flex-start; }
  .toolbar-actions > * { flex: 1; justify-content: center; }
  .program-heading dl, .field-grid { grid-template-columns: 1fr; }
  .full-field { grid-column: auto; }
  .volume-card > header { grid-template-columns: auto minmax(0, 1fr); }
  .volume-card > header > :nth-child(3), .volume-card > header > :nth-child(4) { justify-self: start; }
  .file-row { grid-template-columns: auto minmax(0, 1fr); }
  .file-row > :nth-child(3), .file-row > :nth-child(4) { grid-column: 2; justify-self: start; }
  .section-heading { align-items: stretch; flex-direction: column; }
}
@media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
</style>
