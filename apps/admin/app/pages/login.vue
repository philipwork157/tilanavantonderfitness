<script setup lang="ts">
import type { AdminSessionResponse } from '@tilana/contracts/admin-auth';

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
          <span>in one calm place.</span>
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
              size="xl"
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
              size="xl"
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
  padding: clamp(1rem, 3vw, 2.5rem);
  background:
    radial-gradient(60rem 40rem at 100% 0%, color-mix(in srgb, var(--terracotta) 22%, transparent), transparent 70%),
    radial-gradient(50rem 36rem at 0% 100%, color-mix(in srgb, var(--sage) 30%, transparent), transparent 70%),
    var(--color-background);
}

.corner-toggle {
  position: absolute;
  top: clamp(1rem, 3vw, 2rem);
  right: clamp(1rem, 3vw, 2rem);
}

.login-shell {
  display: grid;
  width: min(100%, 72rem);
  align-items: center;
  gap: clamp(2.5rem, 7vw, 6rem);
  grid-template-columns: minmax(0, 1.05fr) minmax(20rem, 0.95fr);
}

.welcome-panel {
  max-width: 34rem;
  animation: rise-in var(--motion-slow) var(--ease-out) both;
}

.eyebrow {
  margin: 2.5rem 0 1rem;
  color: var(--caramel);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-heading);
  font-size: clamp(3rem, 5.5vw, 5.25rem);
  font-weight: 600;
  letter-spacing: -0.05em;
  line-height: 0.95;
}

h1 span {
  display: block;
  margin-top: 0.15em;
  color: var(--caramel);
  font-family: var(--font-script);
  font-weight: 400;
  letter-spacing: -0.02em;
}

.welcome-copy {
  max-width: 30rem;
  margin: 1.6rem 0 0;
  color: var(--color-text-muted);
  font-size: clamp(0.95rem, 1.4vw, 1.08rem);
  line-height: 1.7;
}

.form-panel {
  position: relative;
  width: 100%;
  max-width: 30rem;
  justify-self: end;
  padding: clamp(1.5rem, 3.2vw, 2.35rem);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--color-surface) 82%, transparent);
  box-shadow: var(--shadow-md);
  backdrop-filter: blur(16px);
  animation: rise-in var(--motion-slow) 80ms var(--ease-out) both;
}

.form-panel::before {
  position: absolute;
  top: 0;
  right: 14%;
  left: 14%;
  height: 4px;
  border-radius: var(--radius-pill);
  background: linear-gradient(90deg, var(--terracotta), var(--sage));
  content: '';
}

.form-heading {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.lock-mark {
  display: grid;
  width: 3rem;
  aspect-ratio: 1;
  place-items: center;
  border-radius: 50%;
  color: var(--color-text);
  background: var(--color-positive);
  font-size: 1.15rem;
}

.form-heading p {
  margin: 0 0 0.2rem;
  color: var(--caramel);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.form-heading h2 {
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-heading);
  font-size: clamp(1.8rem, 4vw, 2.3rem);
  font-weight: 600;
  letter-spacing: -0.03em;
}

.login-form {
  display: grid;
  gap: 1rem;
}

.security-note {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  margin: 1.15rem 0 0;
  color: color-mix(in srgb, var(--color-text-muted) 75%, transparent);
  font-size: 0.72rem;
}

@keyframes rise-in {
  from {
    opacity: 0;
    transform: translateY(1.25rem);
  }
}

@media (max-width: 58rem) {
  .login-shell {
    width: min(100%, 30rem);
    grid-template-columns: minmax(0, 1fr);
    gap: 2rem;
  }

  .welcome-panel h1,
  .welcome-panel .eyebrow,
  .welcome-copy {
    display: none;
  }

  .welcome-panel {
    text-align: center;
  }

  .form-panel {
    justify-self: stretch;
    max-width: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .welcome-panel,
  .form-panel {
    animation: none;
  }
}
</style>
