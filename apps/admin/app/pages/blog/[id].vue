<script setup lang="ts">
import { BLOG_CATEGORIES, slugify, type BlogCategory } from '@tilana/contracts/blog';

const route = useRoute();
const id = Number(route.params.id);
const toast = useToast();

const { data, error } = await useFetch(`/api/blog-posts/${id}`);
if (error.value) {
  throw createError({ statusCode: error.value.statusCode ?? 404, statusMessage: 'Post not found.', fatal: true });
}

type Post = NonNullable<typeof data.value>['post'];
const post = ref<Post>(data.value!.post);

/** Editable copy. Dates are edited as yyyy-mm-dd in South African time. */
function toForm(source: Post) {
  return {
    title: source.title,
    slug: source.slug,
    excerpt: source.excerpt,
    category: source.category as BlogCategory,
    bodyMarkdown: source.bodyMarkdown,
    coverImageAlt: source.coverImageAlt ?? '',
    closingLine: source.closingLine ?? '',
    quoteText: source.quoteText ?? '',
    quoteCitation: source.quoteCitation ?? '',
    publishedOn: source.publishedAt
      ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg' }).format(new Date(source.publishedAt))
      : '',
  };
}

const form = reactive(toForm(post.value));
const saved = ref(JSON.stringify(form));
const dirty = computed(() => JSON.stringify(form) !== saved.value);
const isPublished = computed(() => post.value.status === 'published');

useSeoMeta({ title: () => `${form.title || 'Post'} | Tilana Admin`, robots: 'noindex, nofollow' });

const categoryItems = BLOG_CATEGORIES.map(value => ({ label: value, value }));
const toolbarItems = [
  [
    { kind: 'heading', level: 2, icon: 'i-lucide-heading-2', tooltip: { text: 'Heading' } },
    { kind: 'heading', level: 3, icon: 'i-lucide-heading-3', tooltip: { text: 'Small heading' } },
  ],
  [
    { kind: 'mark', mark: 'bold', icon: 'i-lucide-bold', tooltip: { text: 'Bold' } },
    { kind: 'mark', mark: 'italic', icon: 'i-lucide-italic', tooltip: { text: 'Italic' } },
    { kind: 'link', icon: 'i-lucide-link', tooltip: { text: 'Link' } },
  ],
  [
    { kind: 'bulletList', icon: 'i-lucide-list', tooltip: { text: 'Bullet list' } },
    { kind: 'orderedList', icon: 'i-lucide-list-ordered', tooltip: { text: 'Numbered list' } },
    { kind: 'blockquote', icon: 'i-lucide-text-quote', tooltip: { text: 'Quote' } },
  ],
  [
    { kind: 'undo', icon: 'i-lucide-undo-2', tooltip: { text: 'Undo' } },
    { kind: 'redo', icon: 'i-lucide-redo-2', tooltip: { text: 'Redo' } },
  ],
];

function errorMessage(caught: unknown, fallback: string) {
  return (caught as { data?: { statusMessage?: string } }).data?.statusMessage ?? fallback;
}

function payload() {
  return {
    title: form.title,
    slug: form.slug,
    excerpt: form.excerpt,
    category: form.category,
    bodyMarkdown: form.bodyMarkdown,
    coverImageAlt: form.coverImageAlt,
    closingLine: form.closingLine,
    quoteText: form.quoteText,
    quoteCitation: form.quoteCitation,
    // Midday in South Africa keeps the chosen calendar day in every timezone.
    publishedAt: form.publishedOn ? `${form.publishedOn}T12:00:00+02:00` : null,
  };
}

function applyServerPost(next: Post) {
  post.value = next;
  Object.assign(form, toForm(next));
  saved.value = JSON.stringify(form);
}

const saving = ref(false);
async function save(options: { quiet?: boolean } = {}) {
  saving.value = true;
  try {
    const result = await $fetch(`/api/blog-posts/${id}`, { method: 'PUT', body: payload() });
    applyServerPost(result.post);
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

const changingStatus = ref(false);
async function setStatus(status: 'draft' | 'published') {
  changingStatus.value = true;
  try {
    if (dirty.value && !(await save({ quiet: true }))) return;
    const result = await $fetch(`/api/blog-posts/${id}/status`, { method: 'POST', body: { status } });
    applyServerPost(result.post);
    toast.add({
      title: status === 'published' ? 'Published' : 'Moved to drafts',
      description: status === 'published' ? 'It appears on the website after the next site update.' : 'It is no longer shown on the website after the next site update.',
      icon: status === 'published' ? 'i-lucide-globe' : 'i-lucide-file-pen',
    });
  }
  catch (caught) {
    toast.add({ title: 'Not published yet', description: errorMessage(caught, 'Please try again.'), color: 'error', icon: 'i-lucide-circle-alert' });
  }
  finally {
    changingStatus.value = false;
  }
}

const fileInput = ref<HTMLInputElement | null>(null);
const uploading = ref(false);
async function uploadCover(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  (event.target as HTMLInputElement).value = '';
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    toast.add({ title: 'Photo too large', description: 'Please choose a photo smaller than 10 MB.', color: 'error' });
    return;
  }
  uploading.value = true;
  try {
    const body = new FormData();
    body.append('file', file);
    const result = await $fetch(`/api/blog-posts/${id}/cover`, { method: 'POST', body });
    post.value = result.post;
    toast.add({ title: 'Cover photo updated', icon: 'i-lucide-image' });
  }
  catch (caught) {
    toast.add({ title: 'Upload failed', description: errorMessage(caught, 'Please try another photo.'), color: 'error', icon: 'i-lucide-circle-alert' });
  }
  finally {
    uploading.value = false;
  }
}

async function removeCover() {
  uploading.value = true;
  try {
    const result = await $fetch(`/api/blog-posts/${id}/cover`, { method: 'DELETE' });
    post.value = result.post;
  }
  finally {
    uploading.value = false;
  }
}

const deleteOpen = ref(false);
const deleting = ref(false);
async function deletePost() {
  deleting.value = true;
  try {
    await $fetch(`/api/blog-posts/${id}`, { method: 'DELETE' });
    await navigateTo({ path: '/blog', query: { deleted: '1' } });
  }
  catch (caught) {
    toast.add({ title: 'Not deleted', description: errorMessage(caught, 'Please try again.'), color: 'error' });
  }
  finally {
    deleting.value = false;
  }
}

onBeforeRouteLeave(() => {
  if (dirty.value && !window.confirm('You have unsaved changes. Leave without saving?')) return false;
});
</script>

<template>
  <AdminPage id="blog-post" :title="form.title || 'Untitled post'">
    <template #actions>
      <UBadge
        :label="isPublished ? 'Published' : 'Draft'"
        color="neutral"
        variant="subtle"
        class="max-sm:hidden"
        :class="{ 'badge-live': isPublished }"
      />
      <UButton
        label="Save"
        icon="i-lucide-save"
        color="neutral"
        variant="outline"
        :ui="{ label: 'max-sm:sr-only' }"
        :loading="saving"
        :disabled="!dirty"
        @click="save()"
      />
      <UButton
        v-if="!isPublished"
        label="Publish"
        icon="i-lucide-globe"
        :loading="changingStatus"
        @click="setStatus('published')"
      />
      <UButton
        v-else
        label="Unpublish"
        icon="i-lucide-eye-off"
        color="neutral"
        variant="ghost"
        :ui="{ label: 'max-sm:sr-only' }"
        :loading="changingStatus"
        @click="setStatus('draft')"
      />
    </template>

    <div class="back-row">
      <UButton to="/blog" label="All posts" icon="i-lucide-arrow-left" color="neutral" variant="link" />
      <span v-if="dirty" class="unsaved">Unsaved changes</span>
    </div>

    <div class="editor-grid">
      <div class="main-column">
        <section class="panel">
          <UFormField label="Title" name="title" required>
            <UInput v-model="form.title" size="xl" maxlength="160" class="title-input" />
          </UFormField>
          <UFormField label="Summary" name="excerpt" required help="Shown on the blog cards and in Google results. One or two sentences.">
            <UTextarea v-model="form.excerpt" :rows="2" autoresize maxlength="300" />
          </UFormField>
        </section>

        <section class="panel" aria-labelledby="body-heading">
          <h2 id="body-heading" class="panel-title">
            Post
          </h2>
          <p class="panel-hint">
            The first letter of the first paragraph becomes the large decorative letter on the website.
          </p>
          <UEditor
            v-slot="{ editor }"
            v-model="form.bodyMarkdown"
            content-type="markdown"
            :image="false"
            :starter-kit="{ codeBlock: false, strike: false, underline: false }"
            placeholder="Start writing…"
            class="body-editor"
          >
            <UEditorToolbar :editor="editor" :items="toolbarItems" class="body-toolbar" />
          </UEditor>
        </section>

        <section class="panel" aria-labelledby="ending-heading">
          <h2 id="ending-heading" class="panel-title">
            Ending
          </h2>
          <UFormField label="Closing line" name="closingLine" help="Shown in the green box above “With love, Tilana”. Leave empty to show only the signature.">
            <UTextarea v-model="form.closingLine" :rows="2" autoresize maxlength="300" />
          </UFormField>
          <div class="quote-fields">
            <UFormField label="Quote" name="quoteText" help="Optional, for example a Bible verse. Shown in the terracotta block at the end.">
              <UTextarea v-model="form.quoteText" :rows="2" autoresize maxlength="500" />
            </UFormField>
            <UFormField label="Quote source" name="quoteCitation">
              <UInput v-model="form.quoteCitation" placeholder="Proverbs 31:25" maxlength="120" />
            </UFormField>
          </div>
          <p class="panel-hint">
            Every post also ends with the standard “Please note” health disclaimer.
          </p>
        </section>
      </div>

      <aside class="side-column">
        <section class="panel" aria-labelledby="cover-heading">
          <h2 id="cover-heading" class="panel-title">
            Cover photo
          </h2>
          <div class="cover" :class="{ empty: !post.coverImageUrl }">
            <img v-if="post.coverImageUrl" :src="post.coverImageUrl" :alt="form.coverImageAlt">
            <UIcon v-else name="i-lucide-image" class="cover-icon" />
          </div>
          <input
            ref="fileInput"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            class="sr-only"
            @change="uploadCover"
          >
          <div class="cover-actions">
            <UButton
              :label="post.coverImageUrl ? 'Replace photo' : 'Upload photo'"
              icon="i-lucide-upload"
              color="neutral"
              variant="outline"
              :loading="uploading"
              @click="fileInput?.click()"
            />
            <UButton
              v-if="post.coverImageUrl"
              label="Remove"
              color="neutral"
              variant="ghost"
              :disabled="uploading"
              @click="removeCover"
            />
          </div>
          <p class="panel-hint">
            JPG, PNG or WebP up to 10 MB. Portrait photos look best.
          </p>
          <UFormField label="Photo description" name="coverImageAlt" help="Describe the photo for people using screen readers.">
            <UTextarea v-model="form.coverImageAlt" :rows="2" autoresize maxlength="250" />
          </UFormField>
        </section>

        <section class="panel" aria-labelledby="settings-heading">
          <h2 id="settings-heading" class="panel-title">
            Settings
          </h2>
          <UFormField label="Category" name="category">
            <USelect v-model="form.category" :items="categoryItems" class="w-full" />
          </UFormField>
          <UFormField label="Publish date" name="publishedOn" :help="isPublished ? undefined : 'Leave empty to use the day you publish.'">
            <UInput v-model="form.publishedOn" type="date" />
          </UFormField>
          <UFormField label="Web address" name="slug" :help="isPublished ? 'Changing this breaks links people already shared.' : undefined">
            <UInput v-model="form.slug" maxlength="120" :ui="{ base: 'ps-14', leading: 'pointer-events-none' }">
              <template #leading>
                <span class="slug-prefix">/blog/</span>
              </template>
            </UInput>
          </UFormField>
          <UButton
            v-if="form.slug !== slugify(form.title)"
            label="Match the title"
            color="neutral"
            variant="link"
            size="sm"
            class="slug-reset"
            @click="form.slug = slugify(form.title)"
          />
        </section>

        <section class="panel danger" aria-labelledby="danger-heading">
          <h2 id="danger-heading" class="panel-title">
            Delete
          </h2>
          <p class="panel-hint">
            Removes the post and its cover photo for good.
          </p>
          <UButton label="Delete post" icon="i-lucide-trash-2" color="error" variant="outline" @click="deleteOpen = true" />
        </section>
      </aside>
    </div>

    <UModal v-model:open="deleteOpen" :title="`Delete “${post.title}”?`" description="The post and its cover photo will be removed. This can't be undone.">
      <template #footer>
        <div class="modal-actions">
          <UButton label="Keep post" color="neutral" variant="outline" @click="deleteOpen = false" />
          <UButton label="Delete post" color="error" :loading="deleting" @click="deletePost" />
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

.editor-grid {
  display: grid;
  align-items: start;
  gap: var(--space-6);
  grid-template-columns: minmax(0, 1fr) 20rem;
}

.main-column,
.side-column {
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

.panel-title {
  margin: 0;
  color: var(--color-text-primary);
  font-size: var(--text-h6);
  font-weight: var(--weight-semibold);
}

.panel-hint {
  margin: calc(var(--space-2) * -1) 0 0;
  color: var(--color-text-muted);
  font-size: var(--text-body-sm);
}

.title-input :deep(input) {
  font-family: var(--font-display);
  font-size: 1.5rem;
}

.body-editor {
  min-height: 24rem;
  padding: var(--space-4);
  border: var(--border-width-field) solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface-elevated);
}

.body-editor:focus-within {
  outline: var(--border-width-focus) solid var(--color-focus);
  outline-offset: 2px;
}

.body-toolbar {
  position: sticky;
  z-index: 1;
  top: 0;
  margin: calc(var(--space-4) * -1) calc(var(--space-4) * -1) var(--space-4);
  padding: var(--space-2);
  border-bottom: 1px solid var(--color-border);
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  background: var(--color-surface);
}

.body-editor :deep(.ProseMirror) {
  min-height: 20rem;
  color: var(--color-text-primary);
  font-size: 1rem;
  line-height: var(--leading-relaxed);
  outline: none;
}

.quote-fields {
  display: grid;
  gap: var(--space-4);
  grid-template-columns: minmax(0, 1fr) 12rem;
}

.cover {
  display: grid;
  overflow: hidden;
  aspect-ratio: 4 / 5;
  place-items: center;
  border-radius: var(--radius-md);
  background: var(--color-surface-subtle);
}

.cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-icon {
  color: var(--color-text-muted);
  font-size: 2rem;
}

.cover-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.slug-prefix {
  color: var(--color-text-muted);
  font-size: var(--text-body-sm);
}

.slug-reset {
  justify-self: start;
  margin-top: calc(var(--space-3) * -1);
  padding-inline: 0;
}

.badge-live {
  color: var(--color-text-primary);
  background: var(--color-accent-subtle);
}

.modal-actions {
  display: flex;
  width: 100%;
  justify-content: flex-end;
  gap: var(--space-2);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

@media (max-width: 63.99rem) {
  .editor-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 47.99rem) {
  .quote-fields {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
