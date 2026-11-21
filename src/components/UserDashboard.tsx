import {
  ArrowUpRight,
  CreditCard,
  Download,
  FileText,
  History,
  LayoutDashboard,
  Search,
} from 'lucide-react';
import { PDFDocument, PageSizes, StandardFonts, rgb } from 'pdf-lib';
import { useMemo, useState } from 'react';
import { formatDateTime, formatShortDate, getTodayDateKey } from '../lib/firestoreService';
import { formatBytes, formatCurrencyCents, TOOLS_CATALOG } from '../lib/toolsCatalog';
import type { Invoice, PlatformSettings, ToolId, UsageLog, UserProfile } from '../types';

interface UserDashboardProps {
  userProfile: UserProfile | null;
  usageLogs: UsageLog[];
  invoices: Invoice[];
  todayUsageCount: number;
  platformSettings: PlatformSettings;
  onSignIn: () => void;
  onOpenTool: (toolId: ToolId) => void;
  onOpenUpgrade: () => void;
  onCancelSubscription: () => Promise<void>;
  onUpdatePaymentMethod: (last4: string, brand: string) => Promise<void>;
}

type DashboardTab = 'overview' | 'history' | 'billing';

export function UserDashboard({
  userProfile,
  usageLogs,
  invoices,
  todayUsageCount,
  platformSettings,
  onSignIn,
  onOpenTool,
  onOpenUpgrade,
  onCancelSubscription,
  onUpdatePaymentMethod,
}: UserDashboardProps) {
  const [tab, setTab] = useState<DashboardTab>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [toolFilter, setToolFilter] = useState<'all' | ToolId>('all');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [canceling, setCanceling] = useState(false);

  const [editingCard, setEditingCard] = useState(false);
  const [newLast4, setNewLast4] = useState('4242');
  const [newBrand, setNewBrand] = useState('Visa');
  const [savingCard, setSavingCard] = useState(false);

  const isPaid = userProfile?.plan === 'pro' || userProfile?.plan === 'business';
  const remaining = Math.max(0, platformSettings.freeDailyLimit - todayUsageCount);

  // Build 7-day chart series
  const last7Days = useMemo(() => {
    const days: { dateKey: string; label: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate()
      ).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { weekday: 'short' });
      const count = usageLogs.filter((l) => l.dateKey === key).length;
      days.push({ dateKey: key, label, count });
    }
    return days;
  }, [usageLogs]);

  const maxChartCount = Math.max(3, ...last7Days.map((d) => d.count));

  const filteredLogs = useMemo(() => {
    return usageLogs.filter((log) => {
      if (toolFilter !== 'all' && log.toolId !== toolFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          log.fileName.toLowerCase().includes(q) || log.toolName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [usageLogs, toolFilter, searchQuery]);

  const downloadInvoicePdf = async (inv: Invoice) => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage(PageSizes.A4);
    const { height } = page.getSize();
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

    page.drawText('PDF CONVERT RECEIPT', {
      x: 56,
      y: height - 72,
      size: 18,
      font: bold,
      color: rgb(0.06, 0.09, 0.16),
    });
    page.drawText(`Invoice Number: ${inv.invoiceNumber}`, {
      x: 56,
      y: height - 110,
      size: 11,
      font: regular,
    });
    page.drawText(`Billed To: ${inv.userEmail}`, {
      x: 56,
      y: height - 130,
      size: 11,
      font: regular,
    });
    page.drawText(`Plan: PDF Convert ${inv.plan.toUpperCase()} (${inv.billingCycle})`, {
      x: 56,
      y: height - 150,
      size: 11,
      font: regular,
    });
    page.drawText(`Billing Period: ${inv.periodLabel}`, {
      x: 56,
      y: height - 170,
      size: 11,
      font: regular,
    });
    page.drawText(`Payment Method: Card ending in ${inv.paymentLast4}`, {
      x: 56,
      y: height - 190,
      size: 11,
      font: regular,
    });
    page.drawText(`Status: ${inv.status.toUpperCase()}`, {
      x: 56,
      y: height - 210,
      size: 11,
      font: bold,
    });
    page.drawText(`Amount Paid: ${formatCurrencyCents(inv.amountCents)} USD`, {
      x: 56,
      y: height - 245,
      size: 14,
      font: bold,
      color: rgb(0.88, 0.11, 0.28),
    });

    const bytes = await pdf.save();
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const blob = new Blob([copy.buffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${inv.invoiceNumber}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!userProfile) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-5">
          <h1 className="font-display font-bold text-2xl text-slate-900">
            Sign in to view your workspace dashboard
          </h1>
          <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
            Your guest runs today ({todayUsageCount} of {platformSettings.freeDailyLimit}) are
            tracked locally. Sign in with Google to sync daily quotas, view conversion logs, and
            manage your subscription.
          </p>
          <button
            type="button"
            onClick={onSignIn}
            className="px-6 py-3 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="text-xs text-slate-500">
            Workspace <span aria-hidden="true">/</span> Account Dashboard
          </div>
          <h1 className="font-display font-bold text-2xl sm:text-3xl text-slate-900 mt-1">
            {userProfile.displayName}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {userProfile.email} <span aria-hidden="true">·</span>{' '}
            <span className="capitalize">{userProfile.plan} Plan</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          {!isPaid && (
            <button
              type="button"
              onClick={onOpenUpgrade}
              className="px-4 py-2 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              Upgrade to Pro
            </button>
          )}
          <button
            type="button"
            onClick={() => onOpenTool('merge-pdf')}
            className="px-4 py-2 text-sm font-medium text-slate-800 bg-white border border-slate-200 hover:border-slate-300 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            Launch Tools
          </button>
        </div>
      </div>

      {/* Segmented Dashboard Navigation */}
      <div className="inline-flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-lg">
        {(
          [
            { id: 'overview', label: 'Overview', icon: LayoutDashboard },
            { id: 'history', label: 'Usage History', icon: History },
            { id: 'billing', label: 'Billing & Plan', icon: CreditCard },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                active
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* OVERVIEW TAB */}
      {tab === 'overview' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Daily Free Quota ({getTodayDateKey()})</div>
              <div className="font-mono font-bold text-2xl text-slate-900 tabular-nums mt-2">
                {isPaid
                  ? 'Unlimited'
                  : `${todayUsageCount} / ${platformSettings.freeDailyLimit}`}
              </div>
              <div className="text-xs text-slate-500 mt-1 tabular-nums">
                {isPaid
                  ? 'Paid subscription active'
                  : `${remaining} run${remaining === 1 ? '' : 's'} remaining today`}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Subscription Tier</div>
              <div className="font-display font-bold text-2xl text-slate-900 capitalize mt-2">
                {userProfile.plan}
              </div>
              <div className="text-xs text-slate-500 mt-1 capitalize">
                {userProfile.subscriptionStatus} · {userProfile.billingCycle}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Total Files Processed</div>
              <div className="font-mono font-bold text-2xl text-slate-900 tabular-nums mt-2">
                {userProfile.totalOperations}
              </div>
              <div className="text-xs text-slate-500 mt-1 tabular-nums">
                {formatBytes(userProfile.totalBytesProcessed)} processed
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Storage Saved</div>
              <div className="font-mono font-bold text-2xl text-slate-900 tabular-nums mt-2">
                {formatBytes(userProfile.totalBytesSaved)}
              </div>
              <div className="text-xs text-slate-500 mt-1">Across compression &amp; exports</div>
            </div>
          </div>

          {/* 7-day Activity Bar Chart */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display font-semibold text-base text-slate-900">
                  7-Day Tool Activity
                </h2>
                <p className="text-xs text-slate-500">
                  Daily executions logged to your workspace
                </p>
              </div>
              <span className="text-xs font-mono text-slate-500 tabular-nums">
                {usageLogs.length} recent logs
              </span>
            </div>

            <div className="h-44 flex items-end gap-3 pt-4">
              {last7Days.map((day) => {
                const pct = Math.round((day.count / maxChartCount) * 100);
                return (
                  <div key={day.dateKey} className="flex-1 flex flex-col items-center gap-2">
                    <span className="text-xs font-mono text-slate-600 tabular-nums">
                      {day.count}
                    </span>
                    <div className="w-full h-28 bg-slate-100 rounded-md flex items-end overflow-hidden">
                      <div
                        style={{ height: `${Math.max(4, pct)}%` }}
                        className="w-full bg-rose-600 rounded-md transition-all"
                      />
                    </div>
                    <span className="text-xs text-slate-500">{day.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Recent Logs */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="font-display font-semibold text-base text-slate-900">
                Recent Operations
              </h2>
              <button
                type="button"
                onClick={() => setTab('history')}
                className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 hover:text-rose-700 cursor-pointer"
              >
                <span>View full history</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {usageLogs.length === 0 ? (
              <div className="p-10 text-center space-y-3">
                <FileText className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-sm text-slate-600">
                  No tool runs recorded yet. Process your first PDF or image to populate usage
                  analytics.
                </p>
                <button
                  type="button"
                  onClick={() => onOpenTool('merge-pdf')}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg cursor-pointer"
                >
                  Open Merge PDF
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                      <th className="py-3 px-6 font-medium">Tool</th>
                      <th className="py-3 px-6 font-medium">File(s)</th>
                      <th className="py-3 px-6 font-medium text-right">Input</th>
                      <th className="py-3 px-6 font-medium text-right">Output</th>
                      <th className="py-3 px-6 font-medium text-right">Duration</th>
                      <th className="py-3 px-6 font-medium text-right">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {usageLogs.slice(0, 6).map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50">
                        <td className="py-3 px-6 font-medium text-slate-900">{log.toolName}</td>
                        <td className="py-3 px-6 text-slate-600 max-w-[220px] truncate">
                          {log.fileName}
                        </td>
                        <td className="py-3 px-6 text-right font-mono tabular-nums text-slate-600">
                          {formatBytes(log.inputBytes)}
                        </td>
                        <td className="py-3 px-6 text-right font-mono tabular-nums text-slate-900">
                          {formatBytes(log.outputBytes)}
                        </td>
                        <td className="py-3 px-6 text-right font-mono tabular-nums text-slate-500">
                          {log.durationMs} ms
                        </td>
                        <td className="py-3 px-6 text-right text-slate-500 whitespace-nowrap">
                          {formatDateTime(log.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* HISTORY TAB */}
      {tab === 'history' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by file name or tool..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <select
              value={toolFilter}
              onChange={(e) => setToolFilter(e.target.value as 'all' | ToolId)}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="all">All Tools</option>
              {TOOLS_CATALOG.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {filteredLogs.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">
              No matching tool executions found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                    <th className="py-3 px-6 font-medium">Tool</th>
                    <th className="py-3 px-6 font-medium">File(s)</th>
                    <th className="py-3 px-6 font-medium text-right">Files</th>
                    <th className="py-3 px-6 font-medium text-right">Input Size</th>
                    <th className="py-3 px-6 font-medium text-right">Output Size</th>
                    <th className="py-3 px-6 font-medium text-right">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="py-3 px-6 font-medium text-slate-900">{log.toolName}</td>
                      <td className="py-3 px-6 text-slate-600 max-w-[260px] truncate">
                        {log.fileName}
                      </td>
                      <td className="py-3 px-6 text-right font-mono tabular-nums text-slate-600">
                        {log.fileCount}
                      </td>
                      <td className="py-3 px-6 text-right font-mono tabular-nums text-slate-600">
                        {formatBytes(log.inputBytes)}
                      </td>
                      <td className="py-3 px-6 text-right font-mono tabular-nums text-slate-900">
                        {formatBytes(log.outputBytes)}
                      </td>
                      <td className="py-3 px-6 text-right text-slate-500 whitespace-nowrap">
                        {formatDateTime(log.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* BILLING & SUBSCRIPTION TAB */}
      {tab === 'billing' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Plan Card */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs text-slate-500">Current Subscription</div>
                  <h2 className="font-display font-bold text-xl text-slate-900 capitalize mt-1">
                    {userProfile.plan} Plan
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Status: <span className="font-medium text-slate-800">{userProfile.subscriptionStatus}</span>{' '}
                    · Cycle: <span className="capitalize">{userProfile.billingCycle}</span>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={onOpenUpgrade}
                  className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg cursor-pointer whitespace-nowrap"
                >
                  {isPaid ? 'Change Plan' : 'Upgrade Plan'}
                </button>
              </div>

              {userProfile.currentPeriodEnd && isPaid && (
                <p className="text-xs text-slate-600">
                  Current billing period renews on{' '}
                  <strong className="text-slate-900">
                    {formatShortDate(userProfile.currentPeriodEnd)}
                  </strong>
                  .
                </p>
              )}

              {isPaid && !confirmCancel && (
                <div className="pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setConfirmCancel(true)}
                    className="text-xs font-medium text-slate-500 hover:text-rose-600 cursor-pointer"
                  >
                    Cancel subscription and revert to Free
                  </button>
                </div>
              )}

              {confirmCancel && (
                <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 space-y-3">
                  <p className="text-xs text-rose-900">
                    Confirm cancellation? Your account will revert to the Free tier (
                    {platformSettings.freeDailyLimit} runs/day).
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={canceling}
                      onClick={async () => {
                        setCanceling(true);
                        try {
                          await onCancelSubscription();
                          setConfirmCancel(false);
                        } finally {
                          setCanceling(false);
                        }
                      }}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-md cursor-pointer"
                    >
                      {canceling ? 'Canceling...' : 'Confirm Cancel'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmCancel(false)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md cursor-pointer"
                    >
                      Keep Plan
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Payment Method Card */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs text-slate-500">Payment Method</div>
                  <h2 className="font-display font-bold text-xl text-slate-900 mt-1">
                    {userProfile.paymentMethodLast4
                      ? `${userProfile.paymentMethodBrand || 'Card'} •••• ${userProfile.paymentMethodLast4}`
                      : 'No card on file'}
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Used for automatic subscription renewals and invoices.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setEditingCard((prev) => !prev)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  {editingCard ? 'Close' : 'Update Card'}
                </button>
              </div>

              {editingCard && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setSavingCard(true);
                    try {
                      await onUpdatePaymentMethod(
                        newLast4.replace(/\D/g, '').slice(-4).padStart(4, '0'),
                        newBrand
                      );
                      setEditingCard(false);
                    } finally {
                      setSavingCard(false);
                    }
                  }}
                  className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end"
                >
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Brand</label>
                    <select
                      value={newBrand}
                      onChange={(e) => setNewBrand(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="Visa">Visa</option>
                      <option value="Mastercard">Mastercard</option>
                      <option value="Amex">Amex</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Last 4 Digits</label>
                    <input
                      type="text"
                      maxLength={4}
                      required
                      value={newLast4}
                      onChange={(e) => setNewLast4(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={savingCard}
                    className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
                  >
                    {savingCard ? 'Saving...' : 'Save Card'}
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Invoices Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h3 className="font-display font-semibold text-base text-slate-900">
                Billing Invoices
              </h3>
            </div>
            {invoices.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">
                No invoices generated yet. Invoices appear automatically when you subscribe to Pro
                or Business.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                      <th className="py-3 px-6 font-medium">Invoice</th>
                      <th className="py-3 px-6 font-medium">Plan</th>
                      <th className="py-3 px-6 font-medium">Period</th>
                      <th className="py-3 px-6 font-medium">Status</th>
                      <th className="py-3 px-6 font-medium text-right">Amount</th>
                      <th className="py-3 px-6 font-medium text-right">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {invoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-slate-50">
                        <td className="py-3 px-6 font-mono font-semibold text-slate-900">
                          {inv.invoiceNumber}
                        </td>
                        <td className="py-3 px-6 capitalize text-slate-700">
                          {inv.plan} · {inv.billingCycle}
                        </td>
                        <td className="py-3 px-6 text-slate-600">{inv.periodLabel}</td>
                        <td className="py-3 px-6 capitalize font-medium text-emerald-700">
                          {inv.status}
                        </td>
                        <td className="py-3 px-6 text-right font-mono tabular-nums text-slate-900">
                          {formatCurrencyCents(inv.amountCents)}
                        </td>
                        <td className="py-3 px-6 text-right">
                          <button
                            type="button"
                            onClick={() => void downloadInvoicePdf(inv)}
                            className="inline-flex items-center gap-1 text-rose-600 hover:text-rose-700 font-medium cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>PDF</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
