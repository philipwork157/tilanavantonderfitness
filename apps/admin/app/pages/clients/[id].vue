<script setup lang="ts">
import {
  activityLevelLabels,
  activityLevelValues,
  biologicalSexLabels,
  biologicalSexValues,
  calculateNutrition,
  coachingGoalLabels,
  coachingGoalValues,
  type ActivityLevel,
  type BiologicalSex,
  type CoachingGoal,
} from '@tilana/contracts/coaching';
import { DateFormatter, getLocalTimeZone, parseDate, today, type CalendarDate } from '@internationalized/date';

definePageMeta({ layout: 'dashboard' });

interface RequestError {
  data?: { statusMessage?: string };
}

const route = useRoute();
const clientId = computed(() => String(route.params.id));
const { data, status, error, refresh } = await useFetch(
  () => `/api/admin/clients/${clientId.value}/overview`,
  { lazy: true },
);

const todayIso = () => new Date().toISOString().slice(0, 10);

const sexOptions = biologicalSexValues.map((value) => ({ label: biologicalSexLabels[value], value }));
const activityOptions = activityLevelValues.map((value) => ({ label: activityLevelLabels[value], value }));
const goalOptions = coachingGoalValues.map((value) => ({ label: coachingGoalLabels[value], value }));

/* ---------- Health profile ---------- */
const showProfileForm = ref(false);
const savingProfile = ref(false);
const profileError = ref('');

const profileForm = reactive({
  dateOfBirth: '',
  biologicalSex: 'female' as BiologicalSex,
  heightCm: null as number | null,
  activityLevel: 'moderate' as ActivityLevel,
  goal: 'maintain' as CoachingGoal,
  targetWeightKg: null as number | null,
  weeklyRateKg: null as number | null,
  dietaryNotes: '',
  medicalNotes: '',
});

const dobFormatter = new DateFormatter('en-ZA', { dateStyle: 'long' });
const maxDob = today(getLocalTimeZone());
const dobValue = shallowRef<CalendarDate | null>(null);

const dobLabel = computed(() =>
  dobValue.value ? dobFormatter.format(dobValue.value.toDate(getLocalTimeZone())) : 'Select date of birth',
);

watch(dobValue, (value) => {
  profileForm.dateOfBirth = value
    ? `${value.year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`
    : '';
});

function openProfileForm() {
  const profile = data.value?.profile;
  profileForm.dateOfBirth = profile?.dateOfBirth ?? '';
  profileForm.biologicalSex = (profile?.biologicalSex as BiologicalSex) ?? 'female';
  profileForm.heightCm = profile?.heightCm ?? null;
  profileForm.activityLevel = (profile?.activityLevel as ActivityLevel) ?? 'moderate';
  profileForm.goal = (profile?.goal as CoachingGoal) ?? 'maintain';
  profileForm.targetWeightKg = profile?.targetWeightGrams ? profile.targetWeightGrams / 1000 : null;
  profileForm.weeklyRateKg = profile?.weeklyRateGrams ? profile.weeklyRateGrams / 1000 : null;
  profileForm.dietaryNotes = profile?.dietaryNotes ?? '';
  profileForm.medicalNotes = profile?.medicalNotes ?? '';
  try {
    dobValue.value = profile?.dateOfBirth ? parseDate(profile.dateOfBirth) : null;
  } catch {
    dobValue.value = null;
  }
  profileError.value = '';
  showProfileForm.value = true;
}

async function saveProfile() {
  profileError.value = '';
  if (!profileForm.dateOfBirth || !profileForm.heightCm) {
    profileError.value = 'Date of birth and height are required.';
    return;
  }
  savingProfile.value = true;
  try {
    await $fetch(`/api/admin/clients/${clientId.value}/health-profile`, {
      method: 'PUT',
      body: {
        dateOfBirth: profileForm.dateOfBirth,
        biologicalSex: profileForm.biologicalSex,
        heightCm: Math.round(profileForm.heightCm),
        activityLevel: profileForm.activityLevel,
        goal: profileForm.goal,
        targetWeightGrams: profileForm.targetWeightKg ? Math.round(profileForm.targetWeightKg * 1000) : null,
        weeklyRateGrams: profileForm.weeklyRateKg ? Math.round(profileForm.weeklyRateKg * 1000) : null,
        dietaryNotes: profileForm.dietaryNotes,
        medicalNotes: profileForm.medicalNotes,
      },
    });
    showProfileForm.value = false;
    await refresh();
  } catch (requestError) {
    profileError.value =
      (requestError as RequestError).data?.statusMessage ?? 'Could not save the health profile.';
  } finally {
    savingProfile.value = false;
  }
}

/* ---------- Check-ins ---------- */
const showCheckinForm = ref(false);
const savingCheckin = ref(false);
const checkinError = ref('');

const checkinForm = reactive({
  checkinDate: todayIso(),
  weightKg: null as number | null,
  bodyFatPct: null as number | null,
  waistCm: null as number | null,
  hipsCm: null as number | null,
  chestCm: null as number | null,
  neckCm: null as number | null,
  leftArmCm: null as number | null,
  rightArmCm: null as number | null,
  leftThighCm: null as number | null,
  rightThighCm: null as number | null,
  leftCalfCm: null as number | null,
  rightCalfCm: null as number | null,
  notes: '',
});

function resetCheckinForm() {
  checkinForm.checkinDate = todayIso();
  checkinForm.weightKg = null;
  checkinForm.bodyFatPct = null;
  checkinForm.waistCm = null;
  checkinForm.hipsCm = null;
  checkinForm.chestCm = null;
  checkinForm.neckCm = null;
  checkinForm.leftArmCm = null;
  checkinForm.rightArmCm = null;
  checkinForm.leftThighCm = null;
  checkinForm.rightThighCm = null;
  checkinForm.leftCalfCm = null;
  checkinForm.rightCalfCm = null;
  checkinForm.notes = '';
  checkinError.value = '';
}

function openCheckinForm() {
  resetCheckinForm();
  showCheckinForm.value = true;
}

const cmToMm = (value: number | null) => (value ? Math.round(value * 10) : null);

async function saveCheckin() {
  checkinError.value = '';
  if (!checkinForm.checkinDate || !checkinForm.weightKg) {
    checkinError.value = 'A date and weight are required.';
    return;
  }
  savingCheckin.value = true;
  try {
    await $fetch(`/api/admin/clients/${clientId.value}/checkins`, {
      method: 'POST',
      body: {
        checkinDate: checkinForm.checkinDate,
        weightGrams: Math.round(checkinForm.weightKg * 1000),
        bodyFatPctTenths: checkinForm.bodyFatPct != null ? Math.round(checkinForm.bodyFatPct * 10) : null,
        waistMm: cmToMm(checkinForm.waistCm),
        hipsMm: cmToMm(checkinForm.hipsCm),
        chestMm: cmToMm(checkinForm.chestCm),
        neckMm: cmToMm(checkinForm.neckCm),
        leftArmMm: cmToMm(checkinForm.leftArmCm),
        rightArmMm: cmToMm(checkinForm.rightArmCm),
        leftThighMm: cmToMm(checkinForm.leftThighCm),
        rightThighMm: cmToMm(checkinForm.rightThighCm),
        leftCalfMm: cmToMm(checkinForm.leftCalfCm),
        rightCalfMm: cmToMm(checkinForm.rightCalfCm),
        notes: checkinForm.notes,
      },
    });
    showCheckinForm.value = false;
    await refresh();
  } catch (requestError) {
    checkinError.value =
      (requestError as RequestError).data?.statusMessage ?? 'Could not save the check-in.';
  } finally {
    savingCheckin.value = false;
  }
}

/* ---------- Recalculate ---------- */
const recalculating = ref(false);
const recalcError = ref('');
async function recalculate() {
  recalcError.value = '';
  recalculating.value = true;
  try {
    await $fetch(`/api/admin/clients/${clientId.value}/recalculate`, { method: 'POST' });
    await refresh();
  } catch (requestError) {
    recalcError.value =
      (requestError as RequestError).data?.statusMessage ?? 'Could not recalculate.';
  } finally {
    recalculating.value = false;
  }
}

/* ---------- Photo upload ---------- */
const uploadingFor = ref<number | null>(null);
const photoError = ref('');
async function uploadPhoto(checkinId: number, fileEvent: Event) {
  const input = fileEvent.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  photoError.value = '';
  uploadingFor.value = checkinId;
  try {
    const body = new FormData();
    body.append('file', file);
    body.append('checkinId', String(checkinId));
    await $fetch(`/api/admin/clients/${clientId.value}/photos`, { method: 'POST', body });
    await refresh();
  } catch (requestError) {
    photoError.value =
      (requestError as RequestError).data?.statusMessage ?? 'Could not upload the photo.';
  } finally {
    uploadingFor.value = null;
    input.value = '';
  }
}
/* ---------- Derived / formatting ---------- */
const profile = computed(() => data.value?.profile ?? null);
const latestCheckin = computed(() => data.value?.checkins?.[0] ?? null);
const target = computed(() => data.value?.latestTarget ?? null);

const fullName = computed(() => {
  const client = data.value?.client;
  return client ? `${client.firstName} ${client.lastName}` : 'Client';
});

function fmtKg(grams: number | null | undefined) {
  if (grams == null) return '—';
  return `${(grams / 1000).toFixed(1)} kg`;
}
function fmtCm(mm: number | null | undefined) {
  if (mm == null) return '—';
  return `${(mm / 10).toFixed(1)} cm`;
}
function fmtDate(value: string | Date | null | undefined) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeZone: 'Africa/Johannesburg' }).format(
    new Date(value),
  );
}

// Live preview of what the target would be from the current profile form + latest weight.
const preview = computed(() => {
  const weightGrams = latestCheckin.value?.weightGrams ?? (checkinForm.weightKg ? checkinForm.weightKg * 1000 : null);
  if (!profileForm.dateOfBirth || !profileForm.heightCm || !weightGrams) return null;
  try {
    return calculateNutrition({
      biologicalSex: profileForm.biologicalSex,
      dateOfBirth: profileForm.dateOfBirth,
      heightCm: Math.round(profileForm.heightCm),
      weightGrams: Math.round(weightGrams),
      activityLevel: profileForm.activityLevel,
      goal: profileForm.goal,
      weeklyRateGrams: profileForm.weeklyRateKg ? Math.round(profileForm.weeklyRateKg * 1000) : null,
      asOf: todayIso(),
    });
  } catch {
    return null;
  }
});

useSeoMeta({ title: () => `${fullName.value} | Tilana Admin`, robots: 'noindex, nofollow' });
</script>

<template>
  <div class="client-detail">
    <div class="detail-topbar">
      <UButton to="/clients" icon="i-lucide-arrow-left" color="neutral" variant="ghost" label="All clients" />
    </div>

    <USkeleton v-if="status === 'pending'" class="h-96 rounded-3xl" />

    <UAlert
      v-else-if="error"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      title="Could not load this client"
      description="Please check the connection and try again."
    />

    <template v-else>
      <section class="detail-heading">
        <div>
          <p class="eyebrow">Client check-ins</p>
          <h1>{{ fullName }}</h1>
          <p class="contact-line">
            <a :href="`mailto:${data?.client.email}`">{{ data?.client.email }}</a>
            <span v-if="data?.client.phone"> · {{ data?.client.phone }}</span>
          </p>
        </div>
      </section>

      <div class="detail-grid">
        <!-- Health profile -->
        <UCard class="panel">
          <template #header>
            <div class="panel-head">
              <h2>Health profile</h2>
              <UButton
                :icon="profile ? 'i-lucide-pencil' : 'i-lucide-plus'"
                :label="profile ? 'Edit' : 'Add profile'"
                size="sm"
                color="neutral"
                variant="soft"
                @click="openProfileForm"
              />
            </div>
          </template>

          <div v-if="!profile" class="panel-empty">
            <UIcon name="i-lucide-clipboard-list" />
            <p>Add a health profile (age, sex, height, activity, goal) to unlock calorie targets.</p>
          </div>

          <dl v-else class="profile-list">
            <div><dt>Date of birth</dt><dd>{{ fmtDate(profile.dateOfBirth) }}</dd></div>
            <div><dt>Biological sex</dt><dd>{{ biologicalSexLabels[profile.biologicalSex as BiologicalSex] }}</dd></div>
            <div><dt>Height</dt><dd>{{ profile.heightCm }} cm</dd></div>
            <div><dt>Activity</dt><dd>{{ activityLevelLabels[profile.activityLevel as ActivityLevel] }}</dd></div>
            <div><dt>Goal</dt><dd>{{ coachingGoalLabels[profile.goal as CoachingGoal] }}</dd></div>
            <div><dt>Target weight</dt><dd>{{ fmtKg(profile.targetWeightGrams) }}</dd></div>
            <div><dt>Weekly rate</dt><dd>{{ profile.weeklyRateGrams ? fmtKg(profile.weeklyRateGrams) + '/week' : '—' }}</dd></div>
            <div v-if="profile.dietaryNotes" class="span-2"><dt>Dietary notes</dt><dd>{{ profile.dietaryNotes }}</dd></div>
            <div v-if="profile.medicalNotes" class="span-2"><dt>Medical notes</dt><dd>{{ profile.medicalNotes }}</dd></div>
          </dl>
        </UCard>

        <!-- Calorie target -->
        <UCard class="panel target-panel">
          <template #header>
            <div class="panel-head">
              <h2>Calorie target</h2>
              <UButton
                icon="i-lucide-refresh-cw"
                label="Recalculate"
                size="sm"
                color="neutral"
                variant="soft"
                :loading="recalculating"
                :disabled="!profile || !latestCheckin"
                @click="recalculate"
              />
            </div>
          </template>

          <UAlert v-if="recalcError" color="error" variant="soft" class="mb-4" :title="recalcError" />

          <div v-if="!target" class="panel-empty">
            <UIcon name="i-lucide-flame" />
            <p>{{ profile ? 'Log a check-in to calculate daily calories and macros.' : 'Add a health profile and a check-in first.' }}</p>
          </div>

          <div v-else class="target-body">
            <div class="target-hero">
              <span class="target-kcal">{{ target.targetKcal.toLocaleString() }}</span>
              <span class="target-unit">kcal / day</span>
              <span class="target-sub">to {{ coachingGoalLabels[profile?.goal as CoachingGoal] ?? 'maintain' }}</span>
            </div>
            <div class="target-stats">
              <div><span>BMR</span><strong>{{ target.bmrKcal.toLocaleString() }}</strong></div>
              <div><span>Maintenance</span><strong>{{ target.tdeeKcal.toLocaleString() }}</strong></div>
            </div>
            <div class="macro-row">
              <div class="macro macro-p"><span>Protein</span><strong>{{ target.proteinG }}g</strong></div>
              <div class="macro macro-c"><span>Carbs</span><strong>{{ target.carbsG }}g</strong></div>
              <div class="macro macro-f"><span>Fat</span><strong>{{ target.fatG }}g</strong></div>
            </div>
            <p class="target-foot">Based on {{ fmtKg(latestCheckin?.weightGrams) }} · updated {{ fmtDate(target.effectiveFrom) }}</p>
          </div>
        </UCard>
      </div>

      <!-- Check-ins -->
      <section class="checkins">
        <div class="panel-head checkins-head">
          <h2>Check-ins</h2>
          <UButton icon="i-lucide-plus" label="Log check-in" color="primary" @click="openCheckinForm" />
        </div>

        <UAlert v-if="photoError" color="error" variant="soft" :title="photoError" />

        <div v-if="!data?.checkins.length" class="panel-empty big">
          <UIcon name="i-lucide-calendar-check" />
          <p>No check-ins yet. Log the first weigh-in to start tracking progress.</p>
        </div>

        <UCard v-else class="checkins-card" :ui="{ body: 'p-0 sm:p-0' }">
          <div class="checkin-list">
            <article v-for="checkin in data.checkins" :key="checkin.id" class="checkin-row">
              <div class="checkin-main">
                <div class="checkin-date">
                  <strong>{{ fmtDate(checkin.checkinDate) }}</strong>
                  <span>{{ fmtKg(checkin.weightGrams) }}</span>
                </div>
                <div class="checkin-measures">
                  <span v-if="checkin.bodyFatPctTenths != null">Body fat {{ (checkin.bodyFatPctTenths / 10).toFixed(1) }}%</span>
                  <span v-if="checkin.waistMm != null">Waist {{ fmtCm(checkin.waistMm) }}</span>
                  <span v-if="checkin.hipsMm != null">Hips {{ fmtCm(checkin.hipsMm) }}</span>
                  <span v-if="checkin.chestMm != null">Chest {{ fmtCm(checkin.chestMm) }}</span>
                  <span v-if="checkin.neckMm != null">Neck {{ fmtCm(checkin.neckMm) }}</span>
                  <span v-if="checkin.leftArmMm != null">L arm {{ fmtCm(checkin.leftArmMm) }}</span>
                  <span v-if="checkin.rightArmMm != null">R arm {{ fmtCm(checkin.rightArmMm) }}</span>
                  <span v-if="checkin.leftThighMm != null">L thigh {{ fmtCm(checkin.leftThighMm) }}</span>
                  <span v-if="checkin.rightThighMm != null">R thigh {{ fmtCm(checkin.rightThighMm) }}</span>
                  <span v-if="checkin.leftCalfMm != null">L calf {{ fmtCm(checkin.leftCalfMm) }}</span>
                  <span v-if="checkin.rightCalfMm != null">R calf {{ fmtCm(checkin.rightCalfMm) }}</span>
                </div>
                <p v-if="checkin.notes" class="checkin-notes">{{ checkin.notes }}</p>
              </div>

              <div class="checkin-photos">
                <a
                  v-for="photo in checkin.photos"
                  :key="photo.id"
                  :href="photo.url ?? undefined"
                  target="_blank"
                  rel="noopener"
                  class="photo-thumb"
                >
                  <img v-if="photo.url" :src="photo.url" :alt="photo.caption ?? 'Progress photo'">
                </a>
                <label class="photo-add" :class="{ busy: uploadingFor === checkin.id }">
                  <UIcon :name="uploadingFor === checkin.id ? 'i-lucide-loader-circle' : 'i-lucide-image-plus'" />
                  <input type="file" accept="image/*" hidden @change="(event: Event) => uploadPhoto(checkin.id, event)">
                </label>
              </div>
            </article>
          </div>
        </UCard>
      </section>
    </template>

    <!-- Profile edit modal -->
    <UModal v-model:open="showProfileForm" title="Health profile">
      <template #body>
        <form class="stack-form" @submit.prevent="saveProfile">
          <UAlert v-if="profileError" color="error" variant="soft" :title="profileError" />
          <div class="form-grid">
            <UFormField label="Date of birth" required>
              <UPopover>
                <UButton
                  color="neutral"
                  variant="outline"
                  icon="i-lucide-calendar"
                  class="w-full justify-start font-normal"
                  :label="dobLabel"
                />
                <template #content>
                  <UCalendar v-model="dobValue" :max-value="maxDob" class="p-2" />
                </template>
              </UPopover>
            </UFormField>
            <UFormField label="Biological sex" required>
              <USelect v-model="profileForm.biologicalSex" :items="sexOptions" value-key="value" class="w-full" />
            </UFormField>
            <UFormField label="Height (cm)" required>
              <UInput v-model.number="profileForm.heightCm" type="number" min="50" max="300" class="w-full" />
            </UFormField>
            <UFormField label="Activity level" required>
              <USelect v-model="profileForm.activityLevel" :items="activityOptions" value-key="value" class="w-full" />
            </UFormField>
            <UFormField label="Goal" required>
              <USelect v-model="profileForm.goal" :items="goalOptions" value-key="value" class="w-full" />
            </UFormField>
            <UFormField label="Target weight (kg)">
              <UInput v-model.number="profileForm.targetWeightKg" type="number" step="0.1" min="20" class="w-full" />
            </UFormField>
            <UFormField label="Weekly rate (kg/week)" help="How fast to lose or gain, e.g. 0.5">
              <UInput v-model.number="profileForm.weeklyRateKg" type="number" step="0.1" min="0" max="2" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="Dietary notes">
            <UTextarea v-model="profileForm.dietaryNotes" :rows="2" class="w-full" />
          </UFormField>
          <UFormField label="Medical notes">
            <UTextarea v-model="profileForm.medicalNotes" :rows="2" class="w-full" />
          </UFormField>

          <div v-if="preview" class="preview-box">
            <span>Preview</span>
            <strong>{{ preview.targetKcal.toLocaleString() }} kcal/day</strong>
            <small>BMR {{ preview.bmrKcal.toLocaleString() }} · Maintenance {{ preview.tdeeKcal.toLocaleString() }} · P{{ preview.proteinG }}/C{{ preview.carbsG }}/F{{ preview.fatG }}</small>
          </div>

          <div class="form-actions">
            <UButton label="Cancel" color="neutral" variant="ghost" @click="showProfileForm = false" />
            <UButton type="submit" label="Save profile" :loading="savingProfile" />
          </div>
        </form>
      </template>
    </UModal>

    <!-- Check-in modal -->
    <UModal v-model:open="showCheckinForm" title="Log check-in">
      <template #body>
        <form class="stack-form" @submit.prevent="saveCheckin">
          <UAlert v-if="checkinError" color="error" variant="soft" :title="checkinError" />
          <div class="form-grid">
            <UFormField label="Date" required>
              <UInput v-model="checkinForm.checkinDate" type="date" class="w-full" />
            </UFormField>
            <UFormField label="Weight (kg)" required>
              <UInput v-model.number="checkinForm.weightKg" type="number" step="0.1" min="20" class="w-full" />
            </UFormField>
            <UFormField label="Body fat (%)"><UInput v-model.number="checkinForm.bodyFatPct" type="number" step="0.1" min="0" max="100" class="w-full" /></UFormField>
            <UFormField label="Waist (cm)"><UInput v-model.number="checkinForm.waistCm" type="number" step="0.1" class="w-full" /></UFormField>
            <UFormField label="Hips (cm)"><UInput v-model.number="checkinForm.hipsCm" type="number" step="0.1" class="w-full" /></UFormField>
            <UFormField label="Chest (cm)"><UInput v-model.number="checkinForm.chestCm" type="number" step="0.1" class="w-full" /></UFormField>
            <UFormField label="Neck (cm)"><UInput v-model.number="checkinForm.neckCm" type="number" step="0.1" class="w-full" /></UFormField>
            <UFormField label="Left arm (cm)"><UInput v-model.number="checkinForm.leftArmCm" type="number" step="0.1" class="w-full" /></UFormField>
            <UFormField label="Right arm (cm)"><UInput v-model.number="checkinForm.rightArmCm" type="number" step="0.1" class="w-full" /></UFormField>
            <UFormField label="Left thigh (cm)"><UInput v-model.number="checkinForm.leftThighCm" type="number" step="0.1" class="w-full" /></UFormField>
            <UFormField label="Right thigh (cm)"><UInput v-model.number="checkinForm.rightThighCm" type="number" step="0.1" class="w-full" /></UFormField>
            <UFormField label="Left calf (cm)"><UInput v-model.number="checkinForm.leftCalfCm" type="number" step="0.1" class="w-full" /></UFormField>
            <UFormField label="Right calf (cm)"><UInput v-model.number="checkinForm.rightCalfCm" type="number" step="0.1" class="w-full" /></UFormField>
          </div>
          <UFormField label="Notes">
            <UTextarea v-model="checkinForm.notes" :rows="2" class="w-full" />
          </UFormField>

          <div v-if="preview" class="preview-box">
            <span>New target</span>
            <strong>{{ preview.targetKcal.toLocaleString() }} kcal/day</strong>
            <small>Saving recalculates automatically.</small>
          </div>
          <p v-else-if="!profile" class="preview-hint">Add a health profile to calculate calories from this check-in.</p>

          <div class="form-actions">
            <UButton label="Cancel" color="neutral" variant="ghost" @click="showCheckinForm = false" />
            <UButton type="submit" label="Save check-in" :loading="savingCheckin" />
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.client-detail { display: grid; gap: 1.5rem; }
.detail-topbar { display: flex; }

.detail-heading {
  padding: clamp(1.5rem, 3vw, 2.5rem);
  border: 1px solid var(--color-border);
  border-radius: 2rem;
  background:
    radial-gradient(circle at 92% 20%, color-mix(in srgb, var(--sage) 55%, transparent), transparent 25%),
    color-mix(in srgb, var(--white) 86%, var(--cream));
  box-shadow: var(--shadow-sm);
}
.eyebrow {
  margin: 0 0 0.45rem;
  color: var(--caramel);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}
h1 {
  margin: 0;
  color: var(--ink);
  font-family: var(--font-heading);
  font-size: clamp(2.2rem, 5vw, 3.8rem);
  font-weight: 600;
  letter-spacing: -0.05em;
  line-height: 1;
}
.contact-line { margin: 0.75rem 0 0; font-size: 0.8rem; }
.contact-line a { color: var(--caramel); }

.detail-grid { display: grid; gap: 1.5rem; grid-template-columns: 1fr 1fr; }

.panel { border-radius: 1.8rem; box-shadow: var(--shadow-sm); }
.panel-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.panel-head h2 { margin: 0; color: var(--ink); font-family: var(--font-heading); font-size: 1.15rem; }

.panel-empty { display: grid; gap: 0.6rem; place-items: center; padding: 1.5rem 1rem; text-align: center; color: var(--chocolate); }
.panel-empty :deep(svg) { width: 2rem; height: 2rem; color: var(--caramel); }
.panel-empty p { margin: 0; max-width: 28rem; font-size: 0.78rem; line-height: 1.6; }
.panel-empty.big { min-height: 12rem; align-content: center; border: 1px dashed var(--color-border); border-radius: 1.8rem; }

.profile-list { display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem 1.2rem; margin: 0; }
.profile-list .span-2 { grid-column: 1 / -1; }
.profile-list dt { color: var(--ui-text-muted); font-size: 0.64rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
.profile-list dd { margin: 0.15rem 0 0; color: var(--ink); font-size: 0.86rem; }

.target-panel { background: color-mix(in srgb, var(--terracotta) 12%, var(--white)); }
.target-body { display: grid; gap: 1rem; }
.target-hero { display: flex; align-items: baseline; flex-wrap: wrap; gap: 0.4rem 0.6rem; }
.target-kcal { color: var(--ink); font-family: var(--font-heading); font-size: 3rem; line-height: 1; }
.target-unit { color: var(--caramel); font-size: 0.9rem; font-weight: 700; }
.target-sub { width: 100%; color: var(--chocolate); font-size: 0.72rem; }
.target-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
.target-stats div { padding: 0.7rem 0.9rem; border-radius: 1rem; background: color-mix(in srgb, var(--white) 70%, transparent); }
.target-stats span { display: block; color: var(--ui-text-muted); font-size: 0.62rem; font-weight: 700; text-transform: uppercase; }
.target-stats strong { color: var(--ink); font-family: var(--font-heading); font-size: 1.3rem; }
.macro-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.6rem; }
.macro { padding: 0.65rem; border-radius: 0.9rem; text-align: center; }
.macro span { display: block; font-size: 0.62rem; font-weight: 700; text-transform: uppercase; }
.macro strong { font-family: var(--font-heading); font-size: 1.15rem; color: var(--ink); }
.macro-p { background: color-mix(in srgb, var(--sage) 70%, var(--cream)); }
.macro-c { background: color-mix(in srgb, var(--caramel) 30%, var(--cream)); }
.macro-f { background: color-mix(in srgb, var(--terracotta) 40%, var(--cream)); }
.target-foot { margin: 0; color: var(--ui-text-muted); font-size: 0.68rem; }

.checkins { display: grid; gap: 1rem; }
.checkins-head h2 { font-size: 1.3rem; }
.checkins-card { border-radius: 1.8rem; box-shadow: var(--shadow-md); }
.checkin-list { display: grid; }
.checkin-row {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 1.5rem;
  padding: 1.1rem 1.3rem;
  border-bottom: 1px solid var(--color-border);
}
.checkin-row:last-child { border-bottom: none; }
.checkin-main { min-width: 0; display: grid; gap: 0.45rem; }
.checkin-date { display: flex; align-items: baseline; gap: 0.8rem; }
.checkin-date strong { color: var(--ink); font-size: 0.95rem; }
.checkin-date span { color: var(--caramel); font-weight: 700; font-size: 0.95rem; }
.checkin-measures { display: flex; flex-wrap: wrap; gap: 0.4rem 0.9rem; color: var(--chocolate); font-size: 0.72rem; }
.checkin-notes { margin: 0; color: var(--ui-text-muted); font-size: 0.72rem; font-style: italic; }

.checkin-photos { display: flex; align-items: center; gap: 0.5rem; flex: none; }
.photo-thumb { display: block; width: 3.2rem; height: 3.2rem; overflow: hidden; border-radius: 0.7rem; background: var(--sage); }
.photo-thumb img { width: 100%; height: 100%; object-fit: cover; }
.photo-add {
  display: grid; place-items: center; width: 3.2rem; height: 3.2rem;
  border: 1px dashed var(--color-border); border-radius: 0.7rem; cursor: pointer; color: var(--caramel);
  background: color-mix(in srgb, var(--white) 60%, transparent);
}
.photo-add.busy { opacity: 0.6; pointer-events: none; }

.stack-form { display: grid; gap: 1rem; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem; }
.form-actions { display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 0.5rem; }

.preview-box {
  display: grid; gap: 0.15rem; padding: 0.9rem 1.1rem; border-radius: 1rem;
  background: color-mix(in srgb, var(--sage) 45%, var(--cream));
}
.preview-box span { color: var(--ui-text-muted); font-size: 0.6rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
.preview-box strong { color: var(--ink); font-family: var(--font-heading); font-size: 1.4rem; }
.preview-box small { color: var(--chocolate); font-size: 0.7rem; }
.preview-hint { margin: 0; color: var(--ui-text-muted); font-size: 0.72rem; }

@media (max-width: 60rem) {
  .detail-grid { grid-template-columns: 1fr; }
}
@media (max-width: 42rem) {
  .form-grid { grid-template-columns: 1fr; }
  .checkin-row { flex-direction: column; }
  .checkin-photos { flex-wrap: wrap; }
}
</style>
