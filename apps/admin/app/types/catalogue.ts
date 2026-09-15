export type AdminCatalogueProgramStatus = 'draft' | 'published' | 'archived';
export type AdminCatalogueUploadStatus = 'pending' | 'ready' | 'failed';

export interface AdminCatalogueMedia {
  id: number;
  kind: 'cover';
  displayName: string;
  altText: string;
  contentType: string;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  version: number;
  sortOrder: number;
  uploadStatus: AdminCatalogueUploadStatus;
  isActive: boolean;
  createdAt: string | Date;
  publicUrl: string | null;
}

export interface AdminCatalogueFile {
  id: number;
  programVolumeId: number;
  displayName: string;
  originalFilename: string | null;
  contentType: string;
  sizeBytes: number | null;
  uploadStatus: AdminCatalogueUploadStatus;
  etag: string | null;
  version: number;
  sortOrder: number;
  isActive: boolean;
  createdAt: string | Date;
}

export interface AdminCatalogueVolume {
  id: number;
  programId: number;
  slug: string | null;
  volumeNumber: number;
  name: string;
  description: string | null;
  currentPriceCents: number;
  currency: string;
  sortOrder: number;
  isPublished: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
  files: AdminCatalogueFile[];
  salesCount: number;
  grossSalesCents: number;
  buyerCount: number;
  accessCount: number;
}

export interface AdminCatalogueProgram {
  id: number;
  slug: string;
  name: string;
  cardLabel: string | null;
  headline: string | null;
  description: string | null;
  accent: string | null;
  sortOrder: number;
  status: AdminCatalogueProgramStatus;
  publishedAt: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  media: AdminCatalogueMedia[];
  volumes: AdminCatalogueVolume[];
  salesCount: number;
  grossSalesCents: number;
  buyerCount: number;
  accessCount: number;
}

export interface AdminCatalogueProgramsResponse {
  programs: AdminCatalogueProgram[];
}

export interface AdminCatalogueProgramResponse {
  program: AdminCatalogueProgram;
}

export interface AdminCataloguePublicationIssue {
  code: string;
  message: string;
  volumeId?: number;
}

export interface AdminCataloguePublicationResponse {
  checklist: {
    ready: boolean;
    issues: AdminCataloguePublicationIssue[];
  };
}

export interface AdminCatalogueUploadReservation {
  uploadId: number;
  uploadUrl: string;
  expiresInSeconds: number;
  headers: {
    'Content-Type': string;
  };
}
