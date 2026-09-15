<script setup lang="ts">
import type {
  AdminCatalogueFile,
  AdminCatalogueVolume,
} from '../types/catalogue';
import {
  formatCatalogueFileSize,
  formatCatalogueMoney,
} from '../utils/catalogue';

defineProps<{
  volumes: AdminCatalogueVolume[];
  nextVolumeLabel: string;
  uploadingVolumeId: number | null;
  uploadStage: string;
}>();

const emit = defineEmits<{
  'add-volume': [];
  'edit-volume': [volume: AdminCatalogueVolume];
  'upload-pdf': [event: Event, volume: AdminCatalogueVolume, file?: AdminCatalogueFile];
  'select-pdf': [volumeId: number, replaceFileId?: number];
  'edit-file': [file: AdminCatalogueFile];
  'deactivate-file': [file: AdminCatalogueFile];
}>();
</script>

<template>
  <section id="program-volumes" class="volume-manager">
    <div class="section-heading">
      <div>
        <p class="eyebrow">Products and delivery</p>
        <h2>Program volumes</h2>
        <p>Create as many volumes as needed. Each has its own checkout slug, price, publication status and private PDFs.</p>
      </div>
      <UButton :label="nextVolumeLabel" icon="i-lucide-plus" @click="emit('add-volume')" />
    </div>

    <div v-if="volumes.length" class="volume-list">
      <article v-for="volume in volumes" :key="volume.id" class="volume-card">
        <header>
          <span class="volume-number">V{{ volume.volumeNumber }}</span>
          <div><h3>{{ volume.name }}</h3><p>{{ volume.slug || 'Checkout slug needed' }}</p></div>
          <UBadge :color="volume.isPublished ? 'success' : 'warning'" variant="subtle">{{ volume.isPublished ? 'Published' : 'Draft' }}</UBadge>
          <UButton label="Edit" icon="i-lucide-pencil" color="neutral" variant="soft" @click="emit('edit-volume', volume)" />
        </header>
        <dl>
          <div><dt>Current price</dt><dd>{{ formatCatalogueMoney(volume.currentPriceCents) }}</dd></div>
          <div><dt>Paid customers</dt><dd>{{ volume.buyerCount }}</dd></div>
          <div><dt>Gross sales</dt><dd>{{ formatCatalogueMoney(volume.grossSalesCents) }}</dd></div>
          <div><dt>Active access</dt><dd>{{ volume.accessCount }}</dd></div>
        </dl>

        <div class="files-heading">
          <div><h4>Private PDFs</h4><p>Only customers with active access receive a temporary download link.</p></div>
          <input :id="`pdf-new-${volume.id}`" type="file" accept="application/pdf,.pdf" hidden @change="emit('upload-pdf', $event, volume)">
          <UButton
            label="Add PDF"
            icon="i-lucide-file-up"
            color="neutral"
            variant="soft"
            :loading="uploadingVolumeId === volume.id"
            @click="emit('select-pdf', volume.id)"
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
              <input :id="`pdf-replace-${file.id}`" type="file" accept="application/pdf,.pdf" hidden @change="emit('upload-pdf', $event, volume, file)">
              <UTooltip text="Edit name and display order"><UButton icon="i-lucide-pencil" color="neutral" variant="ghost" aria-label="Edit PDF details" @click="emit('edit-file', file)" /></UTooltip>
              <UTooltip text="Replace this version"><UButton icon="i-lucide-replace" color="neutral" variant="ghost" aria-label="Replace PDF" @click="emit('select-pdf', volume.id, file.id)" /></UTooltip>
              <UTooltip text="Deactivate this file"><UButton icon="i-lucide-trash-2" color="error" variant="ghost" aria-label="Deactivate PDF" @click="emit('deactivate-file', file)" /></UTooltip>
            </div>
          </div>
        </div>
        <div v-else class="empty-file"><UIcon name="i-lucide-file-plus-2" /><span>No PDF has been uploaded for this volume.</span></div>
        <p v-if="uploadingVolumeId === volume.id" class="upload-stage" role="status"><UIcon name="i-lucide-loader-circle" class="spin" />{{ uploadStage }}</p>
      </article>
    </div>
    <AdminEmptyState
      v-else
      variant="compact"
      icon="i-lucide-layers-3"
      title="No volumes yet"
      description="Add Volume 1 now. You can return later to add Volume 2 and future releases."
    />
  </section>
</template>

<style scoped>
.volume-manager { padding: clamp(1.25rem, 2.5vw, 2rem); border: 1px solid var(--color-border); border-radius: 1.8rem; background: color-mix(in srgb, var(--white) 82%, var(--cream)); box-shadow: var(--shadow-md); scroll-margin-top: 6rem; }
.section-heading { display: flex; align-items: start; justify-content: space-between; gap: 1rem; }
.section-heading h2 { margin: 0; color: var(--ink); font-family: var(--font-heading); font-size: clamp(1.65rem, 3vw, 2.25rem); line-height: 1.05; }
.section-heading p:last-child { max-width: 46rem; margin: 0.45rem 0 0; font-size: 0.68rem; line-height: 1.55; }
.eyebrow { margin: 0 0 0.35rem; color: var(--caramel); font-size: 0.62rem; font-weight: 700; letter-spacing: 0.13em; text-transform: uppercase; }
.volume-list { display: grid; gap: 1rem; margin-top: 1.25rem; }
.volume-card { padding: 1rem; border: 1px solid var(--color-border); border-radius: 1.4rem; background: color-mix(in srgb, var(--white) 84%, var(--cream)); }
.volume-card > header { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center; gap: 0.8rem; }
.volume-number { display: grid; width: 2.7rem; aspect-ratio: 1; place-items: center; border-radius: 0.9rem; color: var(--ink); background: var(--terracotta); font-family: var(--font-heading); font-size: 0.95rem; font-weight: 700; }
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
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 52rem) { .volume-card dl { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 42rem) {
  .section-heading { align-items: stretch; flex-direction: column; }
  .volume-card > header { grid-template-columns: auto minmax(0, 1fr); }
  .volume-card > header > :nth-child(3), .volume-card > header > :nth-child(4) { justify-self: start; }
  .file-row { grid-template-columns: auto minmax(0, 1fr); }
  .file-row > :nth-child(3), .file-row > :nth-child(4) { grid-column: 2; justify-self: start; }
}
@media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
</style>
