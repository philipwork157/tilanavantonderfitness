<script setup lang="ts">
defineProps<{
  id: string;
  title: string;
}>();
</script>

<template>
  <UDashboardPanel :id="id">
    <template #header>
      <UDashboardNavbar :title="title" :ui="{ title: 'admin-page-title' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <slot name="actions" />
          <ThemeToggle />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div id="main-content" tabindex="-1" class="admin-page-body">
        <slot />
      </div>
    </template>
  </UDashboardPanel>
</template>

<style>
.admin-page-title {
  color: var(--color-text-primary);
  font-family: var(--font-display);
  font-size: var(--text-h3);
  font-weight: var(--weight-regular);
}

.admin-page-body {
  outline: none;
}
</style>
