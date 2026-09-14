<script setup lang="ts">
import { ApiReference } from '@scalar/api-reference';
import '@scalar/api-reference/style.css';

definePageMeta({ layout: 'dashboard' });

const colorMode = useColorMode();
const configuration = computed(() => ({
  url: '/api/admin/openapi',
  layout: 'modern' as const,
  theme: 'none' as const,
  forceDarkModeState: colorMode.value === 'dark' ? 'dark' as const : 'light' as const,
  hideTestRequestButton: true,
  hideDarkModeToggle: true,
  showDeveloperTools: 'never' as const,
  showOperationId: true,
  modelsSectionLabel: 'Schemas',
  withDefaultFonts: false,
  telemetry: false,
  agent: { disabled: true },
  customCss: `
    .light-mode {
      --scalar-color-1: #0f0e13;
      --scalar-color-2: #614635;
      --scalar-color-3: #a87e63;
      --scalar-color-accent: #a87e63;
      --scalar-background-1: #fffaf7;
      --scalar-background-2: #f6e4d9;
      --scalar-background-3: #e0c3ae;
      --scalar-background-accent: #c9d2b3;
      --scalar-border-color: rgba(168, 126, 99, 0.28);
    }
    .dark-mode {
      --scalar-color-1: #fff7f1;
      --scalar-color-2: #d8c0b2;
      --scalar-color-3: #c28e70;
      --scalar-color-accent: #dda986;
      --scalar-background-1: #171317;
      --scalar-background-2: #241c21;
      --scalar-background-3: #3a2b30;
      --scalar-background-accent: #667255;
      --scalar-border-color: rgba(194, 142, 112, 0.3);
    }
    .scalar-app { --scalar-radius: 14px; }
  `,
}));

useSeoMeta({
  title: 'API Documentation | Tilana Admin',
  description: 'Private API reference for the Tilana platform.',
  robots: 'noindex, nofollow',
});
</script>

<template>
  <div class="api-docs-page">
    <header class="api-docs-heading">
      <div class="api-docs-copy">
        <span><UIcon name="i-lucide-braces" /></span>
        <div>
          <p>Developer tools</p>
          <h1>Platform APIs</h1>
          <small>Browse 51 documented endpoints across the public website, admin portal, customer access, catalogue, newsletter, and payments.</small>
        </div>
      </div>
      <div class="api-docs-actions">
        <UBadge color="success" variant="subtle" icon="i-lucide-shield-check">Admin only</UBadge>
        <UButton
          label="Open OpenAPI JSON"
          icon="i-lucide-file-json-2"
          color="neutral"
          variant="soft"
          to="/api/admin/openapi"
          target="_blank"
        />
      </div>
    </header>

    <UAlert
      color="warning"
      variant="soft"
      icon="i-lucide-lock-keyhole"
      title="Reference mode"
      description="Request execution is disabled to prevent accidental changes to clients, payments, programs, files, and newsletter campaigns. Authentication and security requirements are still documented for every endpoint."
    />

    <section class="reference-shell" aria-label="Scalar API reference">
      <ClientOnly>
        <ApiReference :configuration="configuration" />
        <template #fallback>
          <div class="reference-loading">
            <UIcon name="i-lucide-loader-circle" />
            <span>Loading API documentation...</span>
          </div>
        </template>
      </ClientOnly>
    </section>
  </div>
</template>

<style scoped>
.api-docs-page {
  display: grid;
  gap: 1rem;
}

.api-docs-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  padding: clamp(1.2rem, 2.5vw, 1.8rem);
  border: 1px solid var(--color-border);
  border-radius: 1.8rem;
  background:
    radial-gradient(circle at 88% 12%, color-mix(in srgb, var(--sage) 58%, transparent), transparent 32%),
    color-mix(in srgb, var(--white) 86%, var(--cream));
  box-shadow: var(--shadow-sm);
}

.api-docs-copy {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 1rem;
}

.api-docs-copy > span {
  display: grid;
  width: 3.5rem;
  aspect-ratio: 1;
  flex: none;
  place-items: center;
  border-radius: 1.1rem;
  color: var(--ink);
  background: linear-gradient(145deg, var(--terracotta), var(--sage));
  font-size: 1.3rem;
}

.api-docs-copy p,
.api-docs-copy h1,
.api-docs-copy small {
  margin: 0;
}

.api-docs-copy p {
  color: var(--caramel);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

.api-docs-copy h1 {
  margin-top: 0.25rem;
  color: var(--ink);
  font-family: var(--font-heading);
  font-size: clamp(2rem, 4vw, 3.2rem);
  line-height: 1;
}

.api-docs-copy small {
  display: block;
  max-width: 48rem;
  margin-top: 0.55rem;
  color: var(--chocolate);
  font-size: 0.7rem;
  line-height: 1.6;
}

.api-docs-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 0.65rem;
}

.reference-shell {
  min-height: 48rem;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 1.8rem;
  background: var(--white);
  box-shadow: var(--shadow-md);
}

.reference-shell :deep(.scalar-app) {
  min-height: 48rem;
}

.reference-loading {
  display: flex;
  min-height: 30rem;
  align-items: center;
  justify-content: center;
  gap: 0.65rem;
  color: var(--chocolate);
  font-size: 0.75rem;
}

.reference-loading :first-child {
  animation: spin 900ms linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 54rem) {
  .api-docs-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .api-docs-actions {
    width: 100%;
    flex-wrap: wrap;
  }
}

@media (max-width: 36rem) {
  .api-docs-copy {
    align-items: flex-start;
  }

  .api-docs-copy > span {
    width: 3rem;
  }

  .api-docs-actions > :last-child {
    width: 100%;
    justify-content: center;
  }
}

@media (prefers-reduced-motion: reduce) {
  .reference-loading :first-child { animation: none; }
}
</style>
