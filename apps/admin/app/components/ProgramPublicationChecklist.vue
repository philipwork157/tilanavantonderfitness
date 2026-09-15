<script setup lang="ts">
import type { AdminCataloguePublicationIssue } from '../types/catalogue';

defineProps<{
  ready: boolean;
  pending: boolean;
  issues: AdminCataloguePublicationIssue[];
}>();

function issueTarget(code: string): string {
  if (code === 'missing_cover') return '#program-cover';
  if (code === 'missing_published_volume' || code.startsWith('volume_')) return '#program-volumes';
  return '#program-information';
}
</script>

<template>
  <section class="publication-manager" :class="{ ready }" aria-live="polite">
    <div class="publication-header">
      <div class="publication-copy">
        <span :class="{ ready }"><UIcon :name="ready ? 'i-lucide-badge-check' : 'i-lucide-list-checks'" /></span>
        <div>
          <p class="eyebrow">Publication checklist</p>
          <h2>{{ ready ? 'Ready to publish' : 'Complete your program' }}</h2>
          <p>{{ ready ? 'The public catalogue has everything it needs.' : 'Select an item below to jump directly to the section that needs attention.' }}</p>
        </div>
      </div>
      <UBadge
        v-if="!pending"
        class="publication-state"
        :color="ready ? 'success' : 'error'"
        variant="subtle"
      >
        {{ ready ? 'All requirements complete' : `${issues.length} remaining` }}
      </UBadge>
    </div>
    <USkeleton v-if="pending" class="h-20 rounded-2xl" />
    <ul v-else-if="issues.length" class="issue-list">
      <li v-for="issue in issues" :key="`${issue.code}-${issue.volumeId ?? 'program'}`">
        <a :href="issueTarget(issue.code)">
          <UIcon name="i-lucide-circle-alert" />
          <span>{{ issue.message }}</span>
          <UIcon name="i-lucide-arrow-down-right" />
        </a>
      </li>
    </ul>
    <div v-else class="ready-note">
      <UIcon name="i-lucide-circle-check-big" />
      <span>Cover, marketing copy, published volume, price and private PDF are ready.</span>
    </div>
  </section>
</template>

<style scoped>
.publication-manager { display: grid; gap: 1rem; overflow: hidden; padding: clamp(1.25rem, 2.5vw, 2rem); border: 1px solid color-mix(in srgb, var(--terracotta) 55%, var(--color-border)); border-radius: 1.8rem; background: linear-gradient(115deg, color-mix(in srgb, var(--terracotta) 20%, var(--white)), color-mix(in srgb, var(--white) 86%, var(--cream))); box-shadow: 0 1rem 2.5rem color-mix(in srgb, var(--chocolate) 12%, transparent); }
.publication-manager.ready { border-color: color-mix(in srgb, var(--sage) 78%, var(--color-border)); background: linear-gradient(115deg, color-mix(in srgb, var(--sage) 52%, var(--white)), color-mix(in srgb, var(--white) 86%, var(--cream))); }
.publication-header { display: flex; align-items: center; justify-content: space-between; gap: 1.25rem; }
.publication-copy { display: flex; align-items: center; gap: 1rem; }
.publication-copy > span { display: grid; width: 3.5rem; aspect-ratio: 1; flex: none; place-items: center; border-radius: 1.1rem; color: var(--ink); background: var(--terracotta); font-size: 1.3rem; }
.publication-copy > span.ready { background: var(--sage); }
.publication-copy h2 { margin: 0; color: var(--ink); font-family: var(--font-heading); font-size: clamp(1.65rem, 3vw, 2.25rem); line-height: 1.05; }
.publication-copy p:last-child { max-width: 46rem; margin: 0.45rem 0 0; font-size: 0.68rem; line-height: 1.55; }
.eyebrow { margin: 0 0 0.35rem; color: var(--caramel); font-size: 0.62rem; font-weight: 700; letter-spacing: 0.13em; text-transform: uppercase; }
.publication-state { flex: none; }
.issue-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.55rem; margin: 0; padding: 0; list-style: none; }
.issue-list a, .ready-note { display: flex; align-items: center; gap: 0.55rem; min-height: 2.7rem; padding: 0.72rem 0.8rem; border-radius: 0.9rem; font-size: 0.64rem; }
.issue-list a { color: var(--color-error-700); background: var(--color-error-50); text-decoration: none; transition: background-color 180ms ease, transform 180ms ease; }
.issue-list a > :first-child { flex: none; }
.issue-list a > span { flex: 1; }
.issue-list a > :last-child { flex: none; opacity: 0.7; }
.issue-list a:hover { background: color-mix(in srgb, var(--color-error-50) 72%, var(--terracotta)); transform: translateY(-1px); }
.issue-list a:focus-visible { outline: 2px solid var(--caramel); outline-offset: 2px; }
.ready-note { color: var(--ink); background: color-mix(in srgb, var(--sage) 68%, transparent); }
@media (max-width: 42rem) {
  .publication-header { align-items: flex-start; flex-direction: column; }
  .publication-state { align-self: flex-start; }
  .issue-list { grid-template-columns: 1fr; }
}
</style>
