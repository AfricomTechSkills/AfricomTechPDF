import { CreditCard, Loader2, Lock, X } from 'lucide-react';
import { useState } from 'react';
import { formatCurrencyCents } from '../lib/toolsCatalog';
import type { BillingCycle, PlatformSettings, UserProfile } from '../types';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: 'pro' | 'business';
  cycle: BillingCycle;
  platformSettings: PlatformSettings;
  userProfile: UserProfile | null;
  onSignIn: () => void;
  onConfirmSubscription: (params: {
    plan: 'pro' | 'business';
    cycle: BillingCycle;
    amountCents: number;
    cardLast4: string;
    cardBrand: string;
  }) => Promise<void>;
}

export function CheckoutModal({
  isOpen,
  onClose,
  plan,
  cycle,
  platformSettings,
  userProfile,
  onSignIn,
  onConfirmSubscription,
}: CheckoutModalProps) {
  const [selectedPlan, setSelectedPlan] = useState<'pro' | 'business'>(plan);
  const [selectedCycle, setSelectedCycle] = useState<BillingCycle>(cycle);
  const [cardHolder, setCardHolder] = useState(userProfile?.displayName || '');
  const [cardNumber, setCardNumber] = useState('4242 4242 4242 4242');
  const [expiry, setExpiry] = useState('12/29');
  const [cvc, setCvc] = useState('424');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const amountCents =
    selectedPlan === 'pro'
      ? selectedCycle === 'annual'
        ? platformSettings.proAnnualPriceCents
        : platformSettings.proMonthlyPriceCents
      : selectedCycle === 'annual'
        ? platformSettings.businessAnnualPriceCents
        : platformSettings.businessMonthlyPriceCents;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!userProfile) {
      onSignIn();
      return;
    }

    const digits = cardNumber.replace(/\D/g, '');
    if (digits.length < 12) {
      setError('Enter a valid card number.');
      return;
    }
    if (!/^\d{2}\/\d{2}$/.test(expiry.trim())) {
      setError('Enter expiration as MM/YY.');
      return;
    }
    if (cvc.trim().length < 3) {
      setError('Enter a valid 3 or 4 digit security code.');
      return;
    }

    setSubmitting(true);
    try {
      const brand = digits.startsWith('5') ? 'Mastercard' : 'Visa';
      await onConfirmSubscription({
        plan: selectedPlan,
        cycle: selectedCycle,
        amountCents,
        cardLast4: digits.slice(-4),
        cardBrand: brand,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to activate subscription.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkout-title"
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="checkout-title" className="font-display font-bold text-xl text-slate-900">
              Upgrade PDF Convert Subscription
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Unlock unlimited daily PDF and image conversions immediately.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close checkout dialog"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!userProfile ? (
          <div className="p-6 rounded-xl bg-slate-50 border border-slate-200 text-center space-y-4">
            <p className="text-sm text-slate-700">
              Sign in with your Google account so your subscription and invoices stay synced across
              sessions.
            </p>
            <button
              type="button"
              onClick={onSignIn}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
            >
              Sign in with Google
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSelectedPlan('pro')}
                className={`p-3 text-left rounded-lg border cursor-pointer ${
                  selectedPlan === 'pro'
                    ? 'border-rose-600 bg-rose-50/50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="text-xs font-semibold text-slate-900">Pro Studio</div>
                <div className="text-xs font-mono text-slate-500 tabular-nums mt-0.5">
                  {formatCurrencyCents(
                    selectedCycle === 'annual'
                      ? platformSettings.proAnnualPriceCents
                      : platformSettings.proMonthlyPriceCents
                  )}{' '}
                  / {selectedCycle === 'annual' ? 'yr' : 'mo'}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedPlan('business')}
                className={`p-3 text-left rounded-lg border cursor-pointer ${
                  selectedPlan === 'business'
                    ? 'border-rose-600 bg-rose-50/50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="text-xs font-semibold text-slate-900">Business Team</div>
                <div className="text-xs font-mono text-slate-500 tabular-nums mt-0.5">
                  {formatCurrencyCents(
                    selectedCycle === 'annual'
                      ? platformSettings.businessAnnualPriceCents
                      : platformSettings.businessMonthlyPriceCents
                  )}{' '}
                  / {selectedCycle === 'annual' ? 'yr' : 'mo'}
                </div>
              </button>
            </div>

            <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setSelectedCycle('monthly')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                  selectedCycle === 'monthly'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600'
                }`}
              >
                Billed Monthly
              </button>
              <button
                type="button"
                onClick={() => setSelectedCycle('annual')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                  selectedCycle === 'annual'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600'
                }`}
              >
                Billed Annually (Save 25%)
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Cardholder Name
                </label>
                <input
                  type="text"
                  required
                  value={cardHolder}
                  onChange={(e) => setCardHolder(e.target.value)}
                  placeholder="Full name on card"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Card Number (Test Mode)
                </label>
                <div className="relative">
                  <CreditCard className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Expiry</label>
                  <input
                    type="text"
                    required
                    value={expiry}
                    onChange={(e) => setExpiry(e.target.value)}
                    placeholder="MM/YY"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">CVC</label>
                  <input
                    type="text"
                    required
                    value={cvc}
                    onChange={(e) => setCvc(e.target.value)}
                    placeholder="424"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-sm">
              <span className="text-slate-600">Total due today</span>
              <span className="font-mono font-bold text-lg text-slate-900 tabular-nums">
                {formatCurrencyCents(amountCents)} USD
              </span>
            </div>

            {error && <p className="text-xs text-rose-600">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 px-4 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Activating Plan...</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Activate {selectedPlan === 'pro' ? 'Pro Studio' : 'Business Team'}</span>
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
