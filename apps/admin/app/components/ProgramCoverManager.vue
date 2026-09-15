<script setup lang="ts">
import type { AdminCatalogueMedia } from '../types/catalogue';
import { formatCatalogueFileSize } from '../utils/catalogue';
import { formatAdminDate } from '../utils/format';

defineProps<{
  activeCover: AdminCatalogueMedia | null;
  uploading: boolean;
  uploadStage: string;
  saving: boolean;
}>();

const altText = defineModel<string>('altText', { required: true });
const emit = defineEmits<{
  select: [];
  upload: [event: Event];
  save: [];
  deactivate: [media: AdminCatalogueMedia];
}>();
</script>

<template>
  <section id="program-cover" class="cover-manager">
    <div class="section-heading">
      <div><p class="eyebrow">Public media</p><h2>Program cover</h2><p>JPEG, PNG, WebP or AVIF · maximum 10 MB.</p></div>
      <div class="section-actions">
        <input id="cover-upload" type="file" accept="image/jpeg,image/png,image/webp,image/avif" hidden @change="emit('upload', $event)">
        <UButton
          :label="activeCover ? 'Replace cover' : 'Upload cover'"
          icon="i-lucide-upload"
          :loading="uploading"
          @click="emit('select')"
        />
      </div>
    </div>
    <div v-if="activeCover" class="cover-details">
      <img v-if="activeCover.publicUrl" :src="activeCover.publicUrl" :alt="activeCover.altText">
      <div>
        <UFormField label="Alternative text" help="Describe the image for someone who cannot see it.">
          <UInput v-model="altText" size="lg" class="w-full" />
        </UFormField>
        <p>Version {{ activeCover.version }} · {{ formatCatalogueFileSize(activeCover.sizeBytes) }} · uploaded {{ formatAdminDate(activeCover.createdAt) }}</p>
        <div class="inline-actions">
          <UButton label="Save description" icon="i-lucide-save" color="neutral" variant="soft" :loading="saving" @click="emit('save')" />
          <UButton label="Deactivate" icon="i-lucide-trash-2" color="error" variant="ghost" @click="emit('deactivate', activeCover)" />
        </div>
      </div>
    </div>
    <AdminEmptyState
      v-else
      variant="compact"
      icon="i-lucide-image-plus"
      title="No active cover"
      description="Add one before publishing this program."
    />
    <p v-if="uploadStage" class="upload-stage" role="status"><UIcon name="i-lucide-loader-circle" class="spin" />{{ uploadStage }}</p>
  </section>
</template>

<style scoped>
.cover-manager { padding: clamp(1.25rem, 2.5vw, 2rem); border: 1px solid var(--color-border); border-radius: 1.8rem; background: color-mix(in srgb, var(--white) 82%, var(--cream)); box-shadow: var(--shadow-md); scroll-margin-top: 6rem; }
.section-heading { display: flex; align-items: start; justify-content: space-between; gap: 1rem; }
.section-heading h2 { margin: 0; color: var(--ink); font-family: var(--font-heading); font-size: clamp(1.65rem, 3vw, 2.25rem); line-height: 1.05; }
.section-heading p:last-child { max-width: 46rem; margin: 0.45rem 0 0; font-size: 0.68rem; line-height: 1.55; }
.section-actions, .inline-actions { display: flex; align-items: center; gap: 0.65rem; }
.eyebrow { margin: 0 0 0.35rem; color: var(--caramel); font-size: 0.62rem; font-weight: 700; letter-spacing: 0.13em; text-transform: uppercase; }
.cover-details { display: grid; grid-template-columns: minmax(9rem, 0.28fr) minmax(0, 1fr); gap: 1rem; align-items: center; margin-top: 1rem; padding: 0.8rem; border-radius: 1.2rem; background: color-mix(in srgb, var(--sage) 44%, transparent); }
.cover-details img { width: 100%; height: 7.5rem; border-radius: 0.85rem; object-fit: cover; }
.cover-details p { margin: 0.65rem 0; font-size: 0.61rem; }
.upload-stage { display: flex; align-items: center; gap: 0.45rem; margin: 0.75rem 0 0; color: var(--caramel); font-size: 0.63rem; font-weight: 700; }
.spin { animation: spin 900ms linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 52rem) { .cover-details { grid-template-columns: 1fr; } .cover-details img { height: 10rem; } }
@media (max-width: 42rem) { .section-heading { align-items: stretch; flex-direction: column; } }
@media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
</style>
