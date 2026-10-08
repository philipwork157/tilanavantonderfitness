/** Shapes returned by the admin API (dates arrive as ISO strings). */

export interface BlogPostSummary {
  id: number;
  title: string;
  slug: string;
  category: string;
  status: 'draft' | 'published';
  coverImageUrl: string | null;
  publishedAt: string | null;
  updatedAt: string;
}

export interface AdminBlogPost {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  bodyMarkdown: string;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  coverImageWidth: number | null;
  coverImageHeight: number | null;
  closingLine: string | null;
  quoteText: string | null;
  quoteCitation: string | null;
  status: 'draft' | 'published';
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignSummary {
  id: number;
  subject: string;
  status: 'draft' | 'sending' | 'paused' | 'sent';
  recipientCount: number | null;
  sentCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
  postTitle: string | null;
}

export type SubscriberView = 'subscribed' | 'pending' | 'unsubscribed' | 'suppressed';

export interface Subscriber {
  id: number;
  email: string;
  status: string;
  source: string;
  consentedAt: string;
  confirmedAt: string | null;
  unsubscribedAt: string | null;
  suppressedAt: string | null;
  suppressionReason: string | null;
}

export type DeliveryCounts = Record<'queued' | 'sent' | 'skipped' | 'failed' | 'bounced' | 'complained', number>;

export interface CampaignDetail {
  campaign: {
    id: number;
    blogPostId: number | null;
    subject: string;
    previewText: string;
    introduction: string;
    status: 'draft' | 'sending' | 'paused' | 'sent';
    testSentAt: string | null;
    pauseReason: string | null;
    recipientCount: number | null;
    startedAt: string | null;
    finishedAt: string | null;
    updatedAt: string;
  };
  post: { id: number; title: string; slug: string; status: string } | null;
  counts: DeliveryCounts;
  subscriberCount: number;
  testRecipients: string[];
  devRedirectTo: string | null;
}

export interface Delivery {
  id: number;
  email: string;
  status: string;
  error: string | null;
  sentAt: string | null;
}

export interface EmailPreview {
  subject: string;
  previewText: string;
  html: string;
}

export interface TestPreview {
  recipients: string[];
  subject: string;
  from: string;
  html: string;
  devRedirectTo: string | null;
}

export interface AdminVolume {
  id: number;
  number: number;
  /** "Volume 1" */
  name: string;
  /** Its programs are on the website while this is on. */
  isActive: boolean;
  programCount: number;
  /** Programs with a PDF (the ones the website can show). */
  readyCount: number;
  updatedAt: string;
}

export interface AdminProgram {
  id: number;
  slug: string;
  name: string;
  title: string;
  summary: string;
  description: string;
  audience: string;
  tags: string[];
  tone: 'terracotta' | 'sage' | 'sand' | 'white' | 'caramel';
  illustration: 'barbell' | 'breath' | 'plate';
  series: 'strength' | 'focus';
  step: number | null;
  marker: string;
  sortOrder: number;
  priceCents: number;
  /** "Beginner · Volume 1": the name in the basket and emails. */
  label: string;
  volume: Pick<AdminVolume, 'id' | 'number' | 'name' | 'isActive'>;
  onWebsite: boolean;
  /** Why it is not on the website, when it is not. */
  offWebsiteReason: string | null;
  file: { name: string; sizeBytes: number; version: number; uploadedAt: string } | null;
  updatedAt: string;
}
