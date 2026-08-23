<script setup lang="ts">
const route = useRoute();
const adminUser = useAdminUser();
const signingOut = ref(false);

const navigation = [
  { label: 'Dashboard', icon: 'i-lucide-layout-dashboard', to: '/dashboard' },
  { label: 'Enquiries', icon: 'i-lucide-inbox', to: '/contacts' },
  { label: 'Clients', icon: 'i-lucide-users', to: '/clients' },
  { label: 'Newsletter', icon: 'i-lucide-mail', to: '/newsletter' },
  { label: 'Programs', icon: 'i-lucide-dumbbell', disabled: true },
  { label: 'Invoices', icon: 'i-lucide-receipt-text', disabled: true },
];

const pageTitle = computed(() => {
  if (route.path === '/contacts') return 'Contact enquiries';
  if (route.path === '/clients') return 'Clients';
  if (route.path === '/newsletter') return 'Newsletter signups';
  return 'Dashboard';
});
const initials = computed(() => {
  if (!adminUser.value) return 'TV';
  return `${adminUser.value.firstName[0] ?? ''}${adminUser.value.lastName[0] ?? ''}`.toUpperCase();
});
const userMenuItems = computed(() => [
  [
    {
      label: adminUser.value
        ? `${adminUser.value.firstName} ${adminUser.value.lastName}`
        : 'Administrator',
      description: adminUser.value?.email,
      avatar: { text: initials.value },
      type: 'label' as const,
    },
  ],
  [
    {
      label: 'Dashboard',
      icon: 'i-lucide-layout-dashboard',
      to: '/dashboard',
    },
    {
      label: 'Contact enquiries',
      icon: 'i-lucide-inbox',
      to: '/contacts',
    },
    {
      label: 'Clients',
      icon: 'i-lucide-users',
      to: '/clients',
    },
    {
      label: 'Newsletter',
      icon: 'i-lucide-mail',
      to: '/newsletter',
    },
  ],
  [
    {
      label: 'Log out',
      icon: 'i-lucide-log-out',
      color: 'error' as const,
      onSelect: () => signOut(),
    },
  ],
]);

async function signOut() {
  signingOut.value = true;
  try {
    await $fetch('/api/auth/logout', { method: 'POST' });
  } finally {
    adminUser.value = null;
    await navigateTo('/login');
    signingOut.value = false;
  }
}
</script>

<template>
  <UDashboardGroup class="admin-dashboard">
    <UDashboardSidebar
      id="admin-sidebar"
      collapsible
      resizable
      :min-size="15"
      :default-size="17"
      :max-size="21"
      :ui="{
        root: 'admin-sidebar',
        header: 'h-24!',
        body: 'gap-3 py-4',
        footer: 'border-t border-default py-4',
      }"
    >
      <template #header="{ collapsed }">
        <NuxtLink to="/dashboard" class="workspace-brand" aria-label="Admin dashboard">
          <span class="workspace-mark">T</span>
          <span v-if="!collapsed" class="workspace-name">
            <strong>Studio</strong>
            <small>Private workspace</small>
          </span>
        </NuxtLink>
      </template>

      <template #default="{ collapsed }">
        <p v-if="!collapsed" class="navigation-label">Workspace</p>
        <UNavigationMenu
          :collapsed="collapsed"
          :items="navigation"
          orientation="vertical"
          highlight
          class="admin-navigation"
        />

        <div v-if="!collapsed" class="sidebar-note">
          <UIcon name="i-lucide-sparkles" aria-hidden="true" />
          <div>
            <strong>Built to grow</strong>
            <span>Clients, programs and invoices are ready for the next phase.</span>
          </div>
        </div>
      </template>

      <template #footer="{ collapsed }">
        <UDropdownMenu
          :items="userMenuItems"
          size="lg"
          :content="{ align: 'start', side: 'top', sideOffset: 10 }"
          :ui="{ content: 'account-menu' }"
        >
          <UButton
            color="neutral"
            variant="ghost"
            block
            :loading="signingOut"
            class="account-trigger"
            :class="{ 'is-collapsed': collapsed }"
            aria-label="Open account menu"
          >
            <UAvatar :text="initials" size="md" class="user-avatar" />
            <div v-if="!collapsed" class="user-copy">
              <strong>{{ adminUser?.firstName }} {{ adminUser?.lastName }}</strong>
              <span>Administrator</span>
            </div>
            <UIcon v-if="!collapsed" name="i-lucide-chevrons-up-down" class="account-chevron" />
          </UButton>
        </UDropdownMenu>
      </template>
    </UDashboardSidebar>

    <UDashboardPanel class="admin-panel">
      <template #header>
        <UDashboardNavbar :title="pageTitle" class="admin-navbar">
          <template #left>
            <UDashboardSidebarCollapse class="hidden lg:inline-flex" />
            <span class="navbar-title">{{ pageTitle }}</span>
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <div class="dashboard-body">
          <slot />
        </div>
      </template>
    </UDashboardPanel>
  </UDashboardGroup>
</template>

<style scoped>
.admin-dashboard {
  --ui-header-height: 4.75rem;
  background: var(--cream);
}

:deep(.admin-sidebar) {
  z-index: 10;
  background:
    radial-gradient(circle at 15% 5%, color-mix(in srgb, var(--terracotta) 22%, transparent), transparent 30%),
    color-mix(in srgb, var(--white) 92%, var(--cream));
  box-shadow: 12px 0 34px rgb(97 70 53 / 7%);
}

.workspace-brand {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.75rem;
  color: var(--ink);
  text-decoration: none;
}

.workspace-mark {
  display: grid;
  width: 2.7rem;
  aspect-ratio: 1;
  flex: none;
  place-items: center;
  border-radius: 1rem;
  color: var(--ink);
  background: linear-gradient(145deg, var(--terracotta), var(--sage));
  box-shadow: var(--shadow-sm);
  font-family: var(--font-heading);
  font-size: 1.45rem;
  font-weight: 700;
}

.workspace-name {
  display: grid;
  line-height: 1.1;
}

.workspace-name strong {
  font-family: var(--font-heading);
  font-size: 1.15rem;
}

.workspace-name small,
.user-copy span {
  margin-top: 0.25rem;
  color: var(--ui-text-muted);
  font-size: 0.68rem;
}

.navigation-label {
  margin: 0.25rem 0 -0.3rem 0.75rem;
  color: var(--caramel);
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.admin-navigation {
  --ui-primary: var(--caramel);
}

:deep(.admin-navigation a),
:deep(.admin-navigation button) {
  min-height: 2.75rem;
  border-radius: 0.9rem;
  font-size: 0.75rem;
  font-weight: 600;
}

:deep(.admin-navigation a[aria-current='page']) {
  color: var(--ink);
  background: color-mix(in srgb, var(--terracotta) 38%, transparent);
  box-shadow: inset 3px 0 0 var(--caramel);
}

.sidebar-note {
  display: flex;
  gap: 0.7rem;
  margin-top: auto;
  padding: 1rem;
  border: 1px solid var(--color-border);
  border-radius: 1.25rem;
  color: var(--chocolate);
  background: color-mix(in srgb, var(--sage) 45%, transparent);
}

.sidebar-note > :first-child {
  flex: none;
  margin-top: 0.12rem;
  color: var(--caramel);
}

.sidebar-note div {
  display: grid;
  gap: 0.25rem;
}

.sidebar-note strong {
  color: var(--ink);
  font-size: 0.76rem;
}

.sidebar-note span {
  font-size: 0.66rem;
  line-height: 1.55;
}

.account-trigger {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: 3.25rem;
  align-items: center;
  justify-content: flex-start;
  gap: 0.65rem;
  padding: 0.4rem;
  border-radius: 1rem;
  text-align: left;
}

.account-trigger:hover {
  background: color-mix(in srgb, var(--terracotta) 18%, transparent);
}

.account-trigger.is-collapsed {
  justify-content: center;
}

.user-avatar {
  flex: none;
  color: var(--ink);
  background: var(--terracotta);
}

.user-copy {
  display: grid;
  min-width: 0;
  flex: 1;
}

.user-copy strong {
  overflow: hidden;
  color: var(--ink);
  font-size: 0.73rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-chevron {
  flex: none;
  color: var(--ui-text-muted);
}

:deep(.account-menu) {
  min-width: 14rem;
  border-color: var(--color-border);
  border-radius: 1rem;
  background: color-mix(in srgb, var(--white) 96%, var(--cream));
  box-shadow: var(--shadow-md);
}

.admin-panel {
  min-width: 0;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--cream) 86%, white), var(--cream));
}

.admin-navbar {
  position: relative;
  z-index: 5;
  background: color-mix(in srgb, var(--cream) 82%, transparent);
  backdrop-filter: blur(14px);
}

.navbar-title {
  overflow: hidden;
  color: var(--ink);
  font-size: 0.82rem;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard-body {
  width: 100%;
  max-width: 92rem;
  margin-inline: auto;
}

</style>
