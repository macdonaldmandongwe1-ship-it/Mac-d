import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Car,
  CheckCircle2,
  MapPin,
  QrCode,
  ShieldCheck,
  Star,
  Wrench,
} from 'lucide-react';
import {
  HERO_MECHANIC_IMAGE,
  LIMITS,
  MECHANIC_AVATARS,
  MONTHLY_FEE_USD,
  TRIAL_DAYS,
} from '../types';
import { PWAInstallButton } from './PWAInstallButton';

interface CustomerSignInPageProps {
  signingIn: boolean;
  authError: string | null;
  onSignIn: (vehicleSummary?: string) => void;
  onSwitchToMechanic: () => void;
  onBackToOverview: () => void;
}

export function CustomerSignInPage({
  signingIn,
  authError,
  onSignIn,
  onSwitchToMechanic,
  onBackToOverview,
}: CustomerSignInPageProps) {
  const [vehicleSummary, setVehicleSummary] = useState('2020 Toyota Corolla');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = vehicleSummary.trim().slice(0, LIMITS.vehicleMax);
    onSignIn(clean.length >= LIMITS.vehicleMin ? clean : undefined);
  };

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div className="mb-6">
        <button
          type="button"
          onClick={onBackToOverview}
          className="min-h-[40px] inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to WrenchBid overview
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left: Customer Sign-In Card */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-3xl p-6 sm:p-10 flex flex-col justify-between space-y-8">
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center shrink-0">
                  <Car className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-orange-700">
                    Customer Roadside Account
                  </div>
                  <div className="text-xs text-slate-500">Motorist Dispatch Access</div>
                </div>
              </div>
              <PWAInstallButton />
            </div>

            <div className="space-y-2">
              <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 text-balance">
                Customer Sign In
              </h1>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                Sign in to post your roadside repair price, watch nearby mechanics bid in real time, and pay your mechanic directly by QR code.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="customer-signin-vehicle"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Your Vehicle (optional, pre-fills requests)
                </label>
                <input
                  id="customer-signin-vehicle"
                  type="text"
                  maxLength={LIMITS.vehicleMax}
                  value={vehicleSummary}
                  onChange={(e) => setVehicleSummary(e.target.value)}
                  placeholder="e.g. 2020 Toyota Corolla"
                  className="w-full min-h-[46px] px-4 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900"
                />
              </div>

              {authError && (
                <p className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
                  {authError}
                </p>
              )}

              <button
                type="submit"
                disabled={signingIn}
                className="w-full min-h-[50px] px-6 py-3 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors shadow-xs"
              >
                {signingIn ? 'Opening Google Sign-In...' : 'Sign In as Customer with Google'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="border-t border-slate-100 pt-5 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-600">
              <div className="space-y-1">
                <MapPin className="w-4 h-4 text-orange-600" />
                <div className="font-semibold text-slate-900">Name Your Price</div>
                <div>Pin your breakdown and set your own offer.</div>
              </div>
              <div className="space-y-1">
                <QrCode className="w-4 h-4 text-emerald-700" />
                <div className="font-semibold text-slate-900">Direct QR Pay</div>
                <div>Pay your mechanic directly with 0% fee.</div>
              </div>
              <div className="space-y-1">
                <Star className="w-4 h-4 text-amber-500" />
                <div className="font-semibold text-slate-900">1–5 Star Ratings</div>
                <div>Rate every repair once completed.</div>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="text-slate-600">Are you a mobile mechanic or shop?</span>
            <button
              type="button"
              onClick={onSwitchToMechanic}
              className="font-semibold text-slate-900 hover:text-orange-700 underline underline-offset-4 whitespace-nowrap"
            >
              Go to Mechanic Sign In
            </button>
          </div>
        </div>

        {/* Right: Customer Portal Visual Panel */}
        <div className="lg:col-span-6">
          <div className="relative h-full min-h-[380px] rounded-3xl overflow-hidden bg-slate-900 border border-slate-200">
            <img
              src={HERO_MECHANIC_IMAGE}
              alt="Mobile mechanic assisting a motorist by the roadside"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/35 to-transparent" />
            <div className="absolute bottom-6 left-6 right-6 text-white space-y-3">
              <div className="text-xs font-semibold text-orange-300">
                For Stranded Drivers · Fast Local Dispatch
              </div>
              <h2 className="font-display text-2xl font-bold leading-snug text-balance">
                No inflated dispatch markups. You approve every bid before help rolls out.
              </h2>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-300">
                <span>Flat tires</span>
                <span aria-hidden="true">·</span>
                <span>Dead batteries</span>
                <span aria-hidden="true">·</span>
                <span>Lockouts</span>
                <span aria-hidden="true">·</span>
                <span>Engine &amp; winch recovery</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

interface MechanicSignInPageProps {
  signingIn: boolean;
  authError: string | null;
  onSignIn: () => void;
  onSwitchToCustomer: () => void;
  onBackToOverview: () => void;
}

export function MechanicSignInPage({
  signingIn,
  authError,
  onSignIn,
  onSwitchToCustomer,
  onBackToOverview,
}: MechanicSignInPageProps) {
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div className="mb-6">
        <button
          type="button"
          onClick={onBackToOverview}
          className="min-h-[40px] inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to WrenchBid overview
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left: Mechanic Sign-In Card (Workshop / Dispatch Identity) */}
        <div className="lg:col-span-6 bg-slate-900 text-white border border-slate-800 rounded-3xl p-6 sm:p-10 flex flex-col justify-between space-y-8">
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-4 border-b border-slate-800 pb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                  <Wrench className="w-5 h-5 text-orange-400" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-orange-400">
                    Mechanic Dispatch &amp; Billing Portal
                  </div>
                  <div className="text-xs text-slate-400">
                    {TRIAL_DAYS}-Day Free Trial · ${MONTHLY_FEE_USD.toFixed(2)}/mo After
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-white text-balance">
                Mechanic Sign In
              </h1>
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                Access live motorist breakdown offers, submit bids or counter-offers, collect 100% of repair payouts via your personal QR code, and manage your ${MONTHLY_FEE_USD.toFixed(2)}/month plan.
              </p>
            </div>

            <div className="space-y-2.5 border-y border-slate-800 py-5 text-xs text-slate-200">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  Start with a full <strong>{TRIAL_DAYS}-day free trial</strong> — bid immediately
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  Keep <strong>100% of every repair</strong> — customers scan your personal QR code
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  Flat <strong className="tabular-nums">${MONTHLY_FEE_USD.toFixed(2)}/month</strong> subscription after trial with built-in receipts
                </span>
              </div>
            </div>

            {authError && (
              <p className="text-xs font-medium text-red-200 bg-red-950/70 border border-red-800 rounded-xl px-3.5 py-2.5">
                {authError}
              </p>
            )}

            <button
              type="button"
              disabled={signingIn}
              onClick={onSignIn}
              className="w-full min-h-[50px] px-6 py-3 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
            >
              {signingIn ? 'Opening Google Sign-In...' : 'Sign In as Mechanic with Google'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="border-t border-slate-800 pt-5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="text-slate-400">Stranded driver looking for repair help?</span>
            <button
              type="button"
              onClick={onSwitchToCustomer}
              className="font-semibold text-white hover:text-orange-300 underline underline-offset-4 whitespace-nowrap"
            >
              Go to Customer Sign In
            </button>
          </div>
        </div>

        {/* Right: Mechanic Economics & Dispatch Overview */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-3xl p-6 sm:p-10 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="text-xs font-semibold text-orange-700">
              Built for Independent Mobile Technicians
            </div>
            <h2 className="font-display text-2xl font-bold text-slate-900 text-balance">
              Direct payouts to your QR code. Zero per-job commissions.
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Once signed in, set up your shop specialty, personal QR payment URI, and online radar toggle. Track your trial countdown, monthly plan, and motorist star ratings in one workspace.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-1">
              <CalendarClock className="w-4 h-4 text-orange-600" />
              <div className="font-display text-lg font-bold text-slate-900 tabular-nums">
                {TRIAL_DAYS} Days
              </div>
              <div className="text-xs text-slate-600">Free trial on signup</div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-1">
              <ShieldCheck className="w-4 h-4 text-slate-800" />
              <div className="font-display text-lg font-bold text-slate-900 tabular-nums">
                ${MONTHLY_FEE_USD.toFixed(2)}/mo
              </div>
              <div className="text-xs text-slate-600">Flat plan after trial</div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-1">
              <QrCode className="w-4 h-4 text-emerald-700" />
              <div className="font-display text-lg font-bold text-slate-900 tabular-nums">
                100%
              </div>
              <div className="text-xs text-slate-600">Direct job payouts</div>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-5 space-y-3">
            <div className="text-xs font-semibold text-slate-700">
              Active Mechanics on WrenchBid
            </div>
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                {MECHANIC_AVATARS.map((av, idx) => (
                  <img
                    key={av}
                    src={av}
                    alt={`Featured mechanic ${idx + 1}`}
                    referrerPolicy="no-referrer"
                    className="w-10 h-10 rounded-full object-cover border-2 border-white bg-slate-100"
                  />
                ))}
              </div>
              <div className="text-xs text-slate-600">
                Real-time breakdown alerts · Verified post-repair ratings
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
