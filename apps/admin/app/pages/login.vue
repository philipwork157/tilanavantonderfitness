<script setup lang="ts">
const email = ref('');
const password = ref('');
const showPassword = ref(false);
const formMessage = ref('');
const submitting = ref(false);
const adminUser = useAdminUser();

async function handleSubmit() {
  formMessage.value = '';
  submitting.value = true;

  try {
    const session = await $fetch('/api/auth/login', {
      method: 'POST',
      body: { email: email.value, password: password.value },
    });
    adminUser.value = session.user;
    await navigateTo('/dashboard');
  } catch (error) {
    const response = error as { data?: { statusMessage?: string; message?: string } };
    formMessage.value = response.data?.statusMessage || response.data?.message || 'Sign in failed. Please try again.';
  } finally {
    submitting.value = false;
  }
}

useSeoMeta({
  title: 'Sign in | Tilana Admin',
  description: 'Sign in to manage Tilana van Tonder website content.',
  robots: 'noindex, nofollow',
});
</script>

<template>
  <main class="login-page">
    <div class="ambient ambient-one" aria-hidden="true" />
    <div class="ambient ambient-two" aria-hidden="true" />

    <section class="login-shell">
      <div class="welcome-panel">
        <p class="eyebrow">
          Private workspace
        </p>
        <h1>
          Everything you need,<br>
          <span>in one calm place.</span>
        </h1>
        <p class="welcome-copy">
          Manage articles, programs and website updates with confidence.
        </p>
      </div>

      <div class="form-panel">
        <div class="form-heading">
          <span class="lock-mark" aria-hidden="true">
            <UIcon name="i-lucide-lock-keyhole" />
          </span>
          <div>
            <p>Welcome back</p>
            <h2>Sign in.</h2>
          </div>
        </div>

        <form class="login-form" @submit.prevent="handleSubmit">
          <UFormField label="Email address" name="email" required>
            <UInput
              v-model="email"
              type="email"
              autocomplete="email"
              placeholder="you@example.com"
              icon="i-lucide-mail"
              size="xl"
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
              required
            >
              <template #trailing>
                <UButton
                  color="neutral"
                  variant="link"
                  size="sm"
                  :icon="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                  :aria-label="showPassword ? 'Hide password' : 'Show password'"
                  @click="showPassword = !showPassword"
                />
              </template>
            </UInput>
          </UFormField>

          <AppButton label="Sign in" type="submit" :loading="submitting" block />

          <UAlert
            v-if="formMessage"
            color="error"
            variant="soft"
            icon="i-lucide-circle-alert"
            :description="formMessage"
          />
        </form>

        <p class="security-note">
          <UIcon name="i-lucide-shield-check" aria-hidden="true" />
          Private access only.
        </p>
      </div>
    </section>
  </main>
</template>

<style scoped>
.login-page {
  position: relative;
  isolation: isolate;
  display: grid;
  width: 100%;
  height: 100svh;
  min-height: 0;
  overflow: hidden;
  padding: clamp(1rem, 3vw, 2.5rem);
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--cream) 94%, transparent), var(--cream)),
    var(--cream);
}

.login-shell {
  position: relative;
  z-index: 1;
  display: grid;
  width: min(100%, 78rem);
  height: 100%;
  min-height: 0;
  align-items: center;
  gap: clamp(2.5rem, 7vw, 6rem);
  margin-inline: auto;
  grid-template-columns: minmax(0, 1.05fr) minmax(22rem, 0.95fr);
}

.welcome-panel {
  max-width: 35rem;
  animation: welcome-in 680ms var(--ease-out) both;
}

.eyebrow {
  margin: 0 0 1.1rem;
  color: var(--caramel);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  color: var(--ink);
  font-family: var(--font-heading);
  font-size: clamp(3.3rem, 5.8vw, 5.7rem);
  font-weight: 600;
  letter-spacing: -0.055em;
  line-height: 0.92;
}

h1 span {
  display: block;
  margin-top: 0.12em;
  color: var(--caramel);
  font-family: var(--font-script);
  font-weight: 400;
  letter-spacing: -0.025em;
}

.welcome-copy {
  max-width: 31rem;
  margin: 1.7rem 0 0;
  font-size: clamp(0.95rem, 1.4vw, 1.08rem);
  line-height: 1.7;
}

.form-panel {
  position: relative;
  width: 100%;
  max-width: 34rem;
  min-width: 0;
  justify-self: end;
  padding: clamp(1.5rem, 3.2vw, 2.35rem);
  border: 1px solid var(--color-border);
  border-radius: clamp(1.7rem, 4vw, 2.4rem);
  background: color-mix(in srgb, var(--white) 78%, transparent);
  box-shadow: var(--shadow-md);
  backdrop-filter: blur(18px);
  animation: form-in 720ms var(--ease-out) both;
}

.form-panel::before {
  position: absolute;
  top: 0;
  right: 12%;
  left: 12%;
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
  color: var(--ink);
  background: var(--sage);
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
  color: var(--ink);
  font-family: var(--font-heading);
  font-size: clamp(1.8rem, 4vw, 2.4rem);
  font-weight: 600;
  letter-spacing: -0.03em;
}

.login-form {
  display: grid;
  gap: 1rem;
}

.form-options {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  color: var(--chocolate);
  font-size: 0.68rem;
}

.security-note {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  margin: 1.15rem 0 0;
  color: color-mix(in srgb, var(--chocolate) 72%, transparent);
  font-size: 0.65rem;
  text-align: center;
}

.ambient {
  position: absolute;
  z-index: -1;
  border-radius: 50%;
  filter: blur(1px);
  pointer-events: none;
}

.ambient-one {
  top: -8rem;
  right: -5rem;
  width: 28rem;
  aspect-ratio: 1;
  background: color-mix(in srgb, var(--terracotta) 34%, transparent);
  animation: ambient 8s ease-in-out infinite;
}

.ambient-two {
  bottom: -12rem;
  left: -8rem;
  width: 34rem;
  aspect-ratio: 1;
  background: color-mix(in srgb, var(--sage) 46%, transparent);
  animation: ambient 10s 600ms ease-in-out infinite reverse;
}

@keyframes form-in {
  from {
    opacity: 0;
    transform: translateY(2rem) scale(0.98);
  }
}

@keyframes welcome-in {
  from {
    opacity: 0;
    transform: translateX(-1.5rem);
  }
}

@keyframes ambient {
  50% {
    transform: translate3d(-1rem, 1.3rem, 0) scale(1.05);
  }
}

@media (max-width: 58rem) {
  .login-shell {
    width: min(100%, 34rem);
    grid-template-columns: minmax(0, 1fr);
  }

  .welcome-panel {
    display: none;
  }

  .form-panel {
    justify-self: stretch;
  }
}

@media (max-width: 34rem) {
  .login-page {
    padding: 1rem;
  }

  .form-panel {
    padding: 1.35rem;
  }
}

@media (max-height: 40rem) {
  .login-page {
    padding-block: 0.75rem;
  }

  .form-panel {
    padding-block: 1.25rem;
  }

  .form-heading {
    margin-bottom: 1rem;
  }

  .login-form {
    gap: 0.75rem;
  }

  .security-note {
    margin-top: 0.75rem;
  }
}

@media (max-height: 34rem) {
  .lock-mark,
  .security-note {
    display: none;
  }

  .form-heading {
    margin-bottom: 0.7rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .form-panel,
  .ambient,
  .welcome-panel {
    animation: none;
  }
}
</style>
