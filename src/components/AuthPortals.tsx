import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Car,
  CheckCircle2,
  Globe2,
  MapPin,
  QrCode,
  ShieldCheck,
  Users,
  Wrench,
} from 'lucide-react';
import {
  HERO_MECHANIC_IMAGE,
  LIMITS,
  MECHANIC_AVATARS,
  MIN_MECHANIC_TEAM_SIZE,
  MONTHLY_FEE_USD,
  TRIAL_DAYS,
} from '../types';
import { detectDefaultCountryCode, getCountryPaymentProfile } from '../data/countryPayments';
import { IdentityVerificationCard, PendingIdentityDraft } from './IdentityVerificationCard';
import { PWAInstallButton } from './PWAInstallButton';

interface CustomerSignInPageProps {
  signingIn: boolean;
  authError: string | null;
  onSignIn: (vehicleSummary?: string, identityDraft?: PendingIdentityDraft | null) => void;
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
  const [identityDraft, setIdentityDraft] = useState<PendingIdentityDraft | null>(null);
  const defaultCountry = getCountryPaymentProfile(detectDefaultCountryCode());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = vehicleSummary.trim().slice(0, LIMITS.vehicleMax);
    onSignIn(clean.length >= LIMITS.vehicleMin ? clean : undefined, identityDraft);
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
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 flex flex-col justify-between space-y-6">
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center shrink-0">
                  <Car className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-orange-700">
                    Customer Roadside Account
                  </div>
                  <div className="text-xs text-slate-500">Motorist Dispatch &amp; Verification</div>
                </div>
              </div>
              <PWAInstallButton />
            </div>

            <div className="space-y-2">
              <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 text-balance">
                Customer Sign In
              </h1>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                Join with your original ID or Passport for roadside safety verification, share how you will pay (Cash, Card, Mobile Money, or local rails in your country), and hire verified mechanic teams.
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

              <IdentityVerificationCard
                mode="pre_signin"
                role="motorist"
                defaultCountryName={defaultCountry.name}
                onDraftChange={setIdentityDraft}
              />

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
                {signingIn
                  ? 'Opening Google Sign-In...'
                  : identityDraft
                  ? 'Sign In & Submit Original ID Verification'
                  : 'Sign In as Customer with Google'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="border-t border-slate-100 pt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-600">
              <div className="space-y-1">
                <MapPin className="w-4 h-4 text-orange-600" />
                <div className="font-semibold text-slate-900">Name Your Price</div>
                <div>Pin your breakdown and set your own offer.</div>
              </div>
              <div className="space-y-1">
                <Globe2 className="w-4 h-4 text-emerald-700" />
                <div className="font-semibold text-slate-900">Country-Aware Pay</div>
                <div>Share Cash, Card, Mobile Money, UPI, Pix, or Bank Transfer.</div>
              </div>
              <div className="space-y-1">
                <ShieldCheck className="w-4 h-4 text-sky-700" />
                <div className="font-semibold text-slate-900">ID Checked</div>
                <div>Every customer and mechanic team submits original ID.</div>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4 flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="text-slate-600">Joining as a 3+ person mechanic company?</span>
            <button
              type="button"
              onClick={onSwitchToMechanic}
              className="font-semibold text-slate-900 hover:text-orange-700 underline underline-offset-4 whitespace-nowrap"
            >
              Go to Mechanic Company Sign In
            </button>
          </div>
        </div>

        {/* Right: Customer Portal Visual Panel */}
        <div className="lg:col-span-5">
          <div className="relative h-full min-h-[420px] rounded-3xl overflow-hidden bg-slate-900 border border-slate-200">
            <img
              src={HERO_MECHANIC_IMAGE}
              alt="Mobile mechanic team assisting a motorist by the roadside"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/35 to-transparent" />
            <div className="absolute bottom-6 left-6 right-6 text-white space-y-3">
              <div className="text-xs font-semibold text-orange-300">
                Verified Stranded Driver Dispatch
              </div>
              <h2 className="font-display text-2xl font-bold leading-snug text-balance">
                Dispatched to vetted mechanic companies of 3+ technicians—with your payment method shared upfront.
              </h2>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-300">
                <span>Cash</span>
                <span aria-hidden="true">·</span>
                <span>Card</span>
                <span aria-hidden="true">·</span>
                <span>Mobile Money</span>
                <span aria-hidden="true">·</span>
                <span>UPI / Pix / Bank</span>
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
  onSignIn: (identityDraft?: PendingIdentityDraft | null) => void;
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
  const [identityDraft, setIdentityDraft] = useState<PendingIdentityDraft | null>(null);
  const defaultCountry = getCountryPaymentProfile(detectDefaultCountryCode());

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
        {/* Left: Mechanic Company Sign-In Card */}
        <div className="lg:col-span-7 bg-slate-900 text-white border border-slate-800 rounded-3xl p-6 sm:p-8 flex flex-col justify-between space-y-6">
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                  <Wrench className="w-5 h-5 text-orange-400" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-orange-400">
                    Mechanic Company Portal ({MIN_MECHANIC_TEAM_SIZE}+ Mechanics Required)
                  </div>
                  <div className="text-xs text-slate-400">
                    {TRIAL_DAYS}-Day Free Trial · ${MONTHLY_FEE_USD.toFixed(2)}/mo After
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-white text-balance">
                Mechanic Company Sign In
              </h1>
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                Mechanic accounts are strictly for registered companies or workshops with <strong>{MIN_MECHANIC_TEAM_SIZE} or more mechanics</strong>. Upload an original ID or Passport for background check verification to start bidding.
              </p>
            </div>

            <div className="space-y-2 border-y border-slate-800 py-4 text-xs text-slate-200">
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4 text-orange-400 shrink-0" />
                <span>
                  <strong>Group Requirement:</strong> Must include a team of <strong>{MIN_MECHANIC_TEAM_SIZE}+ mechanics</strong>
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  Start with a full <strong>{TRIAL_DAYS}-day free trial</strong>, then flat{' '}
                  <strong className="tabular-nums">${MONTHLY_FEE_USD.toFixed(2)}/month</strong>
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  Accept payments in your country&apos;s rails (Cash, Card, Mobile Money, UPI, Pix, Bank Transfer)
                </span>
              </div>
            </div>

            <IdentityVerificationCard
              mode="pre_signin"
              role="mechanic"
              darkSurface
              defaultCountryName={defaultCountry.name}
              onDraftChange={setIdentityDraft}
            />

            {authError && (
              <p className="text-xs font-medium text-red-200 bg-red-950/70 border border-red-800 rounded-xl px-3.5 py-2.5">
                {authError}
              </p>
            )}

            <button
              type="button"
              disabled={signingIn}
              onClick={() => onSignIn(identityDraft)}
              className="w-full min-h-[50px] px-6 py-3 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
            >
              {signingIn
                ? 'Opening Google Sign-In...'
                : identityDraft
                ? 'Sign In & Submit Original ID Verification'
                : 'Sign In as Mechanic Company with Google'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="border-t border-slate-800 pt-4 flex flex-wrap items-center justify-between gap-3 text-xs">
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

        {/* Right: Mechanic Company Economics & Dispatch Overview */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="text-xs font-semibold text-orange-700">
              Built for Verified Mechanic Companies (3+ Crew)
            </div>
            <h2 className="font-display text-2xl font-bold text-slate-900 text-balance">
              Direct payouts in your country&apos;s local payment rails. Zero per-job fees.
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Once signed in, register your company ID and at least 3 crew members, choose your country&apos;s payout handles (M-Pesa, UPI, Pix, Faster Payments, SEPA, Zelle, Card, or Cash), and start your 7-day trial.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-1">
              <Users className="w-4 h-4 text-orange-600" />
              <div className="font-display text-lg font-bold text-slate-900 tabular-nums">
                {MIN_MECHANIC_TEAM_SIZE}+ Crew
              </div>
              <div className="text-xs text-slate-600">Company group min</div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-1">
              <CalendarClock className="w-4 h-4 text-slate-800" />
              <div className="font-display text-lg font-bold text-slate-900 tabular-nums">
                {TRIAL_DAYS} Days
              </div>
              <div className="text-xs text-slate-600">Free trial on signup</div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-1">
              <QrCode className="w-4 h-4 text-emerald-700" />
              <div className="font-display text-lg font-bold text-slate-900 tabular-nums">
                ${MONTHLY_FEE_USD}/mo
              </div>
              <div className="text-xs text-slate-600">100% direct payouts</div>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-5 space-y-3">
            <div className="text-xs font-semibold text-slate-700">
              Verified Mechanic Companies on WrenchBid
            </div>
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                {MECHANIC_AVATARS.map((av, idx) => (
                  <img
                    key={av}
                    src={av}
                    alt={`Featured mechanic company lead ${idx + 1}`}
                    referrerPolicy="no-referrer"
                    className="w-10 h-10 rounded-full object-cover border-2 border-white bg-slate-100"
                  />
                ))}
              </div>
              <div className="text-xs text-slate-600">
                Original ID &amp; background checked · 3+ crew per company
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
