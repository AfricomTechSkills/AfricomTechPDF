import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { AdminAccessGate } from './components/AdminAccessGate';
import { AdminPanel } from './components/AdminPanel';
import { CheckoutModal } from './components/CheckoutModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { HeroAndTools } from './components/HeroAndTools';
import { Navbar } from './components/Navbar';
import { PricingSection } from './components/PricingSection';
import { ToolWorkspace } from './components/ToolWorkspace';
import { UserDashboard } from './components/UserDashboard';
import { auth, googleProvider } from './lib/firebase';
import {
  activateSubscriptionPlan,
  cancelUserSubscription,
  DEFAULT_PLATFORM_SETTINGS,
  ensureUserProfile,
  getGuestDailyUsage,
  getGuestUsageLogs,
  getTodayDateKey,
  incrementGuestDailyUsage,
  recordUserToolExecution,
  saveGuestUsageLog,
  subscribePlatformSettings,
  subscribeUserInvoices,
  subscribeUserProfile,
  subscribeUserUsageLogs,
  updateUserPaymentMethod,
} from './lib/firestoreService';
import { getToolById, TOOLS_CATALOG } from './lib/toolsCatalog';
import type {
  AppView,
  BillingCycle,
  Invoice,
  PlatformSettings,
  ToolId,
  ToolProcessResult,
  UsageLog,
  UserProfile,
} from './types';

function isAdminUrlRequested(): boolean {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname.replace(/\/+$/, '');
  return path === '/admin' || window.location.hash === '#admin';
}

function PdfConvertApp() {
  const [activeView, setActiveView] = useState<AppView>(() =>
    isAdminUrlRequested() ? 'admin' : 'tools'
  );
  const [selectedTool, setSelectedTool] = useState<ToolId | null>(null);

  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [usageLogs, setUsageLogs] = useState<UsageLog[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [guestUsageToday, setGuestUsageToday] = useState<number>(() => getGuestDailyUsage());
  const [platformSettings, setPlatformSettings] = useState<PlatformSettings>(
    DEFAULT_PLATFORM_SETTINGS
  );

  // Checkout Modal State
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutPlan, setCheckoutPlan] = useState<'pro' | 'business'>('pro');
  const [checkoutCycle, setCheckoutCycle] = useState<BillingCycle>('annual');

  useEffect(() => {
    const syncFromUrl = () => {
      if (isAdminUrlRequested()) {
        setActiveView('admin');
        setSelectedTool(null);
      } else {
        setActiveView((prev) => (prev === 'admin' ? 'tools' : prev));
      }
    };
    window.addEventListener('popstate', syncFromUrl);
    window.addEventListener('hashchange', syncFromUrl);
    return () => {
      window.removeEventListener('popstate', syncFromUrl);
      window.removeEventListener('hashchange', syncFromUrl);
    };
  }, []);

  useEffect(() => {
    const unsubSettings = subscribePlatformSettings((settings) => {
      setPlatformSettings(settings);
    });
    return () => unsubSettings();
  }, []);

  useEffect(() => {
    let unsubProfile: (() => void) | undefined;
    let unsubLogs: (() => void) | undefined;
    let unsubInvoices: (() => void) | undefined;

    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (unsubProfile) unsubProfile();
      if (unsubLogs) unsubLogs();
      if (unsubInvoices) unsubInvoices();

      if (!firebaseUser) {
        setUserProfile(null);
        setUsageLogs(getGuestUsageLogs());
        setInvoices([]);
        setAuthLoading(false);
        return;
      }

      try {
        const profile = await ensureUserProfile(firebaseUser);
        setUserProfile(profile);

        unsubProfile = subscribeUserProfile(firebaseUser.uid, (updated) => {
          if (updated) setUserProfile(updated);
        });
        unsubLogs = subscribeUserUsageLogs(firebaseUser.uid, (logs) => {
          setUsageLogs(logs);
        });
        unsubInvoices = subscribeUserInvoices(firebaseUser.uid, (inv) => {
          setInvoices(inv);
        });
      } catch (err) {
        console.error('Auth profile sync error:', err);
        setAuthError(
          err instanceof Error ? err.message : 'Unable to load your account profile.'
        );
      } finally {
        setAuthLoading(false);
      }
    });

    return () => {
      unsubAuth();
      if (unsubProfile) unsubProfile();
      if (unsubLogs) unsubLogs();
      if (unsubInvoices) unsubInvoices();
    };
  }, []);

  const todayKey = getTodayDateKey();
  const todayUsageCount = userProfile
    ? userProfile.dailyUsageDate === todayKey
      ? userProfile.dailyUsageCount
      : 0
    : guestUsageToday;

  const handleSignIn = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-in popup was closed.';
      if (!msg.includes('popup-closed-by-user')) {
        setAuthError(msg);
      }
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    if (activeView === 'admin' && !isAdminUrlRequested()) {
      setActiveView('tools');
    }
  };

  const clearAdminUrlIfNeeded = () => {
    if (isAdminUrlRequested()) {
      window.history.pushState({}, '', '/');
    }
  };

  const handleNavigate = (view: AppView) => {
    if (view !== 'admin') {
      clearAdminUrlIfNeeded();
    }
    setActiveView(view);
    if (view !== 'tools') {
      setSelectedTool(null);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectTool = (toolId: ToolId) => {
    clearAdminUrlIfNeeded();
    setActiveView('tools');
    setSelectedTool(toolId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRecordSuccess = async (result: ToolProcessResult, fileCount: number) => {
    const tool = getToolById(result.toolId);
    if (userProfile) {
      await recordUserToolExecution({
        profile: userProfile,
        toolId: result.toolId,
        toolName: tool.name,
        fileName: result.primaryFileName,
        fileCount,
        inputBytes: result.inputBytes,
        outputBytes: result.outputBytes,
        durationMs: result.durationMs,
        status: 'completed',
      });
    } else {
      const next = incrementGuestDailyUsage();
      setGuestUsageToday(next);
      saveGuestUsageLog({
        userId: 'guest',
        userEmail: 'guest@local',
        toolId: result.toolId,
        toolName: tool.name,
        fileName: result.primaryFileName,
        fileCount,
        inputBytes: result.inputBytes,
        outputBytes: result.outputBytes,
        durationMs: result.durationMs,
        dateKey: getTodayDateKey(),
        status: 'completed',
      });
      setUsageLogs(getGuestUsageLogs());
    }
  };

  const handleOpenCheckout = (plan: 'pro' | 'business' = 'pro', cycle: BillingCycle = 'annual') => {
    setCheckoutPlan(plan);
    setCheckoutCycle(cycle);
    setCheckoutOpen(true);
  };

  const handleConfirmSubscription = async (params: {
    plan: 'pro' | 'business';
    cycle: BillingCycle;
    amountCents: number;
    cardLast4: string;
    cardBrand: string;
  }) => {
    if (!userProfile) return;
    await activateSubscriptionPlan({
      profile: userProfile,
      plan: params.plan,
      billingCycle: params.cycle,
      amountCents: params.amountCents,
      cardLast4: params.cardLast4,
      cardBrand: params.cardBrand,
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <Navbar
        activeView={activeView}
        onNavigate={handleNavigate}
        userProfile={userProfile}
        authLoading={authLoading}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
      />

      {authError && (
        <div className="bg-rose-50 border-b border-rose-200 px-4 py-2.5 text-center text-xs text-rose-800">
          {authError}
        </div>
      )}

      <main className="flex-1">
        {activeView === 'tools' && selectedTool && (
          <ToolWorkspace
            toolId={selectedTool}
            onSelectTool={handleSelectTool}
            onBack={() => setSelectedTool(null)}
            userProfile={userProfile}
            todayUsageCount={todayUsageCount}
            platformSettings={platformSettings}
            onRecordSuccess={handleRecordSuccess}
            onOpenUpgrade={() => handleOpenCheckout('pro', 'annual')}
            onSignIn={handleSignIn}
          />
        )}

        {activeView === 'tools' && !selectedTool && (
          <HeroAndTools
            onSelectTool={handleSelectTool}
            onGoPricing={() => handleNavigate('pricing')}
            userProfile={userProfile}
            todayUsageCount={todayUsageCount}
            platformSettings={platformSettings}
          />
        )}

        {activeView === 'pricing' && (
          <PricingSection
            platformSettings={platformSettings}
            userProfile={userProfile}
            onSelectPlan={(plan, cycle) => handleOpenCheckout(plan, cycle)}
            onSignIn={handleSignIn}
          />
        )}

        {activeView === 'dashboard' && (
          <UserDashboard
            userProfile={userProfile}
            usageLogs={usageLogs}
            invoices={invoices}
            todayUsageCount={todayUsageCount}
            platformSettings={platformSettings}
            onSignIn={handleSignIn}
            onOpenTool={handleSelectTool}
            onOpenUpgrade={() => handleOpenCheckout('pro', 'annual')}
            onCancelSubscription={async () => {
              if (userProfile) await cancelUserSubscription(userProfile.uid);
            }}
            onUpdatePaymentMethod={async (last4, brand) => {
              if (userProfile) await updateUserPaymentMethod(userProfile.uid, last4, brand);
            }}
          />
        )}

        {activeView === 'admin' && (
          <AdminAccessGate
            authLoading={authLoading}
            userProfile={userProfile}
            onAdminSignIn={handleSignIn}
            onSignOut={handleSignOut}
            onExit={() => handleNavigate('tools')}
          >
            {userProfile && (
              <AdminPanel
                currentUser={userProfile}
                platformSettings={platformSettings}
                onExitAdmin={() => handleNavigate('tools')}
              />
            )}
          </AdminAccessGate>
        )}
      </main>

      {/* Quiet Editorial Footer */}
      <footer className="border-t border-slate-200 bg-white mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="font-display font-bold text-base text-slate-900">PDF Convert</div>
            <p className="text-xs text-slate-500">
              Browser-native PDF &amp; image document tools. Powered by Africom Tech Skills.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-600">
            {TOOLS_CATALOG.slice(0, 4).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => handleSelectTool(t.id)}
                className="hover:text-slate-900 cursor-pointer"
              >
                {t.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => handleNavigate('pricing')}
              className="hover:text-slate-900 cursor-pointer"
            >
              Pricing
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('dashboard')}
              className="hover:text-slate-900 cursor-pointer"
            >
              Dashboard
            </button>
          </div>

          <div className="text-xs text-slate-500">
            © {new Date().getFullYear()} PDF Convert · Powered by Africom Tech Skills
          </div>
        </div>
      </footer>

      <CheckoutModal
        isOpen={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        plan={checkoutPlan}
        cycle={checkoutCycle}
        platformSettings={platformSettings}
        userProfile={userProfile}
        onSignIn={handleSignIn}
        onConfirmSubscription={handleConfirmSubscription}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <PdfConvertApp />
    </ErrorBoundary>
  );
}
