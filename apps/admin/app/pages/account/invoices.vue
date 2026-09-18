<script setup lang="ts">
import InvoiceHistory from '@app/components/invoices/InvoiceHistory.vue';

/** A verified linked customer may view billing even after program access ends. */
const { error } = await useFetch('/api/customer/invoices');
if (error.value && [401, 403].includes(error.value.statusCode || 0)) await navigateTo('/account/sign-in');
useSeoMeta({ title: 'My invoices | Tilana', robots: 'noindex, nofollow' });
</script>

<template>
  <main class="customer-invoices">
    <NuxtLink to="/account/programs">My programs</NuxtLink>
    <h1>My invoices</h1>
    <InvoiceHistory audience="customer" />
  </main>
</template>

<style scoped>
.customer-invoices { min-height: 100vh; padding: clamp(1rem, 5vw, 4rem); background: #f6e4d9; color: #0f0e13; }
h1 { font-family: Georgia, serif; }
</style>
