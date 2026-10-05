<script setup lang="ts">
defineProps<{ collapsed?: boolean }>();

const { user, signOut } = useAdminSession();

const name = computed(() =>
  [user.value?.firstName, user.value?.lastName].filter(Boolean).join(' ') || user.value?.email || 'Account',
);

// "Tilana" + "van Tonder" -> "TT": first name and last word of the surname.
const initials = computed(() => {
  const first = user.value?.firstName?.trim()[0] ?? user.value?.email?.[0] ?? '?';
  const last = user.value?.lastName?.trim().split(/\s+/).pop()?.[0] ?? '';
  return (first + last).toUpperCase();
});

const items = computed(() => [
  [{
    type: 'label' as const,
    label: name.value,
    description: user.value?.email,
    avatar: { text: initials.value, alt: name.value },
    ui: { itemDescription: 'whitespace-normal break-all' },
  }],
  [{ label: 'Log out', icon: 'i-lucide-log-out', onSelect: () => signOut() }],
]);
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'center', collisionPadding: 12 }"
    :ui="{ content: collapsed ? 'w-60' : 'w-(--reka-dropdown-menu-trigger-width) min-w-56' }"
  >
    <UButton
      :label="collapsed ? undefined : name"
      :trailing-icon="collapsed ? undefined : 'i-lucide-chevrons-up-down'"
      :avatar="{ text: initials, alt: name }"
      :aria-label="`Account menu for ${name}`"
      color="neutral"
      variant="ghost"
      block
      :square="collapsed"
      class="data-[state=open]:bg-elevated"
      :ui="{ trailingIcon: 'text-dimmed' }"
    />
  </UDropdownMenu>
</template>
