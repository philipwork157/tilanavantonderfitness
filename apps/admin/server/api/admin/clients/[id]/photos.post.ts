import { randomUUID } from 'node:crypto';
import {
  addCheckinPhoto,
  ClientNotFoundError,
  getCheckinForClient,
} from '../../../../services/coaching';
import { requireAdmin } from '../../../../utils/admin-auth';
import { createSignedPhotoUrl, uploadClientPhoto } from '../../../../utils/supabase-storage';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const clientId = getRouterParam(event, 'id');
  if (!clientId || !UUID.test(clientId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid client identifier.' });
  }

  const form = await readMultipartFormData(event);
  if (!form) throw createError({ statusCode: 400, statusMessage: 'No photo was uploaded.' });

  const filePart = form.find((part) => part.name === 'file' && part.filename);
  const checkinId = form.find((part) => part.name === 'checkinId')?.data.toString('utf8').trim();
  const caption = form.find((part) => part.name === 'caption')?.data.toString('utf8').trim() ?? '';

  if (!filePart || !filePart.data?.length) {
    throw createError({ statusCode: 400, statusMessage: 'No photo was uploaded.' });
  }
  if (!checkinId || !UUID.test(checkinId)) {
    throw createError({ statusCode: 400, statusMessage: 'A valid check-in is required.' });
  }
  if (filePart.data.length > MAX_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Photos must be 8 MB or smaller.' });
  }

  const contentType = filePart.type ?? 'application/octet-stream';
  const extension = EXTENSION[contentType];
  if (!extension) {
    throw createError({ statusCode: 415, statusMessage: 'Upload a JPG, PNG, WebP or HEIC image.' });
  }

  const checkin = await getCheckinForClient(clientId, checkinId).catch((error) => {
    if (error instanceof ClientNotFoundError) return null;
    throw error;
  });
  if (!checkin) {
    throw createError({ statusCode: 404, statusMessage: 'Check-in not found for this client.' });
  }

  const storagePath = `${clientId}/${checkinId}/${randomUUID()}.${extension}`;
  await uploadClientPhoto(storagePath, filePart.data, contentType);
  const photo = await addCheckinPhoto(checkinId, storagePath, caption || null);
  const url = await createSignedPhotoUrl(storagePath);

  setResponseStatus(event, 201);
  return { ok: true, photo: { id: photo.id, url, caption: photo.caption } };
});
