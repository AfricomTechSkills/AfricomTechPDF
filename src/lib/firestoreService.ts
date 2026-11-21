import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from './firebase';
import type {
  BillingCycle,
  Invoice,
  PlanTier,
  PlatformSettings,
  ToolId,
  UsageLog,
  UserProfile,
  UserRole,
  UserStatus,
} from '../types';

export const BOOTSTRAPPED_ADMIN_EMAIL = 'ndubuisichuks22@gmail.com';

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  freeDailyLimit: 3,
  maxFreeFileMb: 25,
  maxProFileMb: 250,
  maintenanceMode: false,
  disabledTools: [],
  proMonthlyPriceCents: 1200,
  proAnnualPriceCents: 10800,
  businessMonthlyPriceCents: 2900,
  businessAnnualPriceCents: 28800,
};

export function getTodayDateKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function timestampToMillis(val: Timestamp | Date | string | undefined): number {
  if (!val) return 0;
  if (val instanceof Timestamp) return val.toMillis();
  if (val instanceof Date) return val.getTime();
  const parsed = Date.parse(String(val));
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function formatShortDate(val: Timestamp | Date | string | undefined): string {
  const ms = timestampToMillis(val);
  if (!ms) return 'Just now';
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateTime(val: Timestamp | Date | string | undefined): string {
  const ms = timestampToMillis(val);
  if (!ms) return 'Just now';
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Guest daily usage tracking in localStorage (before signing in)
const GUEST_USAGE_PREFIX = 'folioforge_guest_usage_';
const GUEST_LOGS_KEY = 'folioforge_guest_logs';

export function getGuestDailyUsage(): number {
  try {
    const raw = localStorage.getItem(`${GUEST_USAGE_PREFIX}${getTodayDateKey()}`);
    const parsed = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

export function incrementGuestDailyUsage(): number {
  const next = getGuestDailyUsage() + 1;
  try {
    localStorage.setItem(`${GUEST_USAGE_PREFIX}${getTodayDateKey()}`, String(next));
  } catch {
    // Ignore storage quota errors
  }
  return next;
}

export function getGuestUsageLogs(): UsageLog[] {
  try {
    const raw = localStorage.getItem(GUEST_LOGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveGuestUsageLog(log: Omit<UsageLog, 'id'>): void {
  try {
    const existing = getGuestUsageLogs();
    const item: UsageLog = {
      ...log,
      id: `guest-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    localStorage.setItem(GUEST_LOGS_KEY, JSON.stringify([item, ...existing].slice(0, 25)));
  } catch {
    // Ignore
  }
}

export function subscribePlatformSettings(
  onUpdate: (settings: PlatformSettings) => void
): () => void {
  const ref = doc(db, 'settings', 'platform');
  return onSnapshot(
    ref,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data() as PlatformSettings;
        onUpdate({
          ...DEFAULT_PLATFORM_SETTINGS,
          ...data,
          disabledTools: Array.isArray(data.disabledTools) ? data.disabledTools : [],
        });
      } else {
        onUpdate(DEFAULT_PLATFORM_SETTINGS);
      }
    },
    (error) => {
      console.warn('Settings subscription warning:', error);
      onUpdate(DEFAULT_PLATFORM_SETTINGS);
    }
  );
}

export async function ensureUserProfile(user: User): Promise<UserProfile> {
  const path = `users/${user.uid}`;
  const ref = doc(db, 'users', user.uid);
  const today = getTodayDateKey();
  const isBootstrapAdmin =
    Boolean(user.emailVerified) && user.email === BOOTSTRAPPED_ADMIN_EMAIL;

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data() as UserProfile;
      // Ensure daily count rolls over cleanly in UI/sync
      return data;
    }

    const displayName = (user.displayName || user.email?.split('@')[0] || 'PDF Convert User').slice(
      0,
      128
    );
    const email = (user.email || '').slice(0, 256);

    const newProfile = {
      uid: user.uid,
      email,
      displayName,
      photoURL: (user.photoURL || '').slice(0, 512),
      role: (isBootstrapAdmin ? 'admin' : 'user') as UserRole,
      plan: (isBootstrapAdmin ? 'business' : 'free') as PlanTier,
      billingCycle: 'monthly' as BillingCycle,
      subscriptionStatus: 'active' as const,
      status: 'active' as UserStatus,
      dailyUsageDate: today,
      dailyUsageCount: 0,
      totalOperations: 0,
      totalBytesProcessed: 0,
      totalBytesSaved: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(ref, newProfile);

    // Ensure default platform settings exist if admin is signing in for the first time
    if (isBootstrapAdmin) {
      const settingsRef = doc(db, 'settings', 'platform');
      const settingsSnap = await getDoc(settingsRef);
      if (!settingsSnap.exists()) {
        await setDoc(settingsRef, {
          ...DEFAULT_PLATFORM_SETTINGS,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        });
      }
    }

    const createdSnap = await getDoc(ref);
    return createdSnap.data() as UserProfile;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeUserProfile(
  uid: string,
  onUpdate: (profile: UserProfile | null) => void
): () => void {
  const path = `users/${uid}`;
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      onUpdate(snap.exists() ? (snap.data() as UserProfile) : null);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export function subscribeUserUsageLogs(
  uid: string,
  onUpdate: (logs: UsageLog[]) => void
): () => void {
  const path = 'usageLogs';
  const q = query(collection(db, path), where('userId', '==', uid), limit(100));
  return onSnapshot(
    q,
    (snap) => {
      const items: UsageLog[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<UsageLog, 'id'>),
      }));
      items.sort((a, b) => timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt));
      onUpdate(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeUserInvoices(
  uid: string,
  onUpdate: (invoices: Invoice[]) => void
): () => void {
  const path = 'invoices';
  const q = query(collection(db, path), where('userId', '==', uid), limit(50));
  return onSnapshot(
    q,
    (snap) => {
      const items: Invoice[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Invoice, 'id'>),
      }));
      items.sort((a, b) => timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt));
      onUpdate(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function recordUserToolExecution(params: {
  profile: UserProfile;
  toolId: ToolId;
  toolName: string;
  fileName: string;
  fileCount: number;
  inputBytes: number;
  outputBytes: number;
  durationMs: number;
  status: 'completed' | 'failed';
}): Promise<void> {
  const { profile, toolId, toolName, fileName, fileCount, inputBytes, outputBytes, durationMs, status } =
    params;
  const today = getTodayDateKey();
  const currentDailyCount = profile.dailyUsageDate === today ? profile.dailyUsageCount : 0;
  const bytesSaved = Math.max(0, Math.round(inputBytes - outputBytes));

  const userPath = `users/${profile.uid}`;
  try {
    await updateDoc(doc(db, 'users', profile.uid), {
      dailyUsageDate: today,
      dailyUsageCount: currentDailyCount + 1,
      totalOperations: (profile.totalOperations || 0) + 1,
      totalBytesProcessed: (profile.totalBytesProcessed || 0) + Math.max(0, Math.round(inputBytes)),
      totalBytesSaved: (profile.totalBytesSaved || 0) + bytesSaved,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, userPath);
  }

  const logPath = 'usageLogs';
  try {
    await addDoc(collection(db, 'usageLogs'), {
      userId: profile.uid,
      userEmail: profile.email.slice(0, 256),
      toolId,
      toolName: toolName.slice(0, 64),
      fileName: fileName.slice(0, 256),
      fileCount: Math.min(100, Math.max(1, Math.round(fileCount))),
      inputBytes: Math.max(0, Math.round(inputBytes)),
      outputBytes: Math.max(0, Math.round(outputBytes)),
      durationMs: Math.min(600000, Math.max(0, Math.round(durationMs))),
      dateKey: today,
      status,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, logPath);
  }
}

export async function activateSubscriptionPlan(params: {
  profile: UserProfile;
  plan: 'pro' | 'business';
  billingCycle: BillingCycle;
  amountCents: number;
  cardLast4: string;
  cardBrand: string;
}): Promise<void> {
  const { profile, plan, billingCycle, amountCents, cardLast4, cardBrand } = params;
  const periodEnd = new Date();
  periodEnd.setDate(periodEnd.getDate() + (billingCycle === 'annual' ? 365 : 30));
  const periodEndIso = periodEnd.toISOString();

  const startLabel = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const endLabel = periodEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const periodLabel = `${startLabel} – ${endLabel}`.slice(0, 64);

  const userPath = `users/${profile.uid}`;
  try {
    await updateDoc(doc(db, 'users', profile.uid), {
      plan,
      billingCycle,
      subscriptionStatus: 'active',
      paymentMethodLast4: cardLast4.slice(-4),
      paymentMethodBrand: cardBrand.slice(0, 32),
      currentPeriodEnd: periodEndIso.slice(0, 40),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, userPath);
  }

  const invPath = 'invoices';
  const invoiceNumber = `FF-${Math.floor(100000 + Math.random() * 900000)}`;
  try {
    await addDoc(collection(db, 'invoices'), {
      userId: profile.uid,
      userEmail: profile.email.slice(0, 256),
      invoiceNumber,
      plan,
      billingCycle,
      amountCents: Math.max(0, Math.round(amountCents)),
      currency: 'USD',
      status: 'paid',
      paymentLast4: cardLast4.slice(-4),
      periodLabel,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, invPath);
  }
}

export async function cancelUserSubscription(uid: string): Promise<void> {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      plan: 'free',
      subscriptionStatus: 'canceled',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateUserPaymentMethod(
  uid: string,
  last4: string,
  brand: string
): Promise<void> {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      paymentMethodLast4: last4.slice(-4),
      paymentMethodBrand: brand.slice(0, 32),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// --- Admin Data Operations ---

export async function adminFetchAllUsers(): Promise<UserProfile[]> {
  const path = 'users';
  try {
    const snap = await getDocs(query(collection(db, path), limit(250)));
    const items = snap.docs.map((d) => d.data() as UserProfile);
    items.sort((a, b) => timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt));
    return items;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function adminFetchAllUsageLogs(): Promise<UsageLog[]> {
  const path = 'usageLogs';
  try {
    const snap = await getDocs(query(collection(db, path), limit(500)));
    const items = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<UsageLog, 'id'>),
    }));
    items.sort((a, b) => timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt));
    return items;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function adminFetchAllInvoices(): Promise<Invoice[]> {
  const path = 'invoices';
  try {
    const snap = await getDocs(query(collection(db, path), limit(250)));
    const items = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<Invoice, 'id'>),
    }));
    items.sort((a, b) => timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt));
    return items;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function adminUpdateUserAccount(
  targetUser: UserProfile,
  updates: Partial<
    Pick<
      UserProfile,
      'role' | 'plan' | 'billingCycle' | 'subscriptionStatus' | 'status' | 'dailyUsageCount' | 'dailyUsageDate'
    >
  >,
  actingAdminUid: string
): Promise<void> {
  const path = `users/${targetUser.uid}`;
  try {
    await updateDoc(doc(db, 'users', targetUser.uid), {
      ...updates,
      updatedAt: serverTimestamp(),
    });

    if (updates.role && updates.role !== targetUser.role) {
      const adminGrantRef = doc(db, 'admins', targetUser.uid);
      if (updates.role === 'admin') {
        await setDoc(adminGrantRef, {
          uid: targetUser.uid,
          email: targetUser.email,
          grantedBy: actingAdminUid,
          createdAt: serverTimestamp(),
        });
      } else if (targetUser.uid !== actingAdminUid) {
        await deleteDoc(adminGrantRef);
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function adminUpdateInvoiceStatus(
  invoiceId: string,
  status: 'refunded' | 'void'
): Promise<void> {
  const path = `invoices/${invoiceId}`;
  try {
    await updateDoc(doc(db, 'invoices', invoiceId), { status });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function adminSavePlatformSettings(
  settings: PlatformSettings,
  adminUid: string
): Promise<void> {
  const path = 'settings/platform';
  try {
    await setDoc(doc(db, 'settings', 'platform'), {
      freeDailyLimit: Math.min(100, Math.max(1, Math.round(settings.freeDailyLimit))),
      maxFreeFileMb: Math.min(500, Math.max(1, Math.round(settings.maxFreeFileMb))),
      maxProFileMb: Math.min(2000, Math.max(1, Math.round(settings.maxProFileMb))),
      maintenanceMode: Boolean(settings.maintenanceMode),
      disabledTools: settings.disabledTools.slice(0, 9),
      proMonthlyPriceCents: Math.max(100, Math.round(settings.proMonthlyPriceCents)),
      proAnnualPriceCents: Math.max(100, Math.round(settings.proAnnualPriceCents)),
      businessMonthlyPriceCents: Math.max(100, Math.round(settings.businessMonthlyPriceCents)),
      businessAnnualPriceCents: Math.max(100, Math.round(settings.businessAnnualPriceCents)),
      updatedAt: serverTimestamp(),
      updatedBy: adminUid.slice(0, 128),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}
