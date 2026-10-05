<script setup lang="ts">
const open = ref(false);

const links = computed(() =>
  adminNavigation.map(item => ({ ...item, exact: item.to === '/' })),
);
</script>

<template>
  <UDashboardGroup unit="rem">
    <a href="#main-content" class="skip-link">Skip to content</a>

    <UDashboardSidebar
      id="admin"
      v-model:open="open"
      collapsible
      resizable
      :default-size="15"
      :min-size="13"
      :max-size="20"
      class="admin-sidebar"
      :ui="{ footer: 'lg:border-t lg:border-default' }"
    >
      <template #header="{ collapsed }">
        <NuxtLink to="/" class="sidebar-brand" :class="{ collapsed }" aria-label="Tilana admin, overview">
          <span class="sidebar-logo">{{ collapsed ? 'T' : 'Tilana' }}</span>
          <span v-if="!collapsed" class="sidebar-label">Admin</span>
        </NuxtLink>
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu
          :collapsed="collapsed"
          :items="links"
          orientation="vertical"
          color="neutral"
          tooltip
          class="admin-nav"
        />
      </template>

      <template #footer="{ collapsed }">
        <AdminUserMenu :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>
</template>

<style>
/* Not scoped: the sidebar also renders in a slideover on mobile. */
.admin-sidebar {
  background: var(--color-surface);
}

.sidebar-brand {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  min-width: 0;
}

.sidebar-brand.collapsed {
  justify-content: center;
  width: 100%;
}

.sidebar-logo {
  color: var(--color-text-accent);
  font-family: var(--font-script);
  font-size: 2rem;
  line-height: 1;
}

.sidebar-label {
  color: var(--color-text-muted);
  font-size: var(--text-caption);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-eyebrow);
  text-transform: uppercase;
}

/* Current page: soft terracotta fill with dark text (never terracotta text, 1.8:1). */
.admin-nav [data-slot='link'][aria-current='page'] {
  color: var(--color-text-primary);
}

.admin-nav [data-slot='link'][aria-current='page']::before {
  background-color: var(--color-primary-subtle);
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
</style>
