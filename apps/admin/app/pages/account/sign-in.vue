<script setup lang="ts">
const route = useRoute();
const email = ref('');
const submitting = ref(false);
const sent = ref(false);
const message = computed(() => {
  if (route.query.error === 'expired-link') return 'That sign-in link has expired. Request a new one below.';
  if (route.query.error === 'no-purchases') return 'No completed purchase could be linked to that account.';
  if (route.query.error) return 'That sign-in link is invalid. Request a new one below.';
  return '';
});

async function sendMagicLink() {
  submitting.value = true;
  try {
    await $fetch('/api/customer/auth/magic-link', { method: 'POST', body: { email: email.value } });
    sent.value = true;
  } catch (error) {
    const response = error as { data?: { statusMessage?: string } };
    alert(response.data?.statusMessage || 'The sign-in link could not be requested.');
  } finally {
    submitting.value = false;
  }
}

useSeoMeta({ title: 'Access your programs | Tilana', robots: 'noindex, nofollow' });
</script>

<template>
  <main class="account-page">
    <section class="account-card">
      <p class="eyebrow">Customer access</p>
      <h1>Your programs,<br><span>in one place.</span></h1>
      <p v-if="message" class="notice">{{ message }}</p>
      <template v-if="sent">
        <div class="success-mark"><UIcon name="i-lucide-mail-check" /></div>
        <h2>Check your inbox.</h2>
        <p>If a completed purchase is linked to {{ email }}, we have sent you a secure sign-in link.</p>
      </template>
      <form v-else @submit.prevent="sendMagicLink">
        <p>Use the same email address you entered when paying. You do not need a password.</p>
        <UFormField label="Purchase email" name="email" required>
          <UInput v-model="email" type="email" autocomplete="email" icon="i-lucide-mail" size="xl" required />
        </UFormField>
        <AppButton label="Email my sign-in link" type="submit" :loading="submitting" block />
      </form>
      <a href="https://tilanavantonder.co.za/program">← Back to programs</a>
    </section>
  </main>
</template>

<style scoped>
.account-page { min-height: 100vh; display: grid; place-items: center; padding: 2rem 1rem; background: #f6e4d9; color: #0f0e13; }
.account-card { width: min(100%, 34rem); padding: clamp(2rem, 6vw, 3.5rem); border: 1px solid #d5a27f; border-radius: 2rem; background: #fffaf7; box-shadow: 0 24px 70px rgb(97 70 53 / 15%); }
.eyebrow { margin: 0 0 0.8rem; color: #795744; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; }
h1 { margin: 0 0 1.5rem; font-family: Georgia, serif; font-size: clamp(2.5rem, 8vw, 4rem); line-height: 0.98; }
h1 span { color: #a87e63; font-style: italic; }
form { display: grid; gap: 1.2rem; }
form > p, .account-card > p { color: #614635; line-height: 1.7; }
.notice { padding: 0.85rem 1rem; border-radius: 0.8rem; background: #f4d8cb; }
.success-mark { display: grid; width: 3.5rem; height: 3.5rem; place-items: center; border-radius: 50%; color: #0f0e13; background: #c9d2b3; font-size: 1.5rem; }
h2 { font-family: Georgia, serif; font-size: 2rem; }
.account-card > a { display: inline-block; margin-top: 1.6rem; color: #795744; font-size: 0.8rem; }
</style>
