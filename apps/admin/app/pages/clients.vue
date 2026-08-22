<script setup lang="ts">
import {
  adminClientCreateRequestSchema,
  clientGenderValues,
  type ClientGender,
  type ClientPurchaseStatus,
} from '@tilana/contracts/clients';
import {
  formatZar,
  programmeCatalog,
  programmeCatalogByKey,
  type ProgrammeKey,
} from '@tilana/contracts/programs';

definePageMeta({ layout: 'dashboard' });

interface ProgrammeInput {
  programmeKey: ProgrammeKey;
  priceRands: number;
}

interface RequestError {
  data?: { statusMessage?: string };
}

type GenderSelection = ClientGender | 'not-specified';

const search = ref('');
const showForm = ref(false);
const saving = ref(false);
const formError = ref('');
const successMessage = ref('');
const editingClientId = ref<string | null>(null);
const selectedEnquiryId = ref('manual');
const route = useRoute();
const { data, status, error, refresh } = await useFetch('/api/admin/clients');
const { data: enquiriesData } = await useFetch('/api/admin/contacts');
type ClientRecord = NonNullable<typeof data.value>['clients'][number];

const form = reactive({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  gender: 'not-specified' as GenderSelection,
  notes: '',
  purchaseStatus: 'paid' as ClientPurchaseStatus,
  programmes: [createProgrammeInput('strong-volume-1')] as ProgrammeInput[],
});

const columns = [
  { accessorKey: 'firstName', header: 'Client' },
  { id: 'programmes', header: 'Programmes & prices' },
  { accessorKey: 'createdAt', header: 'Added' },
  { id: 'actions', header: '' },
];

const programmeOptions = programmeCatalog.map((programme) => ({
  label: programme.volumeName,
  value: programme.key,
}));
const genderOptions = [
  { label: 'Not specified', value: 'not-specified' },
  ...clientGenderValues.map((value) => ({
    label: value.replaceAll('-', ' ').replace(/^./, (letter) => letter.toUpperCase()),
    value,
  })),
];
const purchaseStatusOptions = [
  { label: 'Paid', value: 'paid' },
  { label: 'Payment pending', value: 'pending' },
];

const filteredClients = computed(() => {
  const query = search.value.trim().toLowerCase();
  if (!query) return data.value?.clients ?? [];
  return (data.value?.clients ?? []).filter((client) =>
    `${client.firstName} ${client.lastName} ${client.email} ${client.phone ?? ''} ${client.programmes.map((item) => item.name).join(' ')}`
      .toLowerCase()
      .includes(query),
  );
});

const enquiryOptions = computed(() => {
  const clientEmails = new Set((data.value?.clients ?? []).map((client) => client.email.toLowerCase()));
  return [
    { label: 'Enter manually', value: 'manual' },
    ...(enquiriesData.value?.submissions ?? []).map((enquiry) => ({
      label: `${enquiry.fullName} · ${enquiry.email}${clientEmails.has(enquiry.email.toLowerCase()) ? ' · already a client' : ''}`,
      value: enquiry.id,
      disabled: clientEmails.has(enquiry.email.toLowerCase()),
    })),
  ];
});

const paidValueCents = computed(() =>
  (data.value?.clients ?? []).reduce(
    (total, client) => total + client.programmes.reduce(
      (clientTotal, programme) => clientTotal + (programme.status === 'paid' ? programme.priceCents : 0),
      0,
    ),
    0,
  ),
);

function createProgrammeInput(key: ProgrammeKey): ProgrammeInput {
  return {
    programmeKey: key,
    priceRands: programmeCatalogByKey[key].suggestedPriceCents / 100,
  };
}

function updateProgrammePrice(item: ProgrammeInput) {
  item.priceRands = programmeCatalogByKey[item.programmeKey].suggestedPriceCents / 100;
}

function addProgramme() {
  const used = new Set(form.programmes.map((item) => item.programmeKey));
  const next = programmeCatalog.find((programme) => !used.has(programme.key));
  if (next) form.programmes.push(createProgrammeInput(next.key));
}

function removeProgramme(index: number) {
  if (form.programmes.length > 1) form.programmes.splice(index, 1);
}

function importEnquiry(enquiryId: string) {
  selectedEnquiryId.value = enquiryId;
  if (enquiryId === 'manual') return;

  const enquiry = enquiriesData.value?.submissions.find((item) => item.id === enquiryId);
  if (!enquiry) return;

  const nameParts = enquiry.fullName.trim().split(/\s+/);
  form.firstName = nameParts.shift() ?? '';
  form.lastName = nameParts.join(' ');
  form.email = enquiry.email;

  const programmeByInterest = {
    strong: 'strong-volume-1',
    move: 'move-volume-1',
    nourish: 'nourish-volume-1',
    reconnect: 'reconnect-volume-1',
  } as const;
  const programmeKey = programmeByInterest[enquiry.interest as keyof typeof programmeByInterest];
  if (programmeKey) form.programmes = [createProgrammeInput(programmeKey)];
}

function resetForm() {
  Object.assign(form, {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    gender: 'not-specified',
    notes: '',
    purchaseStatus: 'paid',
    programmes: [createProgrammeInput('strong-volume-1')],
  });
  formError.value = '';
  selectedEnquiryId.value = 'manual';
  editingClientId.value = null;
}

function openCreateForm() {
  resetForm();
  successMessage.value = '';
  showForm.value = true;
}

function closeForm() {
  resetForm();
  showForm.value = false;
}

async function openEditForm(client: ClientRecord) {
  successMessage.value = '';
  editingClientId.value = client.id;
  selectedEnquiryId.value = 'manual';
  form.firstName = client.firstName;
  form.lastName = client.lastName;
  form.email = client.email;
  form.phone = client.phone ?? '';
  form.gender = client.gender ?? 'not-specified';
  form.notes = client.notes ?? '';
  form.purchaseStatus = client.programmes.some((programme) => programme.status === 'pending')
    ? 'pending'
    : 'paid';
  const editableProgrammes = client.programmes
    .filter((programme): programme is typeof programme & { programmeKey: ProgrammeKey } => Boolean(programme.programmeKey))
    .map((programme) => ({
      programmeKey: programme.programmeKey,
      priceRands: programme.priceCents / 100,
    }));
  form.programmes = editableProgrammes.length
    ? editableProgrammes
    : [createProgrammeInput('strong-volume-1')];
  formError.value = '';
  showForm.value = true;
  await nextTick();
  document.querySelector('.client-form-card')?.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'start',
  });
}

async function saveClient() {
  formError.value = '';
  successMessage.value = '';
  const parsed = adminClientCreateRequestSchema.safeParse({
    firstName: form.firstName,
    lastName: form.lastName,
    email: form.email,
    phone: form.phone,
    gender: form.gender === 'not-specified' ? null : form.gender,
    notes: form.notes,
    purchaseStatus: form.purchaseStatus,
    programmes: form.programmes.map((item) => ({
      programmeKey: item.programmeKey,
      priceCents: Math.round(Number(item.priceRands) * 100),
    })),
  });

  if (!parsed.success) {
    formError.value = parsed.error.issues[0]?.message ?? 'Please check the client details.';
    return;
  }

  saving.value = true;
  try {
    const editedClientId = editingClientId.value;
    await $fetch(editedClientId ? `/api/admin/clients/${editedClientId}` : '/api/admin/clients', {
      method: editedClientId ? 'PATCH' : 'POST',
      body: parsed.data,
    });
    await refresh();
    successMessage.value = editedClientId
      ? `${parsed.data.firstName} ${parsed.data.lastName}'s client record has been updated successfully.`
      : `${parsed.data.firstName} ${parsed.data.lastName} has been added successfully. Their programmes and agreed prices are now recorded.`;
    resetForm();
    showForm.value = false;
    await nextTick();
    document.querySelector('.success-banner')?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'center',
    });
  } catch (requestError) {
    formError.value = (requestError as RequestError).data?.statusMessage
      ?? 'The client could not be saved. Please try again.';
  } finally {
    saving.value = false;
  }
}

function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'medium',
    timeZone: 'Africa/Johannesburg',
  }).format(new Date(value));
}

function statusColor(value: string): 'success' | 'warning' | 'neutral' {
  if (value === 'paid') return 'success';
  if (value === 'pending') return 'warning';
  return 'neutral';
}

const requestedEnquiryId = typeof route.query.enquiry === 'string' ? route.query.enquiry : '';
if (requestedEnquiryId && enquiriesData.value?.submissions.some((item) => item.id === requestedEnquiryId)) {
  showForm.value = true;
  importEnquiry(requestedEnquiryId);
}

useSeoMeta({ title: 'Clients | Tilana Admin', robots: 'noindex, nofollow' });
</script>

<template>
  <div class="clients-page">
    <section class="clients-heading">
      <div>
        <p class="eyebrow">Client workspace</p>
        <h1>People and programmes,<br><span>kept beautifully organised.</span></h1>
        <p>Add clients manually for now, record what they purchased, and preserve the exact price agreed with them.</p>
      </div>
      <UButton
        :label="showForm ? 'Close form' : 'Add client'"
        :icon="showForm ? 'i-lucide-x' : 'i-lucide-user-plus'"
        size="xl"
        class="add-client-button"
        @click="showForm ? closeForm() : openCreateForm()"
      />
    </section>

    <Transition name="form-reveal">
      <section v-if="successMessage" class="success-banner" role="status" aria-live="polite">
        <span class="success-mark"><UIcon name="i-lucide-circle-check-big" /></span>
        <div>
          <p class="eyebrow">Client saved</p>
          <h2>Everything is beautifully up to date.</h2>
          <p>{{ successMessage }}</p>
        </div>
        <UButton
          type="button"
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          aria-label="Dismiss confirmation"
          class="dismiss-success"
          @click="successMessage = ''"
        />
      </section>
    </Transition>

    <Transition name="form-reveal">
      <UCard v-if="showForm" class="client-form-card" :ui="{ body: 'p-5 sm:p-8' }">
        <form @submit.prevent="saveClient">
          <div class="form-heading">
            <div>
              <p class="eyebrow">{{ editingClientId ? 'Edit client' : 'New client' }}</p>
              <h2>{{ editingClientId ? 'Update their details' : 'Add their details' }}</h2>
            </div>
            <span>{{ editingClientId ? 'Manual correction' : 'Manual entry' }}</span>
          </div>

          <div class="field-grid">
            <UFormField v-if="!editingClientId" label="Start from a website enquiry" hint="Optional" class="enquiry-picker-field">
              <USelect
                v-model="selectedEnquiryId"
                :items="enquiryOptions"
                value-key="value"
                size="xl"
                icon="i-lucide-inbox"
                @update:model-value="importEnquiry"
              />
            </UFormField>
            <UFormField label="First name" required>
              <UInput v-model="form.firstName" autocomplete="given-name" placeholder="First name" size="xl" />
            </UFormField>
            <UFormField label="Last name" required>
              <UInput v-model="form.lastName" autocomplete="family-name" placeholder="Last name" size="xl" />
            </UFormField>
            <UFormField label="Email address" required>
              <UInput v-model="form.email" type="email" autocomplete="email" placeholder="client@example.com" size="xl" />
            </UFormField>
            <UFormField label="Phone number">
              <UInput v-model="form.phone" type="tel" autocomplete="tel" placeholder="Optional" size="xl" />
            </UFormField>
            <UFormField label="Gender">
              <USelect v-model="form.gender" :items="genderOptions" value-key="value" size="xl" />
            </UFormField>
            <UFormField label="Purchase status">
              <USelect v-model="form.purchaseStatus" :items="purchaseStatusOptions" value-key="value" size="xl" />
            </UFormField>
          </div>

          <div class="programme-section">
            <div class="programme-heading">
              <div>
                <h3>Programmes</h3>
                <p>Record the actual price agreed with this client.</p>
              </div>
              <UButton
                type="button"
                label="Add another"
                icon="i-lucide-plus"
                color="neutral"
                variant="soft"
                :disabled="form.programmes.length >= programmeCatalog.length"
                @click="addProgramme"
              />
            </div>

            <div class="programme-inputs">
              <div v-for="(item, index) in form.programmes" :key="index" class="programme-row">
                <UFormField label="Programme" required>
                  <USelect
                    v-model="item.programmeKey"
                    :items="programmeOptions"
                    value-key="value"
                    size="xl"
                    @update:model-value="updateProgrammePrice(item)"
                  />
                </UFormField>
                <UFormField label="Price paid (ZAR)" required>
                  <UInput v-model.number="item.priceRands" type="number" min="0" step="1" size="xl">
                    <template #leading><span class="currency-prefix">R</span></template>
                  </UInput>
                </UFormField>
                <UButton
                  type="button"
                  icon="i-lucide-trash-2"
                  color="error"
                  variant="soft"
                  aria-label="Remove programme"
                  :disabled="form.programmes.length === 1"
                  class="remove-programme"
                  @click="removeProgramme(index)"
                />
              </div>
            </div>
          </div>

          <UFormField label="Private notes" hint="Only visible in the admin portal">
            <UTextarea v-model="form.notes" :rows="4" placeholder="Optional context or follow-up notes" class="w-full" />
          </UFormField>

          <UAlert
            v-if="formError"
            color="error"
            variant="soft"
            icon="i-lucide-circle-alert"
            :description="formError"
          />

          <div class="form-actions">
            <UButton type="button" label="Cancel" color="neutral" variant="ghost" size="xl" @click="closeForm" />
            <UButton
              type="submit"
              :label="editingClientId ? 'Save changes' : 'Save client'"
              :icon="editingClientId ? 'i-lucide-save' : 'i-lucide-user-check'"
              size="xl"
              :loading="saving"
            />
          </div>
        </form>
      </UCard>
    </Transition>

    <section class="client-stats" aria-label="Client overview">
      <article>
        <span><UIcon name="i-lucide-users" /></span>
        <div><strong>{{ data?.clients.length ?? 0 }}</strong><p>Clients tracked</p></div>
      </article>
      <article>
        <span><UIcon name="i-lucide-library" /></span>
        <div><strong>{{ data?.clients.reduce((total, client) => total + client.programmes.length, 0) ?? 0 }}</strong><p>Programme purchases</p></div>
      </article>
      <article>
        <span><UIcon name="i-lucide-banknote" /></span>
        <div><strong>{{ formatZar(paidValueCents) }}</strong><p>Recorded paid value</p></div>
      </article>
    </section>

    <section class="clients-list-section">
      <div class="list-heading">
        <div>
          <p class="eyebrow">Your clients</p>
          <h2>Client records</h2>
        </div>
        <UInput v-model="search" icon="i-lucide-search" placeholder="Search clients or programmes" size="lg" class="client-search" />
      </div>

      <USkeleton v-if="status === 'pending'" class="h-80 rounded-3xl" />
      <UAlert
        v-else-if="error"
        color="error"
        variant="soft"
        icon="i-lucide-circle-alert"
        title="Clients could not be loaded"
        description="Please check the database connection and try again."
      />
      <div v-else-if="!filteredClients.length" class="empty-clients">
        <span><UIcon name="i-lucide-user-round-plus" /></span>
        <h3>{{ data?.clients.length ? 'No matching clients' : 'Your first client starts here' }}</h3>
        <p>{{ data?.clients.length ? 'Try a different search.' : 'Add a client and their programme to begin tracking your work together.' }}</p>
        <UButton v-if="!data?.clients.length" label="Add first client" icon="i-lucide-plus" @click="openCreateForm" />
      </div>
      <UCard v-else class="clients-table-card" :ui="{ body: 'p-0 sm:p-0' }">
        <UTable :data="filteredClients" :columns="columns" class="clients-table">
          <template #firstName-cell="{ row }">
            <div class="client-identity">
              <UAvatar :text="`${row.original.firstName[0]}${row.original.lastName[0]}`.toUpperCase()" size="lg" class="client-avatar" />
              <div>
                <strong>{{ row.original.firstName }} {{ row.original.lastName }}</strong>
                <a :href="`mailto:${row.original.email}`">{{ row.original.email }}</a>
                <small v-if="row.original.phone">{{ row.original.phone }}</small>
              </div>
            </div>
          </template>
          <template #programmes-cell="{ row }">
            <div class="client-programmes">
              <div v-for="programme in row.original.programmes" :key="`${programme.orderId}-${programme.name}`">
                <span><strong>{{ programme.name }}</strong><small>{{ programme.orderNumber }}</small></span>
                <span><b>{{ formatZar(programme.priceCents) }}</b><UBadge :color="statusColor(programme.status)" variant="subtle">{{ programme.status }}</UBadge></span>
              </div>
              <small v-if="!row.original.programmes.length">No programmes recorded</small>
            </div>
          </template>
          <template #createdAt-cell="{ row }">
            <span class="date-added">{{ formatDate(row.original.createdAt) }}</span>
          </template>
          <template #actions-cell="{ row }">
            <div class="client-actions">
              <UButton
                icon="i-lucide-pencil"
                color="neutral"
                variant="soft"
                aria-label="Edit client"
                @click="openEditForm(row.original)"
              />
              <UButton :to="`mailto:${row.original.email}`" icon="i-lucide-mail" color="neutral" variant="ghost" aria-label="Email client" />
            </div>
          </template>
        </UTable>
      </UCard>
    </section>
  </div>
</template>

<style scoped>
.clients-page { display: grid; gap: clamp(1.4rem, 3vw, 2.4rem); }
.clients-heading { display: flex; min-height: 17rem; align-items: center; justify-content: space-between; gap: 2rem; padding: clamp(1.6rem, 4vw, 3rem); overflow: hidden; border: 1px solid var(--color-border); border-radius: 2rem; background: radial-gradient(circle at 92% 18%, color-mix(in srgb, var(--sage) 70%, transparent), transparent 23%), linear-gradient(120deg, color-mix(in srgb, var(--white) 88%, transparent), color-mix(in srgb, var(--sand) 72%, var(--cream))); box-shadow: var(--shadow-sm); }
.clients-heading > div { max-width: 52rem; }
.eyebrow { margin: 0 0 0.6rem; color: var(--caramel); font-size: 0.67rem; font-weight: 700; letter-spacing: 0.13em; text-transform: uppercase; }
h1, h2, h3 { color: var(--ink); font-family: var(--font-heading); }
h1 { margin: 0; font-size: clamp(2.6rem, 5vw, 4.8rem); font-weight: 600; letter-spacing: -0.055em; line-height: 0.98; }
h1 span { color: var(--caramel); font-family: var(--font-script); font-weight: 400; letter-spacing: 0; }
.clients-heading p:last-child { max-width: 43rem; margin: 1.25rem 0 0; font-size: 0.8rem; line-height: 1.7; }
.add-client-button { flex: none; }
.success-banner { display: grid; align-items: center; gap: 1rem; grid-template-columns: auto minmax(0, 1fr) auto; padding: clamp(1.2rem, 3vw, 1.8rem); border: 1px solid color-mix(in srgb, var(--sage) 76%, var(--caramel)); border-radius: 1.6rem; color: var(--ink); background: linear-gradient(120deg, color-mix(in srgb, var(--sage) 88%, var(--white)), color-mix(in srgb, var(--terracotta) 26%, var(--white))); box-shadow: var(--shadow-sm); }
.success-mark { display: grid; width: 3.4rem; aspect-ratio: 1; place-items: center; border-radius: 1.1rem; color: var(--ink); background: color-mix(in srgb, var(--white) 72%, transparent); font-size: 1.5rem; }
.success-banner h2 { margin: 0; font-size: clamp(1.25rem, 2.5vw, 1.8rem); }
.success-banner p:last-child { margin: 0.35rem 0 0; color: var(--chocolate); font-size: 0.72rem; line-height: 1.6; }
.success-banner .eyebrow { margin-bottom: 0.25rem; }
.dismiss-success { align-self: start; }
.client-form-card, .clients-table-card { border-radius: 1.8rem; box-shadow: var(--shadow-md); }
.client-form-card form { display: grid; gap: 1.5rem; }
.form-heading, .programme-heading, .form-actions, .list-heading { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.form-heading h2, .list-heading h2 { margin: 0; font-size: clamp(1.8rem, 3vw, 2.8rem); }
.form-heading > span { padding: 0.5rem 0.8rem; border-radius: 999px; color: var(--chocolate); background: var(--sage); font-size: 0.65rem; font-weight: 700; text-transform: uppercase; }
.field-grid { display: grid; gap: 1rem; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.enquiry-picker-field { grid-column: 1 / -1; }
.programme-section { padding: 1.3rem; border-radius: 1.4rem; background: color-mix(in srgb, var(--sage) 42%, transparent); }
.programme-heading h3 { margin: 0; font-size: 1.3rem; }
.programme-heading p { margin: 0.25rem 0 0; font-size: 0.68rem; }
.programme-inputs { display: grid; gap: 0.8rem; margin-top: 1rem; }
.programme-row { display: grid; align-items: end; gap: 0.75rem; grid-template-columns: minmax(0, 1.6fr) minmax(10rem, 0.8fr) auto; padding: 0.9rem; border: 1px solid var(--color-border); border-radius: 1.1rem; background: color-mix(in srgb, var(--white) 88%, var(--cream)); }
.currency-prefix { color: var(--caramel); font-weight: 700; }
.remove-programme { margin-bottom: 0.05rem; }
.form-actions { justify-content: flex-end; padding-top: 0.5rem; }
.client-stats { display: grid; gap: 1rem; grid-template-columns: repeat(3, minmax(0, 1fr)); }
.client-stats article { display: flex; min-height: 8.5rem; align-items: center; gap: 1rem; padding: 1.3rem; border: 1px solid var(--color-border); border-radius: 1.6rem; background: color-mix(in srgb, var(--white) 80%, var(--cream)); box-shadow: var(--shadow-sm); }
.client-stats article:nth-child(2) { background: color-mix(in srgb, var(--sage) 76%, var(--cream)); }
.client-stats article:nth-child(3) { background: color-mix(in srgb, var(--terracotta) 50%, var(--cream)); }
.client-stats article > span { display: grid; width: 2.8rem; aspect-ratio: 1; place-items: center; border-radius: 0.9rem; color: var(--ink); background: color-mix(in srgb, var(--white) 76%, transparent); font-size: 1.1rem; }
.client-stats strong { color: var(--ink); font-family: var(--font-heading); font-size: 1.8rem; }
.client-stats p { margin: 0.15rem 0 0; font-size: 0.69rem; }
.clients-list-section { display: grid; gap: 1rem; }
.client-search { width: min(100%, 24rem); }
.empty-clients { display: grid; min-height: 22rem; place-items: center; align-content: center; padding: 2rem; border: 1px dashed var(--color-border); border-radius: 2rem; text-align: center; }
.empty-clients > span { display: grid; width: 4rem; aspect-ratio: 1; place-items: center; border-radius: 1.25rem; background: var(--sage); font-size: 1.4rem; }
.empty-clients h3 { margin: 1rem 0 0.3rem; font-size: 1.6rem; }
.empty-clients p { margin: 0 0 1.2rem; font-size: 0.75rem; }
.clients-table-card { overflow: hidden; }
.client-identity { display: flex; min-width: 14rem; align-items: center; gap: 0.8rem; }
.client-avatar { flex: none; color: var(--ink); background: linear-gradient(145deg, var(--terracotta), var(--sage)); }
.client-identity div { display: grid; }
.client-identity strong { color: var(--ink); font-size: 0.75rem; }
.client-identity a, .client-identity small { color: var(--caramel); font-size: 0.63rem; }
.client-programmes { display: grid; min-width: 22rem; gap: 0.45rem; }
.client-programmes > div { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.6rem 0.7rem; border-radius: 0.8rem; background: color-mix(in srgb, var(--sand) 28%, transparent); }
.client-programmes span { display: flex; align-items: center; gap: 0.45rem; }
.client-programmes span:first-child { display: grid; gap: 0.1rem; }
.client-programmes strong, .client-programmes b { color: var(--ink); font-size: 0.67rem; }
.client-programmes small, .date-added { color: var(--ui-text-muted); font-size: 0.59rem; }
.client-actions { display: flex; align-items: center; justify-content: end; gap: 0.35rem; }
.form-reveal-enter-active, .form-reveal-leave-active { transition: opacity var(--motion-base) ease, transform var(--motion-base) var(--ease-out); }
.form-reveal-enter-from, .form-reveal-leave-to { opacity: 0; transform: translateY(-0.8rem); }
@media (max-width: 54rem) { .clients-heading { align-items: flex-start; flex-direction: column; } .client-stats { grid-template-columns: 1fr; } .field-grid { grid-template-columns: 1fr; } }
@media (max-width: 42rem) { .success-banner { align-items: start; grid-template-columns: auto minmax(0, 1fr); } .dismiss-success { grid-column: 1 / -1; justify-self: end; margin-top: -2.7rem; } .programme-row { grid-template-columns: 1fr; } .remove-programme { width: 100%; } .list-heading { align-items: stretch; flex-direction: column; } .client-search { width: 100%; } }
@media (prefers-reduced-motion: reduce) { .form-reveal-enter-active, .form-reveal-leave-active { transition: none; } }
</style>
