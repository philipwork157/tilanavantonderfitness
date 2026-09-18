<script setup lang="ts">
import InvoiceHistory from '@app/components/invoices/InvoiceHistory.vue';
import BillingTools from '@app/components/invoices/BillingTools.vue';

/** Protected by the existing administrator middleware and role-checked API. */
definePageMeta({ layout: 'dashboard' });
useSeoMeta({ title: 'Invoices | Tilana', robots: 'noindex, nofollow' });
const { data: operations, error: operationsError, refresh } = await useFetch('/api/admin/invoices/operations');
const retryError = ref(false);
const historyVersion = ref(0);
/** Refresh both bounded operational queues and shared invoice history after a command. */
async function billingChanged() { historyVersion.value++; await refresh(); }

/** Expedite only durable unsent records through the same-origin administrator API. */
async function retryDelivery(invoiceId: number) {
  retryError.value = false;
  try {
    await $fetch(`/api/admin/invoices/${invoiceId}/delivery`, { method: 'POST', body: { action: 'retry-delivery' } });
    await refresh();
  } catch { retryError.value = true; }
}
</script>

<template>
  <div>
    <h1>Invoices</h1>
    <p>Purchase and manual/coaching invoices, original documents, audited reissues and credit notes.</p>
    <BillingTools @changed="billingChanged" />
    <p v-if="operationsError" role="alert">Billing operations could not be loaded.</p>
    <p v-if="retryError" role="alert">Delivery retry could not be queued. Try again later.</p>
    <section v-if="operations?.review.length" aria-label="Billing review">
      <h2>Purchases requiring billing review</h2>
      <p v-for="job in operations.review" :key="job.id">Order {{ job.orderId }} · {{ job.attempts }} failed attempts. Check the original buyer snapshot and payment allocation.</p>
    </section>
    <section v-if="operations?.deliveries.length" aria-label="Pending invoice deliveries">
      <h2>Pending email deliveries</h2>
      <p v-for="job in operations.deliveries" :key="job.id">
        Invoice {{ job.invoiceId }} · {{ job.attempts }} attempts
        <button type="button" @click="retryDelivery(job.invoiceId)">Retry delivery</button>
      </p>
    </section>
    <InvoiceHistory :key="historyVersion" audience="admin" />
  </div>
</template>
