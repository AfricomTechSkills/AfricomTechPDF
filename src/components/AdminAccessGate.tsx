import { ArrowLeft, Loader2, Lock, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { UserProfile } from '../types';

interface AdminAccessGateProps {
  authLoading: boolean;
  userProfile: UserProfile | null;
  onAdminSignIn: () => void;
  onSignOut: () => void;
  onExit: () => void;
  children: React.ReactNode;
}

export function AdminAccessGate({
  authLoading,
  userProfile,
  onAdminSignIn,
  onSignOut,
  onExit,
  children,
}: AdminAccessGateProps) {
  if (authLoading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-24 flex items-center justify-center gap-2 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Verifying administrator session...</span>
      </div>
    );
  }

  if (!userProfile) {
    return (
      <div className="max-w-md mx-auto px-4 sm:px-6 py-20">
        <div className="bg-white border border-slate-200 rounded-xl p-8 space-y-6">
          <div className="w-11 h-11 rounded-lg bg-slate-900 text-white flex items-center justify-center">
            <Lock className="w-5 h-5" />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-rose-600">PDF Convert · Restricted Portal</div>
            <h1 className="font-display font-bold text-2xl text-slate-900">
              Administrator Login
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              This console is restricted exclusively to authorized administrator accounts. Sign in
              with your verified admin Google account to continue.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <button
              type="button"
              onClick={onAdminSignIn}
              className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Sign in as Administrator</span>
            </button>

            <button
              type="button"
              onClick={onExit}
              className="w-full py-2.5 px-4 text-sm font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Return to PDF Convert</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (userProfile.role !== 'admin') {
    return (
      <div className="max-w-md mx-auto px-4 sm:px-6 py-20">
        <div className="bg-white border border-slate-200 rounded-xl p-8 space-y-6">
          <div className="w-11 h-11 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
            <ShieldAlert className="w-5 h-5" />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-rose-600">Access Restricted</div>
            <h1 className="font-display font-bold text-2xl text-slate-900">
              Administrator Account Required
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Signed in as <strong className="text-slate-900">{userProfile.email}</strong>. This
              account does not have administrator permissions for the PDF Convert console.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <button
              type="button"
              onClick={onExit}
              className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              Return to PDF Convert
            </button>
            <button
              type="button"
              onClick={async () => {
                await onSignOut();
                onAdminSignIn();
              }}
              className="w-full py-2.5 px-4 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              Switch Google Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
