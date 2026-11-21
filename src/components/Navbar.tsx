import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import type { AppView, UserProfile } from '../types';

interface NavbarProps {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  userProfile: UserProfile | null;
  authLoading: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
}

export function Navbar({
  activeView,
  onNavigate,
  userProfile,
  authLoading,
  onSignIn,
  onSignOut,
}: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems: { id: AppView; label: string }[] = [
    { id: 'tools', label: 'Tools' },
    { id: 'pricing', label: 'Pricing' },
    { id: 'dashboard', label: 'Dashboard' },
  ];

  const handleNav = (view: AppView) => {
    onNavigate(view);
    setMobileOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single-line Brand wordmark */}
        <button
          type="button"
          onClick={() => handleNav('tools')}
          className="flex items-center gap-2.5 text-left whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 rounded-md py-1"
        >
          <span className="w-7 h-7 rounded-md bg-rose-600 text-white flex items-center justify-center font-display font-bold text-sm">
            P
          </span>
          <span className="font-display font-bold text-lg tracking-tight text-slate-900">
            PDF Convert
          </span>
        </button>

        {/* Zone 2: Clean single-line navigation links */}
        <nav
          aria-label="Primary Navigation"
          className="hidden md:flex items-center gap-7 text-sm font-medium"
        >
          {navItems.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNav(item.id)}
                className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 ${
                  isActive
                    ? 'border-rose-600 text-slate-900 font-semibold'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Primary Action */}
        <div className="flex items-center gap-3 shrink-0">
          {authLoading ? (
            <div className="h-9 w-28 rounded-lg bg-slate-100 animate-pulse" />
          ) : userProfile ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleNav('dashboard')}
                className="hidden sm:flex items-center gap-2 text-sm text-slate-700 hover:text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span className="font-medium max-w-[140px] truncate">{userProfile.displayName}</span>
                <span className="text-slate-300" aria-hidden="true">
                  /
                </span>
                <span className="text-xs font-mono uppercase text-slate-500">
                  {userProfile.plan}
                </span>
              </button>
              <button
                type="button"
                onClick={onSignOut}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Sign out
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onSignIn}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Sign in with Google
            </button>
          )}

          <button
            type="button"
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            onClick={() => setMobileOpen((prev) => !prev)}
            className="md:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 py-3 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNav(item.id)}
              className={`block w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer ${
                activeView === item.id
                  ? 'bg-slate-100 text-slate-900 font-semibold'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </header>
  );
}
