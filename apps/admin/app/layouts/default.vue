<script setup lang="ts">
const route = useRoute();
const { user, signOut } = useAdminSession();
const signingOut = ref(false);

const pageTitle = computed(() => String(route.meta.title ?? ''));

async function handleSignOut() {
  signingOut.value = true;
  await signOut();
}
</script>

<template>
  <div class="admin-shell">
    <a href="#main" class="skip-link">Skip to content</a>

    <aside class="sidebar" aria-label="Admin">
      <NuxtLink to="/" class="sidebar-brand" aria-label="Tilana admin, overview">
        <span class="sidebar-logo">Tilana</span>
        <span class="sidebar-label">Admin</span>
      </NuxtLink>

      <nav class="sidebar-nav" aria-label="Main">
        <NuxtLink
          v-for="item in adminNavigation"
          :key="item.to"
          :to="item.to"
          class="nav-link"
          :active-class="item.to === '/' ? undefined : 'is-active'"
          exact-active-class="is-active"
        >
          <UIcon :name="item.icon" class="nav-icon" aria-hidden="true" />
          <span>{{ item.label }}</span>
        </NuxtLink>
      </nav>

      <div class="sidebar-footer">
        <p class="signed-in-as" :title="user?.email">
          {{ user?.email }}
        </p>
        <div class="sidebar-actions">
          <span class="inverse-control">
            <ThemeToggle />
          </span>
          <button type="button" class="sign-out" :disabled="signingOut" @click="handleSignOut">
            <UIcon name="i-lucide-log-out" aria-hidden="true" />
            <span class="sign-out-label">{{ signingOut ? 'Signing out…' : 'Sign out' }}</span>
          </button>
        </div>
      </div>
    </aside>

    <main id="main" class="content" tabindex="-1">
      <header v-if="pageTitle" class="page-header">
        <h1>{{ pageTitle }}</h1>
      </header>
      <slot />
    </main>
  </div>
</template>

<style scoped>
.admin-shell {
  display: grid;
  min-height: 100svh;
  grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
  background: var(--color-background);
}

.skip-link {
  position: fixed;
  z-index: var(--z-toast);
  top: var(--space-3);
  left: var(--space-3);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-pill);
  color: var(--color-on-primary);
  background: var(--color-primary);
  font-weight: var(--weight-semibold);
  transform: translateY(-200%);
}

.skip-link:focus {
  transform: none;
}

/* Sidebar: Soft Black surface in both themes. */
.sidebar {
  position: sticky;
  top: 0;
  display: flex;
  height: 100svh;
  flex-direction: column;
  gap: var(--space-6);
  padding: var(--space-6) var(--space-4);
  color: var(--color-text-inverse);
  background: var(--color-surface-inverse);
  --color-focus: var(--terracotta-400);
}

.sidebar-brand {
  display: grid;
  gap: var(--space-1);
  padding-inline: var(--space-2);
}

.sidebar-logo {
  color: var(--terracotta-400);
  font-family: var(--font-script);
  font-size: 2.25rem;
  line-height: 1;
}

.sidebar-label {
  color: var(--color-text-inverse-muted);
  font-size: var(--text-caption);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-eyebrow);
  text-transform: uppercase;
}

.sidebar-nav {
  display: grid;
  gap: var(--space-1);
}

.nav-link {
  display: flex;
  min-height: var(--control-md);
  align-items: center;
  gap: var(--space-3);
  padding-inline: var(--space-3);
  border-radius: var(--radius-sm);
  color: var(--color-text-inverse);
  font-size: var(--text-body);
  font-weight: var(--weight-medium);
  transition: background-color var(--duration-fast) var(--ease-standard);
}

.nav-link:hover {
  background: rgb(246 228 217 / 8%);
}

/* Active item: terracotta fill with Soft Black text (8.5:1). */
.nav-link.is-active {
  color: var(--color-on-primary);
  background: var(--terracotta-400);
  font-weight: var(--weight-semibold);
}

.nav-icon {
  width: 1.125rem;
  height: 1.125rem;
  flex: none;
}

.sidebar-footer {
  display: grid;
  gap: var(--space-2);
  margin-top: auto;
  padding: var(--space-4) var(--space-2) 0;
  border-top: 1px solid rgb(246 228 217 / 12%);
}

.signed-in-as {
  overflow: hidden;
  margin: 0;
  color: var(--color-text-inverse-muted);
  font-size: var(--text-body-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.inverse-control :deep(button) {
  color: var(--color-text-inverse);
}

.inverse-control :deep(button:hover) {
  background: rgb(246 228 217 / 8%);
}

.sign-out {
  display: inline-flex;
  min-height: var(--control-md);
  align-items: center;
  gap: var(--space-2);
  padding-inline: var(--space-3);
  border: 0;
  border-radius: var(--radius-pill);
  color: var(--color-text-inverse);
  background: transparent;
  font: inherit;
  font-size: var(--text-body-sm);
  font-weight: var(--weight-semibold);
  cursor: pointer;
}

.sign-out:hover {
  background: rgb(246 228 217 / 8%);
}

.sign-out:disabled {
  cursor: progress;
}

.content {
  min-width: 0;
  padding: var(--space-8) clamp(var(--space-4), 3vw, var(--space-8));
  outline: none;
}

.page-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}

h1 {
  margin: 0;
  color: var(--color-text-primary);
  font-family: var(--font-display);
  font-size: var(--text-h1);
  font-weight: var(--weight-regular);
  letter-spacing: var(--tracking-heading);
  line-height: var(--leading-heading);
}

/* Below 48rem the sidebar becomes a top bar. */
@media (max-width: 47.99rem) {
  .admin-shell {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto 1fr;
  }

  .sidebar {
    position: static;
    height: auto;
    flex-flow: row wrap;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
  }

  .sidebar-brand {
    padding: 0;
  }

  .sidebar-logo {
    font-size: 1.85rem;
  }

  .sidebar-label {
    display: none;
  }

  .sidebar-footer {
    margin: 0 0 0 auto;
    padding: 0;
    border: 0;
  }

  .signed-in-as {
    display: none;
  }

  /* Icon-only on small screens; the label stays available to screen readers. */
  .sign-out-label {
    position: absolute;
    overflow: hidden;
    width: 1px;
    height: 1px;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* All sections visible at once: icon above a short label. */
  .sidebar-nav {
    display: grid;
    width: 100%;
    order: 3;
    grid-auto-columns: minmax(0, 1fr);
    grid-auto-flow: column;
    gap: var(--space-1);
  }

  .nav-link {
    min-height: var(--control-lg);
    flex-direction: column;
    justify-content: center;
    gap: var(--space-1);
    padding: var(--space-1);
    font-size: var(--text-caption);
    text-align: center;
  }

  .content {
    padding: var(--space-6) var(--space-4);
  }
}

@media (prefers-reduced-motion: reduce) {
  .nav-link {
    transition: none;
  }
}
</style>
