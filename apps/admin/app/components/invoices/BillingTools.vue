<script setup lang="ts">
import { submitBillingCommand } from '@app/utils/billing-command';
import { invoiceActionSchema, invoiceReviewSchema, manualInvoiceSchema } from '@tilana/contracts/invoices';

/** Explicit, protected billing commands; recording bank evidence never sends money. */
const emit = defineEmits<{ changed: [] }>();
const mode = ref<'create' | 'action' | 'review'>('create');
const busy = ref(false);
const message = ref('');
const form = reactive({ clientId: 0, invoiceId: 0, orderId: 0, paymentId: 0, replacesInvoiceId: 0, existingOrderId: 0,
  action: 'issue', reason: '', clientName: '', clientEmail: '', clientAddress: '', clientPhone: '',
  reference: '', amountCents: 0, receiptDate: '', evidence: '' });
const lines = ref([{ description: '', quantity: 1, unitPriceCents: 0 }]);
const { data: clientsData } = await useFetch('/api/admin/clients', { lazy: true });
const inspection = ref('');

/** Read protected original snapshots/attempts before approving exceptional billing history. */
async function inspect() {
  if (busy.value) return;
  try {
    const url = mode.value === 'review' ? `/api/admin/invoices/orders/${form.orderId}/review` : `/api/admin/invoices/${form.invoiceId}`;
    inspection.value = JSON.stringify(await $fetch<unknown, string>(url), null, 2);
  } catch { inspection.value = 'Unable to load the protected record. Check the ID and try again.'; }
}

/** Validate the exact server contract locally, retaining the original command key on failure. */
async function submit() {
  if (busy.value) return;
  busy.value = true; message.value = '';
  try {
    const command = { reason: form.reason, idempotencyKey: crypto.randomUUID() };
    let url: string;
    let parsed: Record<string, unknown>;
    if (mode.value === 'create') {
      url = '/api/admin/invoices';
      parsed = manualInvoiceSchema.parse({ ...command, clientId: form.clientId, items: form.existingOrderId ? [] : lines.value,
        ...(form.existingOrderId ? { existingOrderId: form.existingOrderId } : {}),
        ...(form.replacesInvoiceId ? { replacesInvoiceId: form.replacesInvoiceId } : {}) });
    } else if (mode.value === 'review') {
      url = `/api/admin/invoices/orders/${form.orderId}/review`;
      parsed = invoiceReviewSchema.parse({ ...command, paymentId: form.paymentId, clientName: form.clientName,
        clientEmail: form.clientEmail, clientPhone: form.clientPhone, evidence: form.evidence });
    } else {
      url = `/api/admin/invoices/${form.invoiceId}/actions`;
      const fields = form.action === 'reissue' ? { clientName: form.clientName, clientPhone: form.clientPhone, clientAddress: form.clientAddress }
        : ['record-payment', 'record-refund'].includes(form.action) ? { amountCents: form.amountCents, reference: form.reference,
            [form.action === 'record-payment' ? 'paidAt' : 'refundedAt']: new Date(`${form.receiptDate}T00:00:00+02:00`).toISOString() } : {};
      parsed = invoiceActionSchema.parse({ ...command, action: form.action, ...fields });
    }
    delete parsed.idempotencyKey;
    const result = await submitBillingCommand(url, parsed, (target, options) => $fetch<unknown, string>(target, options));
    message.value = `Saved: ${JSON.stringify(result)}. Invoice delivery requires the enabled billing worker.`;
    emit('changed');
  } catch (error) {
    message.value = (error as { data?: { statusMessage?: string } }).data?.statusMessage
      || 'Could not save. Check the fields. If the response was lost, retry the same details to reuse the command safely.';
  } finally { busy.value = false; }
}
</script>

<template>
  <section class="billing-tools" aria-label="Billing administration">
    <h2>Manage billing</h2>
    <p>Create a draft, issue it, then record payment only after checking the bank/cash receipt. These actions do not charge or refund money and do not grant program access.</p>
    <form @submit.prevent="submit">
      <fieldset :disabled="busy">
        <label>Operation<select v-model="mode"><option value="create">New manual/coaching draft</option><option value="action">Invoice action</option><option value="review">Approve legacy purchase evidence</option></select></label>
        <template v-if="mode === 'create'">
          <label>Existing client<select v-model.number="form.clientId" required><option :value="0" disabled>Select a client</option><option v-for="client in clientsData?.clients" :key="client.id" :value="client.id">{{ client.firstName }} {{ client.lastName }} · {{ client.email }} · ID {{ client.id }}</option></select></label>
          <label>Invoice an existing paid manual order ID (optional)<input v-model.number="form.existingOrderId" type="number" min="0"></label>
          <p v-if="form.existingOrderId">Use original purchase lines and settlement. No second order, payment or access grant will be created. Missing legacy snapshots require evidence approval first.</p>
          <label v-if="!form.existingOrderId">Replace void or fully credited manual invoice ID (optional)<input v-model.number="form.replacesInvoiceId" type="number" min="0"></label>
          <div v-for="(line, index) in (form.existingOrderId ? [] : lines)" :key="index" class="billing-line">
            <label>Item/service<input v-model="line.description" maxlength="240" required></label>
            <label>Quantity<input v-model.number="line.quantity" type="number" min="1" max="100" required></label>
            <label>Unit price in cents<input v-model.number="line.unitPriceCents" type="number" min="0" required></label>
            <button v-if="lines.length > 1" type="button" @click="lines.splice(index, 1)">Remove item</button>
          </div>
          <button v-if="!form.existingOrderId && lines.length < 20" type="button" @click="lines.push({ description: '', quantity: 1, unitPriceCents: 0 })">Add item</button>
        </template>
        <template v-if="mode === 'action'">
          <label>Invoice ID<input v-model.number="form.invoiceId" type="number" min="1" required></label>
          <label>Action<select v-model="form.action"><option value="issue">Issue manual draft</option><option value="void">Void unpaid manual invoice</option><option value="reissue">Reissue corrected customer details</option><option value="record-payment">Record confirmed manual payment</option><option value="record-refund">Record confirmed manual refund</option></select></label>
          <button type="button" @click="inspect">Inspect invoice and audit history</button>
          <template v-if="['record-payment', 'record-refund'].includes(form.action)">
            <p>Confirm the actual bank/cash movement first. Paystack invoices cannot use manual settlement/refund actions.</p>
            <label>Receipt amount in cents<input v-model.number="form.amountCents" type="number" min="1" required></label>
            <label>Unique bank/cash receipt reference<input v-model="form.reference" minlength="5" maxlength="120" required></label>
            <label>Actual receipt date (South Africa)<input v-model="form.receiptDate" type="date" required></label>
          </template>
        </template>
        <template v-if="mode === 'review'">
          <label>Order ID<input v-model.number="form.orderId" type="number" min="1" required></label>
          <button type="button" @click="inspect">Inspect original order and payment attempts</button>
          <label>Verified settled payment ID<input v-model.number="form.paymentId" type="number" min="1" required></label>
          <label>Original purchase email<input v-model="form.clientEmail" type="email" required></label>
          <label>Evidence reference and explanation<textarea v-model="form.evidence" minlength="10" maxlength="1000" required /></label>
          <p>Use original evidence, not edited profiles. Resolve additional settled attempts with Paystack before approval. Never include tokens or bank account credentials.</p>
        </template>
        <template v-if="mode === 'review' || (mode === 'action' && form.action === 'reissue')">
          <label>Customer billing name<input v-model="form.clientName" maxlength="200" required></label>
          <label>Customer phone<input v-model="form.clientPhone" maxlength="40"></label>
          <label v-if="mode === 'action'">Customer billing address<textarea v-model="form.clientAddress" maxlength="1000" /></label>
          <p>Reissues do not change amounts, the recipient email, or document ownership.</p>
        </template>
        <label>Reason/evidence summary<textarea v-model="form.reason" minlength="5" maxlength="1000" required /></label>
        <button type="submit">{{ busy ? 'Saving...' : 'Save billing command' }}</button>
      </fieldset>
    </form>
    <p v-if="message" role="status">{{ message }}</p>
    <pre v-if="inspection" class="inspection">{{ inspection }}</pre>
  </section>
</template>

<style scoped>
.billing-tools { margin: 1.5rem 0; padding: 1.5rem; border: 1px solid var(--color-border, #d5a27f); border-radius: 1.25rem; background: var(--white, #fffaf7); }
fieldset { display: grid; gap: 1rem; border: 0; padding: 0; }
label { display: grid; gap: .35rem; }
input, select, textarea { padding: .65rem; border: 1px solid #a87e63; border-radius: .5rem; font: inherit; background: #fffaf7; }
button { padding: .65rem 1rem; border: 1px solid #a87e63; border-radius: .75rem; cursor: pointer; }
.billing-line { display: grid; gap: .75rem; border-top: 1px solid #d5a27f; padding-top: 1rem; }
.inspection { overflow: auto; max-height: 24rem; white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
