import React, { useState } from 'react';
import { ArrowLeft, BookOpen, Check, Feather } from 'lucide-react';
import { User } from 'firebase/auth';
import { UserProfile, UserRole } from '../types';

interface SignInPageProps {
  currentUser: User | null;
  userProfile: UserProfile | null;
  preferredRole: UserRole;
  isAuthBusy: boolean;
  authError: string | null;
  onSignInWithRole: (role: UserRole) => Promise<void>;
  onSwitchRole: (role: UserRole) => Promise<void>;
  onSignOut: () => Promise<void>;
  onGoToCatalog: () => void;
  onGoToStudio: () => void;
}

export const SignInPage: React.FC<SignInPageProps> = ({
  currentUser,
  userProfile,
  preferredRole,
  isAuthBusy,
  authError,
  onSignInWithRole,
  onSwitchRole,
  onSignOut,
  onGoToCatalog,
  onGoToStudio,
}) => {
  const [selectedRole, setSelectedRole] = useState<UserRole>(preferredRole);
  const [roleBusy, setRoleBusy] = useState(false);

  const activeRole: UserRole = userProfile?.role || selectedRole;

  const handleRoleSignIn = async (role: UserRole) => {
    setSelectedRole(role);
    await onSignInWithRole(role);
  };

  const handleRoleSwitch = async (role: UserRole) => {
    setRoleBusy(true);
    try {
      await onSwitchRole(role);
    } finally {
      setRoleBusy(false);
    }
  };

  return (
    <section className="max-w-5xl mx-auto px-6 py-10 md:py-16 space-y-10">
      <button
        type="button"
        onClick={onGoToCatalog}
        className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-950 transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Manuscript Catalog
      </button>

      <header className="space-y-3 max-w-2xl">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">
          FirstFolio Account Access
        </p>
        <h1 className="font-display text-3xl md:text-4xl font-bold text-zinc-900 leading-tight text-balance">
          {currentUser ? 'Manage your Reader or Author role' : 'Sign in for Authors & Readers'}
        </h1>
        <p className="text-sm text-zinc-600 leading-relaxed">
          {currentUser
            ? 'You are signed in with Google. Switch between Reader and Author workspaces anytime.'
            : 'Choose how you want to participate on FirstFolio. Both portals sign in securely with your Google account.'}
        </p>
      </header>

      {authError && (
        <div
          role="alert"
          className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-900"
        >
          {authError}
        </div>
      )}

      {currentUser ? (
        <div className="bg-white border border-[#E6E3DC] rounded-xl p-6 md:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E6E3DC] pb-5">
            <div className="space-y-1">
              <p className="text-xs text-zinc-500">Signed-In Account</p>
              <p className="font-display text-xl font-semibold text-zinc-900">
                {currentUser.displayName || 'FirstFolio Member'}
              </p>
              <p className="text-xs text-zinc-600">
                {currentUser.email} · Active role:{' '}
                <span className="font-semibold text-zinc-900">
                  {activeRole === 'author' ? 'Author' : 'Reader'}
                </span>
              </p>
            </div>
            <button
              type="button"
              disabled={isAuthBusy}
              onClick={onSignOut}
              className="min-h-[40px] px-4 py-2 rounded-lg border border-[#D8D3C8] text-sm font-medium text-zinc-800 hover:bg-zinc-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Sign Out
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
            <div className="border border-[#E6E3DC] rounded-xl p-6 flex flex-col justify-between gap-5 bg-[#FAF9F6]">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-900">
                    <BookOpen className="w-4 h-4 text-[#1E3A8A]" />
                    Reader &amp; Patron
                  </span>
                  {activeRole === 'reader' && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-[#1E3A8A]">
                      <Check className="w-3.5 h-3.5" /> Active
                    </span>
                  )}
                </div>
                <p className="text-sm text-zinc-600 leading-relaxed">
                  Read sample chapters, leave 1–5 star literary critiques, and donate toward debut publishing goals.
                </p>
              </div>
              <div className="flex items-center gap-3">
                {activeRole !== 'reader' && (
                  <button
                    type="button"
                    disabled={roleBusy}
                    onClick={() => handleRoleSwitch('reader')}
                    className="min-h-[40px] px-4 py-2 rounded-lg border border-[#D8D3C8] bg-white text-sm font-medium text-zinc-900 hover:bg-zinc-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Switch to Reader
                  </button>
                )}
                <button
                  type="button"
                  onClick={onGoToCatalog}
                  className="min-h-[40px] px-4 py-2 rounded-lg bg-[#1E3A8A] text-white text-sm font-medium hover:bg-[#1E40AF] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Open Reading Catalog
                </button>
              </div>
            </div>

            <div className="border border-[#E6E3DC] rounded-xl p-6 flex flex-col justify-between gap-5 bg-[#FAF9F6]">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-900">
                    <Feather className="w-4 h-4 text-[#1E3A8A]" />
                    Debut Author
                  </span>
                  {activeRole === 'author' && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-[#1E3A8A]">
                      <Check className="w-3.5 h-3.5" /> Active
                    </span>
                  )}
                </div>
                <p className="text-sm text-zinc-600 leading-relaxed">
                  Activate your $1/month author membership, post manuscripts and budgets, and track reader ratings.
                </p>
              </div>
              <div className="flex items-center gap-3">
                {activeRole !== 'author' && (
                  <button
                    type="button"
                    disabled={roleBusy}
                    onClick={() => handleRoleSwitch('author')}
                    className="min-h-[40px] px-4 py-2 rounded-lg border border-[#D8D3C8] bg-white text-sm font-medium text-zinc-900 hover:bg-zinc-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Switch to Author
                  </button>
                )}
                <button
                  type="button"
                  onClick={onGoToStudio}
                  className="min-h-[40px] px-4 py-2 rounded-lg bg-[#1E3A8A] text-white text-sm font-medium hover:bg-[#1E40AF] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Open Author Studio
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
          {/* Reader Portal */}
          <article
            className={`bg-white rounded-xl p-7 md:p-8 flex flex-col justify-between gap-8 border transition-colors ${
              selectedRole === 'reader' ? 'border-[#1E3A8A]' : 'border-[#E6E3DC]'
            }`}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">
                  For Readers &amp; Patrons · Free
                </p>
                <BookOpen className="w-5 h-5 text-[#1E3A8A]" />
              </div>

              <h2 className="font-display text-2xl font-bold text-zinc-900">
                Reader Sign In
              </h2>

              <p className="text-sm text-zinc-600 leading-relaxed">
                Discover debut writers before they hit bookstore shelves. Read opening chapters, publish 1–5 star craft ratings, and fund independent print runs.
              </p>

              <ul className="space-y-2.5 pt-2 text-sm text-zinc-700 border-t border-[#E6E3DC]">
                <li className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-[#1E3A8A] shrink-0 mt-0.5" />
                  <span>Rate manuscripts on Storytelling, Prose, Worldbuilding, and Pacing</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-[#1E3A8A] shrink-0 mt-0.5" />
                  <span>Back debut books with transparent editing, cover, and print donations</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-[#1E3A8A] shrink-0 mt-0.5" />
                  <span>Zero membership fee for readers</span>
                </li>
              </ul>
            </div>

            <button
              type="button"
              disabled={isAuthBusy}
              onClick={() => handleRoleSignIn('reader')}
              className={`w-full min-h-[44px] px-5 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60 ${
                selectedRole === 'reader'
                  ? 'bg-[#1E3A8A] text-white hover:bg-[#1E40AF]'
                  : 'bg-zinc-900 text-white hover:bg-zinc-800'
              }`}
            >
              {isAuthBusy && selectedRole === 'reader'
                ? 'Signing in...'
                : 'Continue with Google as Reader'}
            </button>
          </article>

          {/* Author Portal */}
          <article
            className={`bg-white rounded-xl p-7 md:p-8 flex flex-col justify-between gap-8 border transition-colors ${
              selectedRole === 'author' ? 'border-[#1E3A8A]' : 'border-[#E6E3DC]'
            }`}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">
                  For Beginner Authors · $1 / Month
                </p>
                <Feather className="w-5 h-5 text-[#1E3A8A]" />
              </div>

              <h2 className="font-display text-2xl font-bold text-zinc-900">
                Author Sign In
              </h2>

              <p className="text-sm text-zinc-600 leading-relaxed">
                Share your debut manuscript with an engaged reading community, collect constructive ratings, and raise funding to bring your book into print.
              </p>

              <ul className="space-y-2.5 pt-2 text-sm text-zinc-700 border-t border-[#E6E3DC]">
                <li className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-[#1E3A8A] shrink-0 mt-0.5" />
                  <span>Post book covers, synopses, and sample chapters up to 8,000 characters</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-[#1E3A8A] shrink-0 mt-0.5" />
                  <span>Itemize editing, cover design, and print run donation targets</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-[#1E3A8A] shrink-0 mt-0.5" />
                  <span>Receive instant notifications when readers donate or review your work</span>
                </li>
              </ul>
            </div>

            <button
              type="button"
              disabled={isAuthBusy}
              onClick={() => handleRoleSignIn('author')}
              className={`w-full min-h-[44px] px-5 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60 ${
                selectedRole === 'author'
                  ? 'bg-[#1E3A8A] text-white hover:bg-[#1E40AF]'
                  : 'bg-zinc-900 text-white hover:bg-zinc-800'
              }`}
            >
              {isAuthBusy && selectedRole === 'author'
                ? 'Signing in...'
                : 'Continue with Google as Author'}
            </button>
          </article>
        </div>
      )}
    </section>
  );
};
