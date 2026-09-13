import type { AdminCatalogueProgramStatus } from '../types/catalogue';

interface CatalogueRequestError {
  data?: {
    statusMessage?: string;
    data?: { issues?: Array<{ message?: string }> };
  };
  statusMessage?: string;
  message?: string;
}

export const catalogueStatusLabels: Record<AdminCatalogueProgramStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  archived: 'Archived',
};

export const catalogueAccentOptions = [
  { label: 'Terracotta', value: 'terracotta' },
  { label: 'Sage', value: 'sage' },
  { label: 'Caramel', value: 'caramel' },
];

export function normaliseCatalogueAccent(value: string | null | undefined): string {
  if (value === 'sage' || value === 'intermediate' || value === 'nourish') return 'sage';
  if (value === 'caramel' || value === 'advanced') return 'caramel';
  return 'terracotta';
}

export function catalogueStatusColor(
  status: AdminCatalogueProgramStatus,
): 'success' | 'warning' | 'neutral' {
  if (status === 'published') return 'success';
  if (status === 'draft') return 'warning';
  return 'neutral';
}

export function formatCatalogueMoney(cents: number): string {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export function formatCatalogueFileSize(bytes: number | null): string {
  if (bytes === null) return 'Size unavailable';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function slugifyCatalogueValue(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160)
    .replace(/-+$/g, '');
}

export function catalogueErrorMessage(value: unknown, fallback: string): string {
  if (!value || typeof value !== 'object') return fallback;
  const error = value as CatalogueRequestError;
  return error.data?.data?.issues?.[0]?.message
    || error.data?.statusMessage
    || error.statusMessage
    || error.message
    || fallback;
}

export async function uploadCatalogueObject(
  reservation: { uploadUrl: string; headers: { 'Content-Type': string } },
  file: File,
): Promise<void> {
  const response = await fetch(reservation.uploadUrl, {
    method: 'PUT',
    headers: reservation.headers,
    body: file,
  });
  if (!response.ok) {
    throw new Error(`Cloudflare rejected the upload (${response.status}). Check the R2 CORS and token settings.`);
  }
}
