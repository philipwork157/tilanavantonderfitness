import type {
  CheckinCreateRequest,
  HealthProfileUpsertRequest,
} from '@tilana/contracts/coaching';
import { calculateNutrition } from '@tilana/contracts/coaching';
import {
  clientCheckinPhotos,
  clientCheckins,
  clientHealthProfiles,
  clientNutritionTargets,
  clients,
} from '@tilana/db/schema';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDatabase } from '../utils/database';
import { createSignedPhotoUrl } from '../utils/supabase-storage';

export class ClientNotFoundError extends Error {
  constructor() {
    super('Client not found.');
  }
}

export class CheckinDateExistsError extends Error {
  constructor() {
    super('A check-in already exists for that date.');
  }
}

export class MissingHealthProfileError extends Error {
  constructor() {
    super('Add a health profile before logging a check-in.');
  }
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error) && typeof error === 'object' && (error as { code?: string }).code === '23505';
}

export async function assertClientExists(clientId: string): Promise<void> {
  const [row] = await getDatabase()
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!row) throw new ClientNotFoundError();
}

export async function getHealthProfile(clientId: string) {
  const [profile] = await getDatabase()
    .select()
    .from(clientHealthProfiles)
    .where(eq(clientHealthProfiles.clientId, clientId))
    .limit(1);
  return profile ?? null;
}

export async function getLatestCheckin(clientId: string) {
  const [checkin] = await getDatabase()
    .select()
    .from(clientCheckins)
    .where(eq(clientCheckins.clientId, clientId))
    .orderBy(desc(clientCheckins.checkinDate), desc(clientCheckins.createdAt))
    .limit(1);
  return checkin ?? null;
}

export async function getLatestNutritionTarget(clientId: string) {
  const [target] = await getDatabase()
    .select()
    .from(clientNutritionTargets)
    .where(eq(clientNutritionTargets.clientId, clientId))
    .orderBy(desc(clientNutritionTargets.effectiveFrom), desc(clientNutritionTargets.createdAt))
    .limit(1);
  return target ?? null;
}

type HealthProfileRow = NonNullable<Awaited<ReturnType<typeof getHealthProfile>>>;
type CheckinRow = NonNullable<Awaited<ReturnType<typeof getLatestCheckin>>>;

/**
 * Compute a nutrition target from a profile + a check-in weight and persist it
 * as a new history row. Returns null when the profile is incomplete.
 */
async function persistNutritionTarget(
  profile: HealthProfileRow,
  checkin: CheckinRow,
  userId: string,
) {
  const result = calculateNutrition({
    biologicalSex: profile.biologicalSex,
    dateOfBirth: profile.dateOfBirth,
    heightCm: profile.heightCm,
    weightGrams: checkin.weightGrams,
    activityLevel: profile.activityLevel,
    goal: profile.goal,
    weeklyRateGrams: profile.weeklyRateGrams,
    asOf: todayIso(),
  });

  const [target] = await getDatabase()
    .insert(clientNutritionTargets)
    .values({
      clientId: profile.clientId,
      checkinId: checkin.id,
      method: result.method,
      effectiveFrom: checkin.checkinDate,
      bmrKcal: result.bmrKcal,
      tdeeKcal: result.tdeeKcal,
      targetKcal: result.targetKcal,
      proteinG: result.proteinG,
      carbsG: result.carbsG,
      fatG: result.fatG,
      createdByUserId: userId,
    })
    .returning();

  return target;
}

/** Recalculate from the current profile + latest check-in (no-op if either is missing). */
export async function recalculateNutrition(clientId: string, userId: string) {
  const [profile, checkin] = await Promise.all([
    getHealthProfile(clientId),
    getLatestCheckin(clientId),
  ]);
  if (!profile) throw new MissingHealthProfileError();
  if (!checkin) return null;
  return persistNutritionTarget(profile, checkin, userId);
}

export async function upsertHealthProfile(
  clientId: string,
  data: HealthProfileUpsertRequest,
  userId: string,
) {
  await assertClientExists(clientId);
  const db = getDatabase();

  await db
    .insert(clientHealthProfiles)
    .values({
      clientId,
      dateOfBirth: data.dateOfBirth,
      biologicalSex: data.biologicalSex,
      heightCm: data.heightCm,
      activityLevel: data.activityLevel,
      goal: data.goal,
      targetWeightGrams: data.targetWeightGrams ?? null,
      weeklyRateGrams: data.weeklyRateGrams ?? null,
      dietaryNotes: data.dietaryNotes || null,
      medicalNotes: data.medicalNotes || null,
      createdByUserId: userId,
    })
    .onConflictDoUpdate({
      target: clientHealthProfiles.clientId,
      set: {
        dateOfBirth: data.dateOfBirth,
        biologicalSex: data.biologicalSex,
        heightCm: data.heightCm,
        activityLevel: data.activityLevel,
        goal: data.goal,
        targetWeightGrams: data.targetWeightGrams ?? null,
        weeklyRateGrams: data.weeklyRateGrams ?? null,
        dietaryNotes: data.dietaryNotes || null,
        medicalNotes: data.medicalNotes || null,
        updatedAt: new Date(),
      },
    });

  // Keep the calorie target in step with the new baseline, if a weigh-in exists.
  const checkin = await getLatestCheckin(clientId);
  if (checkin) {
    const profile = await getHealthProfile(clientId);
    if (profile) await persistNutritionTarget(profile, checkin, userId);
  }

  return getHealthProfile(clientId);
}

export async function createCheckin(
  clientId: string,
  data: CheckinCreateRequest,
  userId: string,
) {
  await assertClientExists(clientId);
  const db = getDatabase();

  let checkin: CheckinRow;
  try {
    const [row] = await db
      .insert(clientCheckins)
      .values({
        clientId,
        checkinDate: data.checkinDate,
        weightGrams: data.weightGrams,
        bodyFatPctTenths: data.bodyFatPctTenths ?? null,
        waistMm: data.waistMm ?? null,
        hipsMm: data.hipsMm ?? null,
        chestMm: data.chestMm ?? null,
        neckMm: data.neckMm ?? null,
        leftArmMm: data.leftArmMm ?? null,
        rightArmMm: data.rightArmMm ?? null,
        leftThighMm: data.leftThighMm ?? null,
        rightThighMm: data.rightThighMm ?? null,
        leftCalfMm: data.leftCalfMm ?? null,
        rightCalfMm: data.rightCalfMm ?? null,
        notes: data.notes || null,
        createdByUserId: userId,
      })
      .returning();
    if (!row) throw new Error('Could not save the check-in.');
    checkin = row;
  } catch (error) {
    if (isUniqueViolation(error)) throw new CheckinDateExistsError();
    throw error;
  }

  // Auto-recalculate the calorie/macro target from the new weight.
  const profile = await getHealthProfile(clientId);
  const target = profile ? await persistNutritionTarget(profile, checkin, userId) : null;

  return { checkin, target, hasProfile: Boolean(profile) };
}

export async function addCheckinPhoto(
  checkinId: string,
  storagePath: string,
  caption: string | null,
) {
  const [photo] = await getDatabase()
    .insert(clientCheckinPhotos)
    .values({ checkinId, storagePath, caption: caption || null })
    .returning();
  if (!photo) throw new Error('Could not save the photo.');
  return photo;
}

export async function getCheckinForClient(clientId: string, checkinId: string) {
  const [checkin] = await getDatabase()
    .select()
    .from(clientCheckins)
    .where(and(eq(clientCheckins.id, checkinId), eq(clientCheckins.clientId, clientId)))
    .limit(1);
  return checkin ?? null;
}

/** Everything the client detail page needs in one call. */
export async function getClientCoachingOverview(clientId: string) {
  const db = getDatabase();

  const [client] = await db
    .select({
      id: clients.id,
      firstName: clients.firstName,
      lastName: clients.lastName,
      email: clients.email,
      phone: clients.phone,
    })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);

  if (!client) throw new ClientNotFoundError();

  const [profile, checkins, latestTarget] = await Promise.all([
    getHealthProfile(clientId),
    db
      .select()
      .from(clientCheckins)
      .where(eq(clientCheckins.clientId, clientId))
      .orderBy(desc(clientCheckins.checkinDate), desc(clientCheckins.createdAt))
      .limit(60),
    getLatestNutritionTarget(clientId),
  ]);

  const checkinIds = checkins.map((row) => row.id);
  const photoRows = checkinIds.length
    ? await db
        .select()
        .from(clientCheckinPhotos)
        .where(inArray(clientCheckinPhotos.checkinId, checkinIds))
        .orderBy(desc(clientCheckinPhotos.createdAt))
    : [];

  const photosByCheckin = new Map<string, Array<{ id: string; url: string | null; caption: string | null }>>();
  await Promise.all(
    photoRows.map(async (row) => {
      const url = await createSignedPhotoUrl(row.storagePath);
      const list = photosByCheckin.get(row.checkinId) ?? [];
      list.push({ id: row.id, url, caption: row.caption });
      photosByCheckin.set(row.checkinId, list);
    }),
  );

  return {
    client,
    profile,
    latestTarget,
    checkins: checkins.map((row) => ({
      ...row,
      photos: photosByCheckin.get(row.id) ?? [],
    })),
  };
}
