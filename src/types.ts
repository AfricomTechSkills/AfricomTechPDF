import type { Timestamp } from 'firebase/firestore';

export type ToolId =
  | 'merge-pdf'
  | 'split-pdf'
  | 'compress-pdf'
  | 'pdf-to-image'
  | 'image-to-pdf'
  | 'pdf-to-word'
  | 'word-to-pdf'
  | 'pdf-to-excel'
  | 'image-convert';

export type ToolCategory = 'all' | 'pdf' | 'office' | 'image';

export interface ToolDefinition {
  id: ToolId;
  name: string;
  shortDesc: string;
  category: Exclude<ToolCategory, 'all'>;
  inputAccept: string;
  inputLabel: string;
  outputLabel: string;
  multiple: boolean;
  iconName: string;
}

export type PlanTier = 'free' | 'pro' | 'business';
export type BillingCycle = 'monthly' | 'annual';
export type SubscriptionStatus = 'active' | 'canceled' | 'past_due';
export type UserStatus = 'active' | 'suspended';
export type UserRole = 'user' | 'admin';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: UserRole;
  plan: PlanTier;
  billingCycle: BillingCycle;
  subscriptionStatus: SubscriptionStatus;
  status: UserStatus;
  dailyUsageDate: string;
  dailyUsageCount: number;
  totalOperations: number;
  totalBytesProcessed: number;
  totalBytesSaved: number;
  paymentMethodLast4?: string;
  paymentMethodBrand?: string;
  currentPeriodEnd?: string;
  createdAt?: Timestamp | Date | string;
  updatedAt?: Timestamp | Date | string;
}

export interface UsageLog {
  id: string;
  userId: string;
  userEmail: string;
  toolId: ToolId;
  toolName: string;
  fileName: string;
  fileCount: number;
  inputBytes: number;
  outputBytes: number;
  durationMs: number;
  dateKey: string;
  status: 'completed' | 'failed';
  createdAt?: Timestamp | Date | string;
}

export interface Invoice {
  id: string;
  userId: string;
  userEmail: string;
  invoiceNumber: string;
  plan: 'pro' | 'business';
  billingCycle: BillingCycle;
  amountCents: number;
  currency: 'USD';
  status: 'paid' | 'refunded' | 'void';
  paymentLast4: string;
  periodLabel: string;
  createdAt?: Timestamp | Date | string;
}

export interface PlatformSettings {
  freeDailyLimit: number;
  maxFreeFileMb: number;
  maxProFileMb: number;
  maintenanceMode: boolean;
  disabledTools: ToolId[];
  proMonthlyPriceCents: number;
  proAnnualPriceCents: number;
  businessMonthlyPriceCents: number;
  businessAnnualPriceCents: number;
  updatedAt?: Timestamp | Date | string;
  updatedBy?: string;
}

export type AppView = 'tools' | 'pricing' | 'dashboard' | 'admin';

export interface GeneratedOutputItem {
  name: string;
  blob: Blob;
  url: string;
  mimeType: string;
  size: number;
  previewUrl?: string;
  dimensions?: string;
}

export interface ToolProcessResult {
  toolId: ToolId;
  primaryFileName: string;
  inputBytes: number;
  outputBytes: number;
  durationMs: number;
  summaryText: string;
  items: GeneratedOutputItem[];
  zipItem?: GeneratedOutputItem;
  extractedTextPreview?: string;
  tablePreview?: string[][];
}
