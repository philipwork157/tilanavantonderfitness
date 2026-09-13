import type {
  AdminProgramMediaUploadRequest,
  AdminProgramVolumeUpdateRequest,
} from '@tilana/contracts/catalogue';

export interface CataloguePublicationIssue {
  code: string;
  message: string;
  volumeId?: number;
}

export interface CataloguePublicationCandidate {
  cardLabel: string | null;
  headline: string | null;
  description: string | null;
  accent: string | null;
  hasReadyCover: boolean;
  volumes: Array<{
    id: number;
    slug: string | null;
    name: string;
    isPublished: boolean;
    priceCents: number;
    currency: string;
    hasReadyFile: boolean;
  }>;
}

export interface ExpectedUploadMetadata {
  contentType: string;
  sizeBytes: number;
}

export interface UploadedObjectMetadata {
  contentType?: string;
  sizeBytes?: number;
  etag?: string;
}

export interface ProgramFileReplacementCandidate {
  id: number;
  programVolumeId: number;
  uploadStatus: 'pending' | 'ready' | 'failed';
  isActive: boolean;
}

export type ProgramFileReplacementIssue =
  | 'same_file'
  | 'not_found'
  | 'different_volume'
  | 'not_active_ready';

export interface ProgramVolumeAuditSnapshot {
  currentPriceCents: number;
  currency: string;
  isPublished: boolean;
}

export interface CatalogueAuditEventInput {
  action: string;
  changeSummary: Record<string, unknown>;
}

export class CatalogueStorageVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogueStorageVerificationError';
  }
}

const IMAGE_EXTENSIONS: Record<AdminProgramMediaUploadRequest['contentType'], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

function hasText(value: string | null): boolean {
  return Boolean(value?.trim());
}

export function getCataloguePublicationIssues(
  candidate: CataloguePublicationCandidate,
): CataloguePublicationIssue[] {
  const issues: CataloguePublicationIssue[] = [];

  if (!hasText(candidate.cardLabel)) {
    issues.push({ code: 'missing_card_label', message: 'Add the program card label.' });
  }
  if (!hasText(candidate.headline)) {
    issues.push({ code: 'missing_headline', message: 'Add the program headline.' });
  }
  if (!hasText(candidate.description)) {
    issues.push({ code: 'missing_description', message: 'Add the program description.' });
  }
  if (!hasText(candidate.accent)) {
    issues.push({ code: 'missing_accent', message: 'Choose a program accent.' });
  }
  if (!candidate.hasReadyCover) {
    issues.push({ code: 'missing_cover', message: 'Upload and finalize a program cover image.' });
  }

  const publishedVolumes = candidate.volumes.filter(volume => volume.isPublished);
  if (publishedVolumes.length === 0) {
    issues.push({ code: 'missing_published_volume', message: 'Publish at least one program volume.' });
  }

  for (const volume of publishedVolumes) {
    if (!hasText(volume.slug)) {
      issues.push({
        code: 'volume_missing_slug',
        message: `${volume.name} needs a checkout slug.`,
        volumeId: volume.id,
      });
    }
    if (volume.priceCents <= 0) {
      issues.push({
        code: 'volume_invalid_price',
        message: `${volume.name} needs a price greater than zero.`,
        volumeId: volume.id,
      });
    }
    if (volume.currency !== 'ZAR') {
      issues.push({
        code: 'volume_unsupported_currency',
        message: `${volume.name} must use ZAR.`,
        volumeId: volume.id,
      });
    }
    if (!volume.hasReadyFile) {
      issues.push({
        code: 'volume_missing_file',
        message: `${volume.name} needs a finalized PDF.`,
        volumeId: volume.id,
      });
    }
  }

  return issues;
}

export function getVolumePublicationIssues(volume: CataloguePublicationCandidate['volumes'][number]) {
  return getCataloguePublicationIssues({
    cardLabel: 'not-applicable',
    headline: 'not-applicable',
    description: 'not-applicable',
    accent: 'not-applicable',
    hasReadyCover: true,
    volumes: [{ ...volume, isPublished: true }],
  }).filter(issue => issue.volumeId === volume.id);
}

export function getProgramFileReplacementIssue(
  file: Pick<ProgramFileReplacementCandidate, 'id' | 'programVolumeId'>,
  replacement: ProgramFileReplacementCandidate | null,
): ProgramFileReplacementIssue | null {
  if (!replacement) return 'not_found';
  if (replacement.id === file.id) return 'same_file';
  if (replacement.programVolumeId !== file.programVolumeId) return 'different_volume';
  if (replacement.uploadStatus !== 'ready' || !replacement.isActive) return 'not_active_ready';
  return null;
}

export function getProgramVolumeAuditEvents(
  existing: ProgramVolumeAuditSnapshot,
  updated: ProgramVolumeAuditSnapshot,
  input: AdminProgramVolumeUpdateRequest,
): CatalogueAuditEventInput[] {
  const events: CatalogueAuditEventInput[] = [];
  const fields = Object.keys(input);
  const priceChanged = existing.currentPriceCents !== updated.currentPriceCents
    || existing.currency !== updated.currency;
  const publicationChanged = existing.isPublished !== updated.isPublished;

  if (priceChanged) {
    events.push({
      action: 'price_changed',
      changeSummary: {
        previousPriceCents: existing.currentPriceCents,
        priceCents: updated.currentPriceCents,
        previousCurrency: existing.currency,
        currency: updated.currency,
      },
    });
  }
  if (publicationChanged) {
    events.push({
      action: updated.isPublished ? 'published' : 'unpublished',
      changeSummary: {
        previousIsPublished: existing.isPublished,
        isPublished: updated.isPublished,
      },
    });
  }

  const ordinaryFields = fields.filter(field => !['currentPriceCents', 'currency', 'isPublished'].includes(field));
  if (ordinaryFields.length > 0 || events.length === 0) {
    events.push({
      action: 'updated',
      changeSummary: { fields: ordinaryFields.length > 0 ? ordinaryFields : fields },
    });
  }
  return events;
}

export function safeObjectName(filename: string): string {
  const leafName = filename.split(/[/\\]/).at(-1) ?? filename;
  const withoutExtension = leafName.replace(/\.[^.]*$/, '');
  const normalized = withoutExtension
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
    .replace(/-+$/g, '');

  return normalized || 'program-file';
}

export function buildProgramMediaObjectKey(
  programId: number,
  mediaId: number,
  version: number,
  filename: string,
  contentType: AdminProgramMediaUploadRequest['contentType'],
): string {
  return `programs/${programId}/media/${mediaId}/v${version}-${safeObjectName(filename)}.${IMAGE_EXTENSIONS[contentType]}`;
}

export function buildProgramFileObjectKey(
  programId: number,
  volumeId: number,
  fileId: number,
  version: number,
  filename: string,
): string {
  return `programs/${programId}/volumes/${volumeId}/files/${fileId}/v${version}-${safeObjectName(filename)}.pdf`;
}

export function verifyUploadedObject(
  expected: ExpectedUploadMetadata,
  actual: UploadedObjectMetadata,
): { etag: string | null } {
  const actualContentType = actual.contentType?.split(';', 1)[0]?.trim().toLowerCase();
  if (actualContentType !== expected.contentType.toLowerCase()) {
    throw new CatalogueStorageVerificationError('The uploaded file type does not match the reserved upload.');
  }
  if (actual.sizeBytes !== expected.sizeBytes) {
    throw new CatalogueStorageVerificationError('The uploaded file size does not match the reserved upload.');
  }

  return { etag: actual.etag?.replace(/^"|"$/g, '') || null };
}

export function publicObjectUrl(baseUrl: string, objectKey: string): string {
  const normalizedBase = baseUrl.trim().replace(/\/+$/, '');
  if (!/^https:\/\//.test(normalizedBase)) {
    throw new Error('The public media base URL must use HTTPS.');
  }

  const encodedKey = objectKey.split('/').map(segment => encodeURIComponent(segment)).join('/');
  return `${normalizedBase}/${encodedKey}`;
}
