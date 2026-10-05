<script setup lang="ts">
import type { AdminSessionResponse } from '@tilana/contracts/admin-auth';

definePageMeta({ layout: false });

const route = useRoute();
const { user } = useAdminSession();

const email = ref('');
const password = ref('');
const showPassword = ref(false);
const submitting = ref(false);
const errorMessage = ref('');

async function signIn() {
  errorMessage.value = '';
  submitting.value = true;

  try {
    const session = await $fetch<AdminSessionResponse>('/api/auth/login', {
      method: 'POST',
      body: { email: email.value, password: password.value },
    });
    user.value = session.user;
    password.value = '';
    await navigateTo(safeRedirectPath(route.query.redirect));
  }
  catch (error) {
    const data = (error as { data?: { statusMessage?: string } }).data;
    errorMessage.value = data?.statusMessage || 'Sign in failed. Please try again.';
  }
  finally {
    submitting.value = false;
  }
}

useSeoMeta({ title: 'Sign in | Tilana Admin', robots: 'noindex, nofollow' });
</script>

<template>
  <main class="login-page">
    <section class="login-shell">
      <div class="welcome-panel">
        <BrandMark />
        <p class="eyebrow">
          Private workspace
        </p>
        <h1>
          Everything you need,
          <em>in one calm place.</em>
        </h1>
        <p class="welcome-copy">
          Manage programs, sales and website updates with confidence.
        </p>
      </div>

      <div class="form-panel">
        <div class="form-heading">
          <span class="lock-mark" aria-hidden="true">
            <UIcon name="i-lucide-lock-keyhole" />
          </span>
          <div>
            <p>Welcome back</p>
            <h2>Sign in</h2>
          </div>
        </div>

        <form class="login-form" novalidate @submit.prevent="signIn">
          <UFormField label="Email address" name="email" required>
            <UInput
              v-model="email"
              type="email"
              autocomplete="username"
              placeholder="you@example.com"
              icon="i-lucide-mail"
              size="lg"
              :disabled="submitting"
              required
            />
          </UFormField>

          <UFormField label="Password" name="password" required>
            <UInput
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              placeholder="Enter your password"
              icon="i-lucide-key-round"
              size="lg"
              :disabled="submitting"
              required
            >
              <template #trailing>
                <UButton
                  color="neutral"
                  variant="link"
                  size="sm"
                  :icon="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                  :aria-label="showPassword ? 'Hide password' : 'Show password'"
                  :aria-pressed="showPassword"
                  @click="showPassword = !showPassword"
                />
              </template>
            </UInput>
          </UFormField>

          <AppButton label="Sign in" type="submit" :loading="submitting" block />

          <div aria-live="polite">
            <UAlert
              v-if="errorMessage"
              color="error"
              variant="soft"
              icon="i-lucide-circle-alert"
              :description="errorMessage"
            />
          </div>
        </form>

        <p class="security-note">
          <UIcon name="i-lucide-shield-check" aria-hidden="true" />
          Private access only.
        </p>
      </div>
    </section>

    <div class="corner-toggle">
      <ThemeToggle />
    </div>
  </main>
</template>

<style scoped>
.login-page {
  position: relative;
  display: grid;
  min-height: 100svh;
  place-items: center;
  padding: var(--space-6);
  background: var(--color-background);
}

.corner-toggle {
  position: absolute;
  top: var(--space-4);
  right: var(--space-4);
}

.login-shell {
  display: grid;
  width: min(100%, 68rem);
  align-items: center;
  gap: clamp(var(--space-10), 7vw, var(--space-24));
  grid-template-columns: minmax(0, 1.05fr) minmax(20rem, 0.95fr);
}

.welcome-panel {
  max-width: 32rem;
  animation: rise-in var(--duration-slow) var(--ease-out) both;
}

.eyebrow {
  margin: var(--space-10) 0 var(--space-4);
  color: var(--color-text-secondary);
  font-size: var(--text-eyebrow);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-eyebrow);
  text-transform: uppercase;
}

h1 {
  margin: 0;
  color: var(--color-text-primary);
  font-family: var(--font-display);
  font-size: clamp(2.75rem, 2rem + 2.6vw, 4.25rem);
  font-weight: var(--weight-regular);
  letter-spacing: var(--tracking-display);
  line-height: var(--leading-tight);
}

h1 em {
  display: block;
  color: var(--color-text-accent);
}

.welcome-copy {
  max-width: 30rem;
  margin: var(--space-6) 0 0;
  color: var(--color-text-secondary);
  font-size: var(--text-body-lg);
  line-height: var(--leading-body);
}

.form-panel {
  width: 100%;
  max-width: 26rem;
  justify-self: end;
  padding: var(--space-8);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface-elevated);
  box-shadow: var(--shadow-md);
  animation: rise-in var(--duration-slow) 60ms var(--ease-out) both;
}

.form-heading {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}

.lock-mark {
  display: grid;
  width: var(--control-lg);
  aspect-ratio: 1;
  place-items: center;
  border-radius: var(--radius-pill);
  color: var(--color-on-accent);
  background: var(--color-accent);
  font-size: 1.1rem;
}

.form-heading p {
  margin: 0 0 var(--space-1);
  color: var(--color-text-secondary);
  font-size: var(--text-caption);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-eyebrow);
  text-transform: uppercase;
}

.form-heading h2 {
  margin: 0;
  color: var(--color-text-primary);
  font-family: var(--font-display);
  font-size: var(--text-h2);
  font-weight: var(--weight-regular);
  line-height: var(--leading-heading);
}

.login-form {
  display: grid;
  gap: var(--space-4);
}

.security-note {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  margin: var(--space-5) 0 0;
  color: var(--color-text-muted);
  font-size: var(--text-caption);
}

@keyframes rise-in {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
}

@media (max-width: 58rem) {
  .login-shell {
    width: min(100%, 26rem);
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-8);
  }

  .welcome-panel {
    text-align: center;
  }

  .welcome-panel h1,
  .welcome-panel .eyebrow,
  .welcome-copy {
    display: none;
  }

  .form-panel {
    max-width: none;
    justify-self: stretch;
    padding: var(--space-6);
  }
}

@media (prefers-reduced-motion: reduce) {
  .welcome-panel,
  .form-panel {
    animation: none;
  }
}
</style>
