<script setup lang="ts">
type CustomerPrograms = {
  customer: { firstName: string; email: string };
  programs: Array<{ id: number; programName: string; volumeName: string; files: Array<{ id: number; name: string }> }>;
};

const { data, error } = await useFetch<CustomerPrograms>('/api/customer/programs');
if (error.value) await navigateTo('/account/sign-in');

async function signOut() {
  await $fetch('/api/auth/logout', { method: 'POST' });
  await navigateTo('/account/sign-in');
}

useSeoMeta({ title: 'My programs | Tilana', robots: 'noindex, nofollow' });
</script>

<template>
  <main class="program-page">
    <header>
      <div><p>Tilana van Tonder</p><strong>My programs</strong></div>
      <button type="button" @click="signOut">Sign out</button>
    </header>
    <section class="welcome">
      <p class="eyebrow">Customer library</p>
      <h1>Welcome, {{ data?.customer.firstName }}.</h1>
      <p>Your verified purchases and available program files appear here.</p>
    </section>
    <section class="program-grid">
      <article v-for="program in data?.programs" :key="program.id">
        <p class="eyebrow">{{ program.programName }}</p>
        <h2>{{ program.volumeName }}</h2>
        <ul v-if="program.files.length">
          <li v-for="file in program.files" :key="file.id">
            <span><UIcon name="i-lucide-file-text" />{{ file.name }}</span>
            <a :href="`/api/customer/files/${file.id}`">Download securely</a>
          </li>
        </ul>
        <p v-else class="empty">Your program is confirmed. The downloadable file will appear here when it is published.</p>
      </article>
      <p v-if="!data?.programs.length" class="empty">No active programs are linked to this account yet.</p>
    </section>
  </main>
</template>

<style scoped>
.program-page { min-height: 100vh; padding-bottom: 4rem; background: #f6e4d9; color: #0f0e13; }
header { display: flex; align-items: center; justify-content: space-between; padding: 1.2rem clamp(1rem, 5vw, 4rem); border-bottom: 1px solid rgb(168 126 99 / 25%); background: #fffaf7; }
header p { margin: 0 0 0.2rem; color: #795744; font-size: 0.65rem; letter-spacing: 0.12em; text-transform: uppercase; }
header button { padding: 0.65rem 1rem; border: 1px solid #a87e63; border-radius: 999px; color: #614635; background: transparent; cursor: pointer; }
.welcome, .program-grid { width: min(72rem, calc(100% - 2rem)); margin-inline: auto; }
.welcome { padding-block: clamp(3rem, 8vw, 6rem); }
.eyebrow { margin: 0 0 0.7rem; color: #795744; font-size: 0.7rem; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; }
h1, h2 { font-family: Georgia, serif; }
h1 { margin: 0; font-size: clamp(2.8rem, 7vw, 5.5rem); }
.welcome > p:last-child { color: #614635; }
.program-grid { display: grid; gap: 1.2rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr)); }
article { padding: 2rem; border: 1px solid #d5a27f; border-radius: 1.5rem; background: #fffaf7; box-shadow: 0 16px 45px rgb(97 70 53 / 10%); }
h2 { margin: 0 0 1.5rem; font-size: 2rem; }
ul { display: grid; gap: 0.7rem; margin: 0; padding: 0; list-style: none; }
li { display: grid; gap: 0.35rem; padding: 0.9rem; border-radius: 0.8rem; background: #edf0e5; }
li span:first-child { display: flex; align-items: center; gap: 0.5rem; font-weight: 700; }
.empty { color: #795744; font-size: 0.75rem; line-height: 1.6; }
li a { width: fit-content; color: #795744; font-size: 0.75rem; font-weight: 700; text-decoration: underline; text-underline-offset: 0.2em; }
</style>
