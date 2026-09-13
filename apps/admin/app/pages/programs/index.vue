<script setup lang="ts">
import { adminProgramCreateRequestSchema } from '@tilana/contracts/catalogue';
import type {
  AdminCatalogueProgram,
  AdminCatalogueProgramsResponse,
} from '../../types/catalogue';
import {
  catalogueErrorMessage,
  catalogueStatusColor,
  catalogueStatusLabels,
  formatCatalogueMoney,
  slugifyCatalogueValue,
} from '../../utils/catalogue';

definePageMeta({ layout: 'dashboard' });

const search = ref('');
const statusFilter = ref('all');
const showCreateForm = ref(false);
const saving = ref(false);
const formError = ref('');
const form = reactive({
  name: '',
  slug: '',
  cardLabel: '',
  headline: '',
  description: '',
  accent: 'reconnect',
  sortOrder: 0,
});

const statusOptions = [
  { label: 'All statuses', value: 'all' },
  { label: 'Drafts', value: 'draft' },
  { label: 'Published', value: 'published' },
  { label: 'Archived', value: 'archived' },
];

const accentOptions = [
  { label: 'Beginner · Terracotta', value: 'beginner' },
  { label: 'Intermediate · Sage', value: 'intermediate' },
  { label: 'Advanced · Caramel', value: 'advanced' },
  { label: 'Reconnect · Terracotta', value: 'reconnect' },
  { label: 'Nourish · Sage', value: 'nourish' },
];

const { data, status, error, refresh } = await useFetch<AdminCatalogueProgramsResponse>(
  '/api/admin/programs',
  { lazy: true },
);

const programs = computed(() => data.value?.programs ?? []);
const filteredPrograms = computed(() => {
  const query = search.value.trim().toLowerCase();
  return programs.value.filter((program) => {
    const matchesStatus = statusFilter.value === 'all' || program.status === statusFilter.value;
    const matchesSearch = !query
      || `${program.name} ${program.slug} ${program.cardLabel ?? ''} ${program.headline ?? ''}`
        .toLowerCase()
        .includes(query);
    return matchesStatus && matchesSearch;
  });
});
const totals = computed(() => ({
  published: programs.value.filter(program => program.status === 'published').length,
  volumes: programs.value.reduce((total, program) => total + program.volumes.length, 0),
  sales: programs.value.reduce((total, program) => total + program.grossSalesCents, 0),
}));

function activeCover(program: AdminCatalogueProgram) {
  return program.media.find(media => media.kind === 'cover' && media.uploadStatus === 'ready' && media.isActive)
    ?? null;
}

function resetForm() {
  Object.assign(form, {
    name: '',
    slug: '',
    cardLabel: '',
    headline: '',
    description: '',
    accent: 'reconnect',
    sortOrder: programs.value.length,
  });
  formError.value = '';
}

function openCreateForm() {
  resetForm();
  showCreateForm.value = true;
}

function fillSlug() {
  if (!form.slug.trim()) form.slug = slugifyCatalogueValue(form.name);
}

async function createProgram() {
  fillSlug();
  formError.value = '';
  const parsed = adminProgramCreateRequestSchema.safeParse({
    slug: form.slug,
    name: form.name,
    cardLabel: form.cardLabel.trim() || null,
    headline: form.headline.trim() || null,
    description: form.description.trim() || null,
    accent: form.accent || null,
    sortOrder: Number(form.sortOrder),
  });
  if (!parsed.success) {
    formError.value = parsed.error.issues[0]?.message ?? 'Please check the program details.';
    return;
  }

  saving.value = true;
  try {
    const response = await $fetch<{ program: AdminCatalogueProgram }>('/api/admin/programs', {
      method: 'POST',
      body: parsed.data,
    });
    showCreateForm.value = false;
    await navigateTo(`/programs/${response.program.id}`);
  } catch (value) {
    formError.value = catalogueErrorMessage(value, 'The program could not be created.');
  } finally {
    saving.value = false;
  }
}

useSeoMeta({ title: 'Programs | Tilana Admin', robots: 'noindex, nofollow' });
</script>

<template>
  <div class="programs-page">
    <section class="page-heading">
      <div>
        <p class="eyebrow">Program catalogue</p>
        <h1>Build, price and publish.</h1>
        <p>Manage the programs customers discover, purchase and access after payment.</p>
      </div>
      <UButton label="New program" icon="i-lucide-plus" size="xl" @click="openCreateForm" />
    </section>

    <section class="catalogue-stats" aria-label="Catalogue overview">
      <article>
        <span><UIcon name="i-lucide-library-big" /></span>
        <div><strong>{{ programs.length }}</strong><p>Programs</p></div>
      </article>
      <article>
        <span><UIcon name="i-lucide-badge-check" /></span>
        <div><strong>{{ totals.published }}</strong><p>Published</p></div>
      </article>
      <article>
        <span><UIcon name="i-lucide-layers-3" /></span>
        <div><strong>{{ totals.volumes }}</strong><p>Sellable volumes</p></div>
      </article>
      <article>
        <span><UIcon name="i-lucide-banknote" /></span>
        <div><strong>{{ formatCatalogueMoney(totals.sales) }}</strong><p>Recorded gross sales</p></div>
      </article>
    </section>

    <section class="program-tools" aria-label="Filter programs">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="Search programs"
        size="lg"
        class="search-input"
      />
      <USelect v-model="statusFilter" :items="statusOptions" value-key="value" size="lg" class="status-select" />
      <UButton
        label="Refresh"
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="soft"
        size="lg"
        :loading="status === 'pending'"
        @click="() => refresh()"
      />
    </section>

    <div v-if="status === 'pending' && !data" class="program-grid" aria-label="Loading programs">
      <USkeleton v-for="item in 3" :key="item" class="h-96 rounded-3xl" />
    </div>

    <UAlert
      v-else-if="error"
      color="error"
      variant="soft"
      icon="i-lucide-database-zap"
      title="Programs could not be loaded"
      description="Check the database and R2 configuration, then try again."
    >
      <template #actions>
        <UButton label="Try again" color="error" variant="soft" @click="() => refresh()" />
      </template>
    </UAlert>

    <section v-else-if="filteredPrograms.length" class="program-grid" aria-label="Programs">
      <article v-for="program in filteredPrograms" :key="program.id" class="program-card">
        <div class="cover-frame" :class="`accent-${program.accent ?? 'default'}`">
          <img
            v-if="activeCover(program)?.publicUrl"
            :src="activeCover(program)?.publicUrl ?? ''"
            :alt="activeCover(program)?.altText ?? ''"
          >
          <span v-else><UIcon name="i-lucide-image-plus" /><small>Cover needed</small></span>
          <UBadge :color="catalogueStatusColor(program.status)" variant="solid" class="status-badge">
            {{ catalogueStatusLabels[program.status] }}
          </UBadge>
        </div>

        <div class="program-copy">
          <div>
            <small>{{ program.cardLabel || 'Card label not added' }}</small>
            <h2>{{ program.name }}</h2>
            <p>{{ program.headline || 'Add a headline before publishing this program.' }}</p>
          </div>
          <dl>
            <div><dt>Volumes</dt><dd>{{ program.volumes.length }}</dd></div>
            <div><dt>Sales</dt><dd>{{ program.salesCount }}</dd></div>
            <div><dt>Access</dt><dd>{{ program.accessCount }}</dd></div>
          </dl>
          <UButton
            :to="`/programs/${program.id}`"
            label="Manage program"
            icon="i-lucide-arrow-right"
            trailing
            block
            size="lg"
          />
        </div>
      </article>
    </section>

    <section v-else class="empty-programs">
      <span><UIcon :name="programs.length ? 'i-lucide-search-x' : 'i-lucide-notebook-tabs'" /></span>
      <h2>{{ programs.length ? 'No matching programs' : 'Create your first program' }}</h2>
      <p>{{ programs.length ? 'Try another search or status.' : 'Start with the program details, then add its cover, volume, price and PDF.' }}</p>
      <UButton v-if="!programs.length" label="Create program" icon="i-lucide-plus" @click="openCreateForm" />
    </section>

    <UModal v-model:open="showCreateForm" title="Create a program" :dismissible="!saving">
      <template #body>
        <form class="program-form" @submit.prevent="createProgram">
          <div class="form-intro">
            <span><UIcon name="i-lucide-sparkles" /></span>
            <div><h2>Start with the essentials</h2><p>Everything remains a private draft until you explicitly publish it.</p></div>
          </div>
          <div class="form-grid">
            <UFormField label="Program name" required>
              <UInput v-model="form.name" placeholder="Reconnect" size="lg" class="w-full" @blur="fillSlug" />
            </UFormField>
            <UFormField label="URL slug" required help="Lowercase letters, numbers and hyphens.">
              <UInput v-model="form.slug" placeholder="reconnect" size="lg" class="w-full" />
            </UFormField>
            <UFormField label="Card label">
              <UInput v-model="form.cardLabel" placeholder="Reconnect · Volume 1" size="lg" class="w-full" />
            </UFormField>
            <UFormField label="Visual accent">
              <USelect v-model="form.accent" :items="accentOptions" value-key="value" size="lg" class="w-full" />
            </UFormField>
            <UFormField label="Headline" class="full-field">
              <UInput v-model="form.headline" placeholder="Reconnect with your pelvic floor." size="lg" class="w-full" />
            </UFormField>
            <UFormField label="Description" class="full-field">
              <UTextarea v-model="form.description" :rows="5" placeholder="Describe the program clearly and warmly." class="w-full" />
            </UFormField>
            <UFormField label="Display order">
              <UInput v-model.number="form.sortOrder" type="number" min="0" step="1" size="lg" class="w-full" />
            </UFormField>
          </div>
          <UAlert v-if="formError" color="error" variant="soft" icon="i-lucide-circle-alert" :description="formError" />
          <div class="form-actions">
            <UButton type="button" label="Cancel" color="neutral" variant="ghost" :disabled="saving" @click="showCreateForm = false" />
            <UButton type="submit" label="Create draft" icon="i-lucide-arrow-right" trailing :loading="saving" />
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.programs-page { display: grid; gap: 1.4rem; }
.page-heading { display: flex; align-items: end; justify-content: space-between; gap: 2rem; }
.page-heading > div { max-width: 52rem; }
.eyebrow { margin: 0 0 0.45rem; color: var(--caramel); font-size: 0.66rem; font-weight: 700; letter-spacing: 0.13em; text-transform: uppercase; }
h1 { margin: 0; color: var(--ink); font-family: var(--font-heading); font-size: clamp(2.2rem, 4vw, 3.7rem); font-weight: 600; letter-spacing: -0.045em; line-height: 1; }
.page-heading p:last-child { margin: 0.8rem 0 0; font-size: 0.76rem; line-height: 1.65; }
.catalogue-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.8rem; }
.catalogue-stats article { display: flex; min-height: 6.3rem; align-items: center; gap: 0.85rem; padding: 1rem; border: 1px solid var(--color-border); border-radius: 1.35rem; background: color-mix(in srgb, var(--white) 80%, var(--cream)); box-shadow: var(--shadow-sm); }
.catalogue-stats article:nth-child(2) { background: color-mix(in srgb, var(--sage) 68%, var(--cream)); }
.catalogue-stats article:nth-child(3) { background: color-mix(in srgb, var(--terracotta) 48%, var(--cream)); }
.catalogue-stats span { display: grid; width: 2.55rem; aspect-ratio: 1; flex: none; place-items: center; border-radius: 0.85rem; color: var(--ink); background: color-mix(in srgb, var(--white) 72%, transparent); font-size: 1rem; }
.catalogue-stats strong { display: block; color: var(--ink); font-family: var(--font-heading); font-size: 1.6rem; line-height: 1; }
.catalogue-stats p { margin: 0.25rem 0 0; font-size: 0.63rem; }
.program-tools { display: flex; gap: 0.7rem; padding: 0.75rem; border: 1px solid var(--color-border); border-radius: 1.35rem; background: color-mix(in srgb, var(--white) 76%, transparent); box-shadow: var(--shadow-sm); }
.search-input { flex: 1; }
.status-select { width: 12rem; }
.program-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; }
.program-card { min-width: 0; overflow: hidden; border: 1px solid var(--color-border); border-radius: 1.8rem; background: color-mix(in srgb, var(--white) 84%, var(--cream)); box-shadow: var(--shadow-md); transition: transform var(--motion-base) var(--ease-out), box-shadow var(--motion-base) var(--ease-out); }
.program-card:hover { box-shadow: var(--shadow-hover); transform: translateY(-0.2rem); }
.cover-frame { position: relative; display: grid; min-height: 12.5rem; place-items: center; overflow: hidden; background: linear-gradient(135deg, var(--terracotta), var(--sand)); }
.cover-frame.accent-intermediate, .cover-frame.accent-nourish { background: linear-gradient(135deg, var(--sage), var(--sand)); }
.cover-frame.accent-advanced { background: linear-gradient(135deg, var(--caramel), var(--terracotta)); }
.cover-frame img { width: 100%; height: 12.5rem; object-fit: cover; }
.cover-frame > span { display: grid; justify-items: center; gap: 0.45rem; color: var(--ink); font-size: 1.7rem; }
.cover-frame small { font-size: 0.62rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
.status-badge { position: absolute; top: 0.8rem; right: 0.8rem; }
.program-copy { display: grid; gap: 1.1rem; padding: 1.25rem; }
.program-copy small { color: var(--caramel); font-size: 0.58rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
.program-copy h2 { margin: 0.4rem 0 0; color: var(--ink); font-family: var(--font-heading); font-size: 1.75rem; line-height: 1; }
.program-copy p { min-height: 2.8rem; margin: 0.5rem 0 0; font-size: 0.68rem; line-height: 1.55; }
.program-copy dl { display: grid; grid-template-columns: repeat(3, 1fr); margin: 0; padding: 0.8rem 0; border-block: 1px solid var(--color-border); }
.program-copy dl div { display: grid; gap: 0.2rem; text-align: center; }
.program-copy dt { color: var(--ui-text-muted); font-size: 0.53rem; text-transform: uppercase; }
.program-copy dd { margin: 0; color: var(--ink); font-size: 0.75rem; font-weight: 700; }
.empty-programs { display: grid; min-height: 22rem; place-items: center; align-content: center; padding: 2rem; border: 1px dashed var(--color-border); border-radius: 2rem; text-align: center; }
.empty-programs > span { display: grid; width: 4rem; aspect-ratio: 1; place-items: center; border-radius: 1.25rem; color: var(--ink); background: var(--sage); font-size: 1.35rem; }
.empty-programs h2 { margin: 1rem 0 0; color: var(--ink); font-family: var(--font-heading); font-size: 1.8rem; }
.empty-programs p { max-width: 34rem; margin: 0.45rem 0 1rem; font-size: 0.72rem; line-height: 1.6; }
.program-form { display: grid; gap: 1.2rem; }
.form-intro { display: flex; align-items: center; gap: 0.9rem; padding: 1rem; border-radius: 1.2rem; background: color-mix(in srgb, var(--sage) 62%, var(--cream)); }
.form-intro > span { display: grid; width: 2.7rem; aspect-ratio: 1; flex: none; place-items: center; border-radius: 0.9rem; color: var(--ink); background: var(--white); }
.form-intro h2, .form-intro p { margin: 0; }
.form-intro h2 { color: var(--ink); font-family: var(--font-heading); font-size: 1.3rem; }
.form-intro p { margin-top: 0.2rem; font-size: 0.66rem; line-height: 1.5; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
.full-field { grid-column: 1 / -1; }
.form-actions { display: flex; justify-content: flex-end; gap: 0.65rem; }
@media (max-width: 70rem) { .catalogue-stats, .program-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 44rem) {
  .page-heading { align-items: stretch; flex-direction: column; gap: 1rem; }
  .program-tools { flex-wrap: wrap; }
  .search-input { min-width: 100%; }
  .status-select { flex: 1; width: auto; }
  .catalogue-stats, .program-grid, .form-grid { grid-template-columns: 1fr; }
  .full-field { grid-column: auto; }
}
@media (prefers-reduced-motion: reduce) { .program-card { transition: none; } }
</style>
