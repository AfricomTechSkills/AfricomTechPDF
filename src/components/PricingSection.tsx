import { Check } from 'lucide-react';
import { useState } from 'react';
import { formatCurrencyCents } from '../lib/toolsCatalog';
import type { BillingCycle, PlanTier, PlatformSettings, UserProfile } from '../types';

interface PricingSectionProps {
  platformSettings: PlatformSettings;
  userProfile: UserProfile | null;
  onSelectPlan: (plan: 'pro' | 'business', cycle: BillingCycle) => void;
  onSignIn: () => void;
}

export function PricingSection({
  platformSettings,
  userProfile,
  onSelectPlan,
  onSignIn,
}: PricingSectionProps) {
  const [cycle, setCycle] = useState<BillingCycle>('annual');
  const currentPlan: PlanTier = userProfile?.plan || 'free';

  const proPrice =
    cycle === 'annual'
      ? Math.round(platformSettings.proAnnualPriceCents / 12)
      : platformSettings.proMonthlyPriceCents;
  const businessPrice =
    cycle === 'annual'
      ? Math.round(platformSettings.businessAnnualPriceCents / 12)
      : platformSettings.businessMonthlyPriceCents;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 space-y-12">
      <div className="text-center max-w-2xl mx-auto space-y-4">
        <h1 className="font-display font-bold text-3xl sm:text-4xl tracking-tight text-slate-900 text-balance">
          Predictable pricing for individuals and teams
        </h1>
        <p className="text-sm sm:text-base text-slate-600">
          Start free with {platformSettings.freeDailyLimit} operations per day across all 8 PDF and
          image tools, or upgrade for unlimited daily runs and higher file limits.
        </p>

        <div className="inline-flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-lg">
          <button
            type="button"
            onClick={() => setCycle('monthly')}
            className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              cycle === 'monthly'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setCycle('annual')}
            className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              cycle === 'annual'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Annual (Save 25%)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {/* Free Tier */}
        <div className="bg-white border border-slate-200 rounded-xl p-8 flex flex-col justify-between space-y-8">
          <div className="space-y-4">
            <div>
              <div className="text-xs font-medium text-slate-500">For occasional tasks</div>
              <h2 className="font-display font-bold text-xl text-slate-900 mt-1">Starter Free</h2>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-display font-bold text-4xl text-slate-900 tabular-nums">
                $0
              </span>
              <span className="text-xs text-slate-500">/ month</span>
            </div>
            <p className="text-sm text-slate-600">
              Full access to every PDF and image tool with a daily allowance.
            </p>
            <ul className="space-y-3 pt-4 border-t border-slate-100 text-sm text-slate-700">
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-slate-500 shrink-0" />
                <span className="tabular-nums">
                  {platformSettings.freeDailyLimit} tool runs per day
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-slate-500 shrink-0" />
                <span className="tabular-nums">Up to {platformSettings.maxFreeFileMb} MB per file</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-slate-500 shrink-0" />
                <span>All 8 PDF, Word, and image tools</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-slate-500 shrink-0" />
                <span>Local browser-only file privacy</span>
              </li>
            </ul>
          </div>

          {userProfile ? (
            <div className="w-full py-2.5 px-4 text-center text-sm font-medium text-slate-600 bg-slate-100 rounded-lg">
              {currentPlan === 'free' ? 'Current Plan' : 'Included Base Tier'}
            </div>
          ) : (
            <button
              type="button"
              onClick={onSignIn}
              className="w-full py-2.5 px-4 text-sm font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              Sign in Free
            </button>
          )}
        </div>

        {/* Pro Tier */}
        <div className="bg-white border-2 border-rose-600 rounded-xl p-8 flex flex-col justify-between space-y-8">
          <div className="space-y-4">
            <div>
              <div className="text-xs font-semibold text-rose-600">
                For solo operators &amp; analysts
              </div>
              <h2 className="font-display font-bold text-xl text-slate-900 mt-1">Pro Studio</h2>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-display font-bold text-4xl text-slate-900 tabular-nums">
                {formatCurrencyCents(proPrice)}
              </span>
              <span className="text-xs text-slate-500">
                / month{cycle === 'annual' ? ' billed annually' : ''}
              </span>
            </div>
            <p className="text-sm text-slate-600">
              Remove daily ceilings and process large multi-file batches without waiting.
            </p>
            <ul className="space-y-3 pt-4 border-t border-slate-100 text-sm text-slate-700">
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-rose-600 shrink-0" />
                <span className="font-medium text-slate-900">Unlimited daily tool runs</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-rose-600 shrink-0" />
                <span className="tabular-nums">Up to {platformSettings.maxProFileMb} MB per file</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-rose-600 shrink-0" />
                <span>216 DPI PDF-to-image &amp; batch ZIP archives</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-rose-600 shrink-0" />
                <span>Full activity history &amp; invoice receipts</span>
              </li>
            </ul>
          </div>

          <button
            type="button"
            disabled={currentPlan === 'pro' && userProfile?.billingCycle === cycle}
            onClick={() => onSelectPlan('pro', cycle)}
            className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 disabled:text-slate-500 rounded-lg transition-colors cursor-pointer"
          >
            {currentPlan === 'pro' && userProfile?.billingCycle === cycle
              ? 'Active Pro Plan'
              : 'Upgrade to Pro'}
          </button>
        </div>

        {/* Business Tier */}
        <div className="bg-slate-900 text-white border border-slate-900 rounded-xl p-8 flex flex-col justify-between space-y-8">
          <div className="space-y-4">
            <div>
              <div className="text-xs font-medium text-rose-400">For scaling operations</div>
              <h2 className="font-display font-bold text-xl text-white mt-1">Business Team</h2>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-display font-bold text-4xl text-white tabular-nums">
                {formatCurrencyCents(businessPrice)}
              </span>
              <span className="text-xs text-slate-400">
                / month{cycle === 'annual' ? ' billed annually' : ''}
              </span>
            </div>
            <p className="text-sm text-slate-300">
              Built for legal, finance, and creative teams managing high-volume document packets.
            </p>
            <ul className="space-y-3 pt-4 border-t border-slate-800 text-sm text-slate-200">
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-rose-400 shrink-0" />
                <span>Unlimited daily runs for up to 10 team seats</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="tabular-nums">Up to {platformSettings.maxProFileMb} MB per file</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-rose-400 shrink-0" />
                <span>Consolidated team billing &amp; audit exports</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-rose-400 shrink-0" />
                <span>Priority support SLA</span>
              </li>
            </ul>
          </div>

          <button
            type="button"
            disabled={currentPlan === 'business' && userProfile?.billingCycle === cycle}
            onClick={() => onSelectPlan('business', cycle)}
            className="w-full py-2.5 px-4 text-sm font-semibold text-slate-900 bg-white hover:bg-slate-100 disabled:bg-slate-700 disabled:text-slate-400 rounded-lg transition-colors cursor-pointer"
          >
            {currentPlan === 'business' && userProfile?.billingCycle === cycle
              ? 'Active Business Plan'
              : 'Choose Business'}
          </button>
        </div>
      </div>

      {/* Concrete Comparison Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="font-display font-semibold text-base text-slate-900">
            Specification Matrix
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500 bg-slate-50">
                <th className="py-3 px-6 font-medium">Capability</th>
                <th className="py-3 px-6 font-medium">Starter Free</th>
                <th className="py-3 px-6 font-medium">Pro Studio</th>
                <th className="py-3 px-6 font-medium">Business Team</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-700">
              <tr>
                <td className="py-3.5 px-6 font-medium text-slate-900">Daily Operations</td>
                <td className="py-3.5 px-6 font-mono tabular-nums">
                  {platformSettings.freeDailyLimit} / day
                </td>
                <td className="py-3.5 px-6 font-semibold text-slate-900">Unlimited</td>
                <td className="py-3.5 px-6 font-semibold text-slate-900">Unlimited</td>
              </tr>
              <tr>
                <td className="py-3.5 px-6 font-medium text-slate-900">Max File Size</td>
                <td className="py-3.5 px-6 font-mono tabular-nums">
                  {platformSettings.maxFreeFileMb} MB
                </td>
                <td className="py-3.5 px-6 font-mono tabular-nums">
                  {platformSettings.maxProFileMb} MB
                </td>
                <td className="py-3.5 px-6 font-mono tabular-nums">
                  {platformSettings.maxProFileMb} MB
                </td>
              </tr>
              <tr>
                <td className="py-3.5 px-6 font-medium text-slate-900">PDF &amp; Image Suite</td>
                <td className="py-3.5 px-6">All 8 tools</td>
                <td className="py-3.5 px-6">All 8 tools</td>
                <td className="py-3.5 px-6">All 8 tools</td>
              </tr>
              <tr>
                <td className="py-3.5 px-6 font-medium text-slate-900">PDF to Image Max DPI</td>
                <td className="py-3.5 px-6 font-mono tabular-nums">216 DPI</td>
                <td className="py-3.5 px-6 font-mono tabular-nums">216 DPI</td>
                <td className="py-3.5 px-6 font-mono tabular-nums">216 DPI</td>
              </tr>
              <tr>
                <td className="py-3.5 px-6 font-medium text-slate-900">Billing Receipts</td>
                <td className="py-3.5 px-6 text-slate-400">N/A</td>
                <td className="py-3.5 px-6">Instant Invoices</td>
                <td className="py-3.5 px-6">Consolidated Invoices</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
