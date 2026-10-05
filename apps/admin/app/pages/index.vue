<script setup lang="ts">
const { user, signOut } = useAdminSession();
const signingOut = ref(false);

async function handleSignOut() {
  signingOut.value = true;
  await signOut();
}

useSeoMeta({ title: 'Tilana Admin', robots: 'noindex, nofollow' });
</script>

<template>
  <div class="admin-shell">
    <header class="admin-header">
      <BrandMark />
      <div class="header-actions">
        <span class="signed-in-as">{{ user?.email }}</span>
        <ThemeToggle />
        <UButton
          label="Sign out"
          icon="i-lucide-log-out"
          color="neutral"
          variant="outline"
          :loading="signingOut"
          @click="handleSignOut"
        />
      </div>
    </header>

    <main class="admin-main">
      <section class="welcome-card" aria-labelledby="welcome-heading">
        <p class="eyebrow">
          Welcome back
        </p>
        <h1 id="welcome-heading">
          You're signed in.
        </h1>
        <p>The dashboard comes next. Programs, sales and customers will appear here as each part is rebuilt.</p>
      </section>
    </main>
  </div>
</template>

<style scoped>
.admin-shell {
  min-height: 100svh;
  background: var(--color-background);
}

.admin-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  max-width: var(--container);
  margin-inline: auto;
  padding: 1.25rem var(--page-pad);
  border-bottom: 1px solid var(--color-border);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.signed-in-as {
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

.admin-main {
  max-width: var(--container);
  margin-inline: auto;
  padding: clamp(2rem, 6vw, 4rem) var(--page-pad);
}

.welcome-card {
  max-width: 44rem;
  padding: clamp(1.5rem, 4vw, 2.5rem);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}

.eyebrow {
  margin: 0;
  color: var(--caramel);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

h1 {
  margin: 0.6rem 0 1rem;
  color: var(--color-text);
  font-family: var(--font-heading);
  font-size: clamp(2rem, 4.5vw, 3rem);
  font-weight: 600;
  line-height: 1.1;
}

p {
  line-height: 1.7;
}

@media (max-width: 34rem) {
  .signed-in-as {
    display: none;
  }
}
</style>
