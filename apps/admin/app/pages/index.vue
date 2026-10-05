<template>
  <main class="admin-start">
    <header class="start-header">
      <BrandMark />
      <ThemeToggle />
    </header>
    <section class="start-card" aria-labelledby="start-heading">
      <p class="eyebrow">A fresh start</p>
      <h1 id="start-heading">Your new admin starts here.</h1>
      <p>The previous admin and backend are archived for reference. This is a clean starting point using the existing Tilana design system.</p>
      <p class="status-note">Login, programs, sales and backend APIs are not connected yet. No database or payment service is active.</p>
      <UButton to="http://localhost:4321" external label="Open local website" trailing-icon="i-lucide-arrow-up-right" color="neutral" variant="outline" />
    </section>
  </main>
</template>

<style scoped>
.admin-start { min-height: 100dvh; max-width: 70rem; margin-inline: auto; padding: clamp(1.25rem, 4vw, 3rem); }
.start-header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.start-card { max-width: 46rem; margin: clamp(3rem, 10vh, 7rem) auto; padding: clamp(1.5rem, 5vw, 3rem); border: 1px solid var(--color-border); border-radius: 2rem; background: var(--ui-bg); box-shadow: var(--shadow-md); }
.eyebrow { color: var(--caramel); font-size: 0.75rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
h1 { margin: 0.75rem 0 1.25rem; font-family: var(--font-heading); font-size: clamp(2rem, 5vw, 3.5rem); line-height: 1.1; }
p { line-height: 1.7; }
.status-note { margin-block: 1.25rem 2rem; color: var(--ui-text-muted); }
</style>
