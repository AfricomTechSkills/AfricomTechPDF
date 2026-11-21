import {
  ArrowLeft,
  BarChart3,
  CreditCard,
  Loader2,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  adminFetchAllInvoices,
  adminFetchAllUsageLogs,
  adminFetchAllUsers,
  adminSavePlatformSettings,
  adminUpdateInvoiceStatus,
  adminUpdateUserAccount,
  formatDateTime,
  getTodayDateKey,
} from '../lib/firestoreService';
import { formatCurrencyCents, TOOLS_CATALOG } from '../lib/toolsCatalog';
import type {
  Invoice,
  PlanTier,
  PlatformSettings,
  ToolId,
  UsageLog,
  UserProfile,
} from '../types';

interface AdminPanelProps {
  currentUser: UserProfile;
  platformSettings: PlatformSettings;
  onExitAdmin?: () => void;
}

type AdminTab = 'analytics' | 'users' | 'settings' | 'ledger';

export function AdminPanel({ currentUser, platformSettings, onExitAdmin }: AdminPanelProps) {
  const [tab, setTab] = useState<AdminTab>('analytics');
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  // Filters
  const [userSearch, setUserSearch] = useState('');
  const [planFilter, setPlanFilter] = useState<'all' | PlanTier>('all');
  const [ledgerFilter, setLedgerFilter] = useState<'all' | 'paid' | 'refunded' | 'void'>('all');

  // Editable settings draft
  const [settingsDraft, setSettingsDraft] = useState<PlatformSettings>(platformSettings);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    setSettingsDraft(platformSettings);
  }, [platformSettings]);

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [u, l, inv] = await Promise.all([
        adminFetchAllUsers(),
        adminFetchAllUsageLogs(),
        adminFetchAllInvoices(),
      ]);
      setUsers(u);
      setLogs(l);
      setInvoices(inv);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Unable to load platform records. Verify administrator permissions.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAdminData();
  }, [loadAdminData]);

  const metrics = useMemo(() => {
    const today = getTodayDateKey();
    const proCount = users.filter((u) => u.plan === 'pro').length;
    const bizCount = users.filter((u) => u.plan === 'business').length;
    const estimatedMrrCents =
      proCount * platformSettings.proMonthlyPriceCents +
      bizCount * platformSettings.businessMonthlyPriceCents;
    const todayRuns = logs.filter((l) => l.dateKey === today).length;
    const totalRevenueCents = invoices
      .filter((i) => i.status === 'paid')
      .reduce((acc, i) => acc + i.amountCents, 0);

    return {
      totalUsers: users.length,
      paidUsers: proCount + bizCount,
      estimatedMrrCents,
      todayRuns,
      totalRuns: logs.length,
      totalRevenueCents,
    };
  }, [users, logs, invoices, platformSettings]);

  const toolBreakdown = useMemo(() => {
    return TOOLS_CATALOG.map((tool) => {
      const count = logs.filter((l) => l.toolId === tool.id).length;
      return { id: tool.id, name: tool.name, count };
    }).sort((a, b) => b.count - a.count);
  }, [logs]);

  const maxToolCount = Math.max(1, ...toolBreakdown.map((t) => t.count));

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (planFilter !== 'all' && u.plan !== planFilter) return false;
      if (userSearch.trim()) {
        const q = userSearch.toLowerCase();
        return (
          u.email.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [users, planFilter, userSearch]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      if (ledgerFilter !== 'all' && inv.status !== ledgerFilter) return false;
      return true;
    });
  }, [invoices, ledgerFilter]);

  const handleUserChange = async (
    target: UserProfile,
    updates: Partial<
      Pick<UserProfile, 'plan' | 'status' | 'role' | 'dailyUsageCount' | 'dailyUsageDate'>
    >
  ) => {
    await adminUpdateUserAccount(target, updates, currentUser.uid);
    setUsers((prev) =>
      prev.map((u) => (u.uid === target.uid ? { ...u, ...updates } : u))
    );
    setSaveNotice(`Updated ${target.email}`);
    setTimeout(() => setSaveNotice(null), 2500);
  };

  const handleToggleToolDisabled = (toolId: ToolId) => {
    setSettingsDraft((prev) => {
      const exists = prev.disabledTools.includes(toolId);
      return {
        ...prev,
        disabledTools: exists
          ? prev.disabledTools.filter((id) => id !== toolId)
          : [...prev.disabledTools, toolId],
      };
    });
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await adminSavePlatformSettings(settingsDraft, currentUser.uid);
      setSaveNotice('Platform configuration saved.');
      setTimeout(() => setSaveNotice(null), 3000);
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Admin Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 text-rose-600" />
            <span>Administrator Console</span>
          </div>
          <h1 className="font-display font-bold text-2xl sm:text-3xl text-slate-900 mt-1">
            Platform Operations &amp; Governance
          </h1>
        </div>

        <div className="flex items-center gap-3">
          {saveNotice && (
            <span className="text-xs font-medium text-emerald-700">{saveNotice}</span>
          )}
          <button
            type="button"
            onClick={() => void loadAdminData()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:border-slate-300 rounded-lg cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Data</span>
          </button>
          {onExitAdmin && (
            <button
              type="button"
              onClick={onExitAdmin}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Exit Admin</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-lg w-fit">
        {(
          [
            { id: 'analytics', label: 'Overview & Analytics', icon: BarChart3 },
            { id: 'users', label: 'User Management', icon: Users },
            { id: 'settings', label: 'Quotas & Tools', icon: Settings2 },
            { id: 'ledger', label: 'Billing Ledger', icon: CreditCard },
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

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="py-16 flex items-center justify-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Loading platform records...</span>
        </div>
      ) : (
        <>
          {/* TAB 1: ANALYTICS */}
          {tab === 'analytics' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <div className="text-xs text-slate-500">Registered Users</div>
                  <div className="font-mono font-bold text-2xl text-slate-900 tabular-nums mt-2">
                    {metrics.totalUsers}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 tabular-nums">
                    {metrics.paidUsers} active paid subscribers
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <div className="text-xs text-slate-500">Estimated MRR</div>
                  <div className="font-mono font-bold text-2xl text-slate-900 tabular-nums mt-2">
                    {formatCurrencyCents(metrics.estimatedMrrCents)}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 tabular-nums">
                    {formatCurrencyCents(metrics.totalRevenueCents)} collected invoices
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <div className="text-xs text-slate-500">Operations Today</div>
                  <div className="font-mono font-bold text-2xl text-slate-900 tabular-nums mt-2">
                    {metrics.todayRuns}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 tabular-nums">
                    {metrics.totalRuns} total logged runs
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <div className="text-xs text-slate-500">Free Daily Limit</div>
                  <div className="font-mono font-bold text-2xl text-slate-900 tabular-nums mt-2">
                    {platformSettings.freeDailyLimit} / day
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {platformSettings.maintenanceMode ? 'Maintenance ON' : 'All systems nominal'}
                  </div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                <h2 className="font-display font-semibold text-base text-slate-900">
                  Tool Execution Breakdown
                </h2>
                <div className="space-y-3">
                  {toolBreakdown.map((item) => {
                    const widthPct = Math.round((item.count / maxToolCount) * 100);
                    return (
                      <div key={item.id} className="grid grid-cols-12 items-center gap-4 text-xs">
                        <div className="col-span-4 sm:col-span-3 font-medium text-slate-800 truncate">
                          {item.name}
                        </div>
                        <div className="col-span-6 sm:col-span-7 h-3 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            style={{ width: `${Math.max(item.count > 0 ? 4 : 0, widthPct)}%` }}
                            className="h-full bg-rose-600 rounded-full"
                          />
                        </div>
                        <div className="col-span-2 text-right font-mono tabular-nums text-slate-600">
                          {item.count}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: USERS */}
          {tab === 'users' && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search user email or name..."
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>

                <select
                  value={planFilter}
                  onChange={(e) => setPlanFilter(e.target.value as 'all' | PlanTier)}
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="all">All Plans</option>
                  <option value="free">Free</option>
                  <option value="pro">Pro</option>
                  <option value="business">Business</option>
                </select>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                      <th className="py-3 px-6 font-medium">User</th>
                      <th className="py-3 px-6 font-medium">Role</th>
                      <th className="py-3 px-6 font-medium">Plan</th>
                      <th className="py-3 px-6 font-medium text-right">Today / Total</th>
                      <th className="py-3 px-6 font-medium">Status</th>
                      <th className="py-3 px-6 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {filteredUsers.map((u) => {
                      const isSelf = u.uid === currentUser.uid;
                      return (
                        <tr key={u.uid} className="hover:bg-slate-50">
                          <td className="py-3 px-6">
                            <div className="font-semibold text-slate-900">{u.displayName}</div>
                            <div className="text-slate-500">{u.email}</div>
                          </td>
                          <td className="py-3 px-6">
                            <select
                              disabled={isSelf}
                              value={u.role}
                              onChange={(e) =>
                                void handleUserChange(u, {
                                  role: e.target.value as 'user' | 'admin',
                                })
                              }
                              className="px-2 py-1 border border-slate-300 rounded bg-white disabled:opacity-50"
                            >
                              <option value="user">user</option>
                              <option value="admin">admin</option>
                            </select>
                          </td>
                          <td className="py-3 px-6">
                            <select
                              value={u.plan}
                              onChange={(e) =>
                                void handleUserChange(u, {
                                  plan: e.target.value as PlanTier,
                                })
                              }
                              className="px-2 py-1 border border-slate-300 rounded bg-white"
                            >
                              <option value="free">free</option>
                              <option value="pro">pro</option>
                              <option value="business">business</option>
                            </select>
                          </td>
                          <td className="py-3 px-6 text-right font-mono tabular-nums text-slate-700">
                            {u.dailyUsageDate === getTodayDateKey() ? u.dailyUsageCount : 0} /{' '}
                            {u.totalOperations}
                          </td>
                          <td className="py-3 px-6 capitalize">
                            <span
                              className={
                                u.status === 'suspended'
                                  ? 'text-rose-600 font-semibold'
                                  : 'text-emerald-700 font-medium'
                              }
                            >
                              {u.status}
                            </span>
                          </td>
                          <td className="py-3 px-6 text-right space-x-3 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() =>
                                void handleUserChange(u, {
                                  dailyUsageDate: getTodayDateKey(),
                                  dailyUsageCount: 0,
                                })
                              }
                              className="text-slate-600 hover:text-slate-900 font-medium cursor-pointer"
                            >
                              Reset Quota
                            </button>
                            {!isSelf && (
                              <button
                                type="button"
                                onClick={() =>
                                  void handleUserChange(u, {
                                    status: u.status === 'active' ? 'suspended' : 'active',
                                  })
                                }
                                className={`font-medium cursor-pointer ${
                                  u.status === 'active'
                                    ? 'text-rose-600 hover:text-rose-700'
                                    : 'text-emerald-700 hover:text-emerald-800'
                                }`}
                              >
                                {u.status === 'active' ? 'Suspend' : 'Reactivate'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: SETTINGS & TOOLS */}
          {tab === 'settings' && (
            <form
              onSubmit={handleSaveSettings}
              className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
            >
              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-6">
                <h2 className="font-display font-semibold text-base text-slate-900">
                  Quotas, File Ceilings &amp; Pricing
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Free Daily Runs
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={settingsDraft.freeDailyLimit}
                      onChange={(e) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          freeDailyLimit: Number(e.target.value) || 3,
                        })
                      }
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Max Free File (MB)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={settingsDraft.maxFreeFileMb}
                      onChange={(e) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          maxFreeFileMb: Number(e.target.value) || 25,
                        })
                      }
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Max Pro File (MB)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={2000}
                      value={settingsDraft.maxProFileMb}
                      onChange={(e) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          maxProFileMb: Number(e.target.value) || 250,
                        })
                      }
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Pro Monthly (cents USD)
                    </label>
                    <input
                      type="number"
                      min={100}
                      value={settingsDraft.proMonthlyPriceCents}
                      onChange={(e) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          proMonthlyPriceCents: Number(e.target.value) || 1200,
                        })
                      }
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Pro Annual (cents USD)
                    </label>
                    <input
                      type="number"
                      min={100}
                      value={settingsDraft.proAnnualPriceCents}
                      onChange={(e) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          proAnnualPriceCents: Number(e.target.value) || 10800,
                        })
                      }
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Business Monthly (cents USD)
                    </label>
                    <input
                      type="number"
                      min={100}
                      value={settingsDraft.businessMonthlyPriceCents}
                      onChange={(e) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          businessMonthlyPriceCents: Number(e.target.value) || 2900,
                        })
                      }
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Business Annual (cents USD)
                    </label>
                    <input
                      type="number"
                      min={100}
                      value={settingsDraft.businessAnnualPriceCents}
                      onChange={(e) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          businessAnnualPriceCents: Number(e.target.value) || 28800,
                        })
                      }
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-3 pt-2 border-t border-slate-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settingsDraft.maintenanceMode}
                    onChange={(e) =>
                      setSettingsDraft({ ...settingsDraft, maintenanceMode: e.target.checked })
                    }
                    className="w-4 h-4 accent-rose-600"
                  />
                  <span className="text-sm text-slate-800">
                    Enable global maintenance mode (pauses all tool runs)
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={savingSettings}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
                >
                  {savingSettings ? 'Saving Settings...' : 'Save Platform Configuration'}
                </button>
              </div>

              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <h2 className="font-display font-semibold text-base text-slate-900">
                  Tool Availability Controls
                </h2>
                <p className="text-xs text-slate-500">
                  Toggle individual tools on or off across the public workspace.
                </p>

                <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                  {TOOLS_CATALOG.map((tool) => {
                    const paused = settingsDraft.disabledTools.includes(tool.id);
                    return (
                      <div
                        key={tool.id}
                        className="px-4 py-3 flex items-center justify-between text-xs"
                      >
                        <span className="font-medium text-slate-900">{tool.name}</span>
                        <button
                          type="button"
                          onClick={() => handleToggleToolDisabled(tool.id)}
                          className={`px-3 py-1 rounded-md font-medium cursor-pointer ${
                            paused
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          {paused ? 'Paused' : 'Active'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </form>
          )}

          {/* TAB 4: BILLING LEDGER */}
          {tab === 'ledger' && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="p-5 border-b border-slate-200 flex items-center justify-between gap-3">
                <h2 className="font-display font-semibold text-base text-slate-900">
                  Platform Billing Ledger
                </h2>
                <select
                  value={ledgerFilter}
                  onChange={(e) =>
                    setLedgerFilter(e.target.value as 'all' | 'paid' | 'refunded' | 'void')
                  }
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="all">All Statuses</option>
                  <option value="paid">Paid</option>
                  <option value="refunded">Refunded</option>
                  <option value="void">Void</option>
                </select>
              </div>

              {filteredInvoices.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-500">
                  No invoices recorded in this filter.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                        <th className="py-3 px-6 font-medium">Invoice</th>
                        <th className="py-3 px-6 font-medium">Customer</th>
                        <th className="py-3 px-6 font-medium">Plan</th>
                        <th className="py-3 px-6 font-medium">Status</th>
                        <th className="py-3 px-6 font-medium text-right">Amount</th>
                        <th className="py-3 px-6 font-medium text-right">Date</th>
                        <th className="py-3 px-6 font-medium text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-xs">
                      {filteredInvoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-slate-50">
                          <td className="py-3 px-6 font-mono font-semibold text-slate-900">
                            {inv.invoiceNumber}
                          </td>
                          <td className="py-3 px-6 text-slate-700">{inv.userEmail}</td>
                          <td className="py-3 px-6 capitalize text-slate-700">
                            {inv.plan} · {inv.billingCycle}
                          </td>
                          <td className="py-3 px-6 capitalize font-medium text-slate-900">
                            {inv.status}
                          </td>
                          <td className="py-3 px-6 text-right font-mono tabular-nums text-slate-900">
                            {formatCurrencyCents(inv.amountCents)}
                          </td>
                          <td className="py-3 px-6 text-right text-slate-500">
                            {formatDateTime(inv.createdAt)}
                          </td>
                          <td className="py-3 px-6 text-right">
                            {inv.status === 'paid' ? (
                              <button
                                type="button"
                                onClick={async () => {
                                  await adminUpdateInvoiceStatus(inv.id, 'refunded');
                                  setInvoices((prev) =>
                                    prev.map((i) =>
                                      i.id === inv.id ? { ...i, status: 'refunded' } : i
                                    )
                                  );
                                }}
                                className="text-rose-600 hover:text-rose-700 font-medium cursor-pointer"
                              >
                                Refund
                              </button>
                            ) : (
                              <span className="text-slate-400">Locked</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
