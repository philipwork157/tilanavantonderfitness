<script setup lang="ts">
import { formatInvoiceMoney, type InvoiceList } from '@tilana/contracts/invoices';

/** Shared read-only financial history; each API enforces its own identity boundary. */
const props = defineProps<{ audience: 'admin' | 'customer' }>();
const before = ref<number>();
const base = computed(() => `/api/${props.audience}/invoices`);
const { data, error, status } = await useFetch<InvoiceList>(base, { query: computed(() => ({ ...(before.value ? { before: before.value } : {}) })) });
</script>

<template>
  <section class="invoice-history" aria-label="Invoice history">
    <p v-if="status === 'pending'" role="status">Loading invoices...</p>
    <p v-else-if="error" role="alert">Invoices could not be loaded. Please try again.</p>
    <p v-else-if="!data?.invoices.length">No invoices have been issued yet.</p>
    <article v-for="invoice in data?.invoices" :key="invoice.id">
      <h2>{{ invoice.invoiceNumber }}</h2>
      <p>{{ invoice.clientName }} · {{ invoice.issueDate }} · {{ invoice.status }}</p>
      <p>Total: {{ formatInvoiceMoney(invoice.totalCents, invoice.currency) }}</p>
      <p v-if="invoice.creditedCents">Credited: {{ formatInvoiceMoney(invoice.creditedCents, invoice.currency) }}</p>
      <a :href="`${base}/${invoice.id}/pdf`">Download invoice PDF</a>
      <ul v-if="invoice.credits.length">
        <li v-for="credit in invoice.credits" :key="credit.id">
          <a :href="`${base}/${invoice.id}/credits/${credit.id}`">{{ credit.creditNumber }} · {{ credit.reason }} · {{ formatInvoiceMoney(credit.amountCents, invoice.currency) }}</a>
        </li>
      </ul>
    </article>
    <nav aria-label="Invoice pages">
      <button v-if="before" type="button" @click="before = undefined">Latest invoices</button>
      <button v-if="data?.hasMore" type="button" @click="before = data?.invoices.at(-1)?.id">Older invoices</button>
    </nav>
  </section>
</template>

<style scoped>
.invoice-history { display: grid; gap: 1rem; }
article { padding: 1.5rem; border: 1px solid var(--color-border, #d5a27f); border-radius: 1.25rem; background: var(--white, #fffaf7); }
h2 { margin-top: 0; font-size: 1.2rem; }
a { text-decoration: underline; text-underline-offset: 0.2em; }
nav { display: flex; flex-wrap: wrap; gap: 1rem; }
button { padding: 0.6rem 1rem; border: 1px solid #a87e63; border-radius: 1rem; cursor: pointer; }
</style>
