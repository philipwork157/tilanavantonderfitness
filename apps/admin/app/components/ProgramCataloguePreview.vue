<script setup lang="ts">
import type {
  AdminCatalogueMedia,
  AdminCatalogueProgram,
  AdminCatalogueVolume,
} from '../types/catalogue';
import { formatCatalogueMoney } from '../utils/catalogue';

defineProps<{
  program: AdminCatalogueProgram;
  activeCover: AdminCatalogueMedia | null;
  publishedVolumes: AdminCatalogueVolume[];
  accent: string;
}>();
</script>

<template>
  <aside id="program-preview" class="preview-card" :class="`accent-${accent || 'terracotta'}`">
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
</template>

<style scoped>
.preview-card { overflow: hidden; border: 1px solid var(--color-border); border-radius: 1.8rem; background: color-mix(in srgb, var(--white) 82%, var(--cream)); box-shadow: var(--shadow-md); scroll-margin-top: 6rem; }
.preview-card.accent-sage, .preview-card.accent-intermediate, .preview-card.accent-nourish { --preview-accent: var(--sage); }
.preview-card.accent-caramel, .preview-card.accent-advanced { --preview-accent: var(--caramel); }
.preview-card.accent-terracotta, .preview-card.accent-beginner, .preview-card.accent-reconnect, .preview-card.accent-default { --preview-accent: var(--terracotta); }
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
</style>
