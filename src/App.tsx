import React, { useEffect, useRef, useState } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  ArrowRight,
  CalendarClock,
  Car,
  LogOut,
  QrCode,
  ShieldCheck,
  Star,
  Wrench,
} from 'lucide-react';
import { CustomerSignInPage, MechanicSignInPage } from './components/AuthPortals';
import { MechanicWorkspace } from './components/MechanicWorkspace';
import { MotoristWorkspace } from './components/MotoristWorkspace';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OperationType, auth, db, googleProvider, handleFirestoreError } from './firebase';
import {
  HERO_MECHANIC_IMAGE,
  LIMITS,
  MECHANIC_AVATARS,
  MONTHLY_FEE_USD,
  MechanicProfile,
  TRIAL_DAYS,
  UserProfile,
  UserRole,
} from './types';

type AuthView = 'landing' | 'customer_signin' | 'mechanic_signin';

function getInitialAuthView(): AuthView {
  if (typeof window === 'undefined') return 'landing';
  if (window.location.hash === '#customer-signin') return 'customer_signin';
  if (window.location.hash === '#mechanic-signin') return 'mechanic_signin';
  return 'landing';
}

const FEATURED_MECHANICS = [
  {
    name: 'Mike Vance',
    specialty: 'Engine, Alternator & Belts',
    rating: '4.9',
    jobs: '318 repairs',
    avatar: MECHANIC_AVATARS[0],
  },
  {
    name: 'Sarah Jenkins',
    specialty: 'Diagnostics, Battery & Lockout',
    rating: '5.0',
    jobs: '264 repairs',
    avatar: MECHANIC_AVATARS[1],
  },
  {
    name: 'Mark Torres',
    specialty: 'Heavy Tires, Jacks & Recovery',
    rating: '4.9',
    jobs: '412 repairs',
    avatar: MECHANIC_AVATARS[2],
  },
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [mechanics, setMechanics] = useState<MechanicProfile[]>([]);
  const [myMechanic, setMyMechanic] = useState<MechanicProfile | null>(null);
  const [activeRole, setActiveRole] = useState<UserRole>('motorist');
  const [billingFocusCounter, setBillingFocusCounter] = useState(0);
  const [authView, setAuthView] = useState<AuthView>(getInitialAuthView);

  const pendingRoleRef = useRef<UserRole | null>(null);
  const pendingVehicleRef = useRef<string | undefined>(undefined);

  const navigateAuthView = (view: AuthView, anchor?: string) => {
    setAuthError(null);
    setAuthView(view);
    if (typeof window !== 'undefined') {
      if (view === 'customer_signin') {
        window.history.replaceState(null, '', '#customer-signin');
      } else if (view === 'mechanic_signin') {
        window.history.replaceState(null, '', '#mechanic-signin');
      } else if (anchor) {
        window.history.replaceState(null, '', `#${anchor}`);
        window.setTimeout(() => {
          document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth' });
        }, 40);
      } else {
        window.history.replaceState(null, '', '#top');
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Load or bootstrap user profile when signed in
  useEffect(() => {
    if (!authReady || !user) {
      setUserProfile(null);
      return;
    }

    const userPath = `users/${user.uid}`;
    const userRef = doc(db, 'users', user.uid);
    const unsub = onSnapshot(
      userRef,
      (snap) => {
        const requestedRole = pendingRoleRef.current;
        const requestedVehicle = pendingVehicleRef.current;

        if (snap.exists()) {
          const data = snap.data() as UserProfile;
          setUserProfile(data);

          if (requestedRole) {
            pendingRoleRef.current = null;
            pendingVehicleRef.current = undefined;
            setActiveRole(requestedRole);

            const updates: Record<string, unknown> = {};
            if (data.role !== requestedRole) {
              updates.role = requestedRole;
            }
            if (requestedVehicle && requestedVehicle !== data.vehicleSummary) {
              updates.vehicleSummary = requestedVehicle;
            }
            if (Object.keys(updates).length > 0) {
              updates.updatedAt = serverTimestamp();
              void updateDoc(userRef, updates).catch((err) =>
                handleFirestoreError(err, OperationType.UPDATE, userPath)
              );
            }
          } else {
            setActiveRole(data.role);
          }
        } else {
          const initialRole = requestedRole || 'motorist';
          const initialVehicle = requestedVehicle || '2020 Toyota Corolla';
          pendingRoleRef.current = null;
          pendingVehicleRef.current = undefined;
          setActiveRole(initialRole);

          const newProfile = {
            uid: user.uid,
            displayName: (user.displayName || user.email?.split('@')[0] || 'Roadside Member').slice(
              0,
              LIMITS.displayNameMax
            ),
            email: user.email || 'user@wrenchbid.app',
            role: initialRole,
            vehicleSummary: initialVehicle,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          void setDoc(userRef, newProfile).catch((err) =>
            handleFirestoreError(err, OperationType.CREATE, userPath)
          );
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, userPath)
    );

    return () => unsub();
  }, [authReady, user]);

  // Listen to online mechanics when authenticated
  useEffect(() => {
    if (!authReady || !user) {
      setMechanics([]);
      return;
    }
    const q = query(collection(db, 'mechanics'), where('isOnline', '==', true));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setMechanics(snap.docs.map((d) => d.data() as MechanicProfile));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'mechanics')
    );
    return () => unsub();
  }, [authReady, user]);

  // Listen directly to signed-in user's mechanic profile (works even if offline)
  useEffect(() => {
    if (!authReady || !user) {
      setMyMechanic(null);
      return;
    }
    const mechPath = `mechanics/${user.uid}`;
    const unsub = onSnapshot(
      doc(db, 'mechanics', user.uid),
      (snap) => {
        setMyMechanic(snap.exists() ? (snap.data() as MechanicProfile) : null);
      },
      (err) => handleFirestoreError(err, OperationType.GET, mechPath)
    );
    return () => unsub();
  }, [authReady, user]);

  const handleSignInForRole = async (role: UserRole, vehicleSummary?: string) => {
    setSigningIn(true);
    setAuthError(null);
    pendingRoleRef.current = role;
    pendingVehicleRef.current = vehicleSummary;
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      pendingRoleRef.current = null;
      pendingVehicleRef.current = undefined;
      const msg = err instanceof Error ? err.message : 'Unable to sign in with Google.';
      setAuthError(msg);
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    const returnPortal: AuthView = activeRole === 'mechanic' ? 'mechanic_signin' : 'customer_signin';
    await signOut(auth);
    navigateAuthView(returnPortal);
  };

  const handleSwitchRole = async (role: UserRole) => {
    setActiveRole(role);
    if (user && userProfile && userProfile.role !== role) {
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          role,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
      }
    }
  };

  const handleOpenMechanicBilling = async () => {
    await handleSwitchRole('mechanic');
    setBillingFocusCounter((c) => c + 1);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 h-14 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-8">
          {/* Zone 1: Single text element wordmark */}
          <button
            type="button"
            onClick={() => navigateAuthView('landing')}
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            WrenchBid
          </button>

          {/* Zone 2: 4 concise single-line nav links */}
          {!user ? (
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
              <button
                type="button"
                onClick={() => navigateAuthView('landing', 'how-it-works')}
                className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
              >
                How It Works
              </button>
              <button
                type="button"
                onClick={() => navigateAuthView('customer_signin')}
                className={`hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
                  authView === 'customer_signin' ? 'text-slate-900 font-semibold underline underline-offset-4' : ''
                }`}
              >
                Customer Sign In
              </button>
              <button
                type="button"
                onClick={() => navigateAuthView('mechanic_signin')}
                className={`hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
                  authView === 'mechanic_signin' ? 'text-slate-900 font-semibold underline underline-offset-4' : ''
                }`}
              >
                Mechanic Sign In
              </button>
              <button
                type="button"
                onClick={() => navigateAuthView('landing', 'pricing')}
                className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
              >
                Pricing
              </button>
            </nav>
          ) : (
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
              <button
                type="button"
                onClick={() => void handleSwitchRole('motorist')}
                className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
                  activeRole === 'motorist' ? 'text-slate-900 font-semibold underline underline-offset-4' : ''
                }`}
              >
                Motorist
              </button>
              <button
                type="button"
                onClick={() => void handleSwitchRole('mechanic')}
                className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
                  activeRole === 'mechanic' ? 'text-slate-900 font-semibold underline underline-offset-4' : ''
                }`}
              >
                Mechanic
              </button>
              <button
                type="button"
                onClick={() => void handleOpenMechanicBilling()}
                className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
              >
                Billing
              </button>
              <a
                href="#pricing-info"
                className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
              >
                $4/mo Plan
              </a>
            </nav>
          )}

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center shrink-0">
            {!user ? (
              <button
                type="button"
                onClick={() =>
                  navigateAuthView(authView === 'customer_signin' ? 'mechanic_signin' : 'customer_signin')
                }
                className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                {authView === 'customer_signin' ? 'Mechanic Sign In' : 'Customer Sign In'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            )}
          </div>
        </div>
      </header>

      <main id="top" className="flex-1 pb-24 lg:pb-12">
        {!authReady ? (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 text-sm text-slate-500">
            Connecting to WrenchBid dispatch...
          </div>
        ) : user && userProfile ? (
          /* Authenticated Live Dispatch Workspace */
          <section id="workspace" className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
            {/* Workspace Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
              <div>
                <div className="text-xs text-slate-500">
                  Signed in as {userProfile.displayName} · {userProfile.email}
                </div>
                <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 mt-0.5 text-balance">
                  {activeRole === 'motorist'
                    ? 'Request a Roadside Mechanic'
                    : 'Mechanic Dispatch, Profile & Billing'}
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1 p-1 bg-slate-200/75 rounded-xl">
                  <button
                    type="button"
                    onClick={() => void handleSwitchRole('motorist')}
                    className={`min-h-[44px] px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                      activeRole === 'motorist'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Car className="w-4 h-4 text-orange-600" />
                    Motorist Mode
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSwitchRole('mechanic')}
                    className={`min-h-[44px] px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                      activeRole === 'mechanic'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Wrench className="w-4 h-4 text-slate-800" />
                    Mechanic Mode
                  </button>
                </div>

                <PWAInstallButton />
              </div>
            </div>

            {activeRole === 'motorist' ? (
              <MotoristWorkspace
                uid={user.uid}
                userProfile={userProfile}
                mechanics={mechanics}
                onSwitchToMechanic={() => void handleSwitchRole('mechanic')}
              />
            ) : (
              <MechanicWorkspace
                uid={user.uid}
                userProfile={userProfile}
                mechanics={mechanics}
                myMechanic={myMechanic}
                billingFocusCounter={billingFocusCounter}
              />
            )}

            <div
              id="pricing-info"
              className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-sm"
            >
              <div className="text-slate-700">
                <strong className="text-slate-900">Mechanic Billing Policy:</strong> Every verified mechanic gets a full{' '}
                <strong>{TRIAL_DAYS}-day free trial</strong>, then a flat{' '}
                <strong className="tabular-nums">${MONTHLY_FEE_USD.toFixed(2)}/month</strong> subscription with 0% commission on QR payments.
              </div>
              <button
                type="button"
                onClick={() => void handleOpenMechanicBilling()}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                Open Mechanic Billing
              </button>
            </div>
          </section>
        ) : authView === 'customer_signin' ? (
          <CustomerSignInPage
            signingIn={signingIn}
            authError={authError}
            onSignIn={(vehicle) => void handleSignInForRole('motorist', vehicle)}
            onSwitchToMechanic={() => navigateAuthView('mechanic_signin')}
            onBackToOverview={() => navigateAuthView('landing')}
          />
        ) : authView === 'mechanic_signin' ? (
          <MechanicSignInPage
            signingIn={signingIn}
            authError={authError}
            onSignIn={() => void handleSignInForRole('mechanic')}
            onSwitchToCustomer={() => navigateAuthView('customer_signin')}
            onBackToOverview={() => navigateAuthView('landing')}
          />
        ) : (
          /* Public Landing & Role Portal Entry */
          <div className="space-y-16 py-8 sm:py-12">
            {/* Hero Split */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
                <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
                  <div className="text-xs font-semibold text-orange-700">
                    Android PWA · Direct Roadside Bidding
                  </div>
                  <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 leading-[1.1] text-balance">
                    Set your repair price. Hire a mechanic in minutes.
                  </h1>
                  <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-xl">
                    Stranded with a flat tire, dead battery, or engine stall? Name what you are willing to pay, compare live mechanic bids, and pay directly by scanning the mechanic&apos;s personal QR code.
                  </p>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => navigateAuthView('customer_signin')}
                      className="min-h-[50px] px-6 py-3 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold inline-flex items-center gap-2 shadow-sm transition-colors whitespace-nowrap"
                    >
                      <Car className="w-4 h-4" />
                      Customer Sign In
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => navigateAuthView('mechanic_signin')}
                      className="min-h-[50px] px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap"
                    >
                      <Wrench className="w-4 h-4 text-orange-400" />
                      Mechanic Sign In
                    </button>
                    <PWAInstallButton />
                  </div>

                  <div className="pt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500">
                    <span>Driver-set pricing</span>
                    <span aria-hidden="true">·</span>
                    <span>Mechanic QR code payments</span>
                    <span aria-hidden="true">·</span>
                    <span>7-day free trial, then $4/mo for mechanics</span>
                  </div>
                </div>

                <div className="lg:col-span-6">
                  <div className="relative h-72 sm:h-96 lg:h-full min-h-[340px] rounded-3xl overflow-hidden bg-slate-900 border border-slate-200 shadow-sm">
                    <img
                      src={HERO_MECHANIC_IMAGE}
                      alt="Mobile mechanic inspecting a stranded sedan on the highway shoulder"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent" />
                    <div className="absolute bottom-5 left-5 right-5 text-white flex flex-wrap items-end justify-between gap-4">
                      <div>
                        <div className="text-xs text-orange-300 font-semibold">
                          Live Roadside Dispatch
                        </div>
                        <div className="font-display text-lg font-semibold mt-0.5">
                          Negotiate directly. Zero dispatch middleman.
                        </div>
                      </div>
                      <div className="text-right tabular-nums">
                        <div className="text-xs text-slate-300">Mechanic Plan</div>
                        <div className="font-display text-lg font-bold">$4.00 / mo after 7d</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* How It Works */}
            <section id="how-it-works" className="max-w-7xl mx-auto px-4 sm:px-6">
              <div className="mb-8">
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
                  How Roadside Bidding Works
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  Built on real-time offer negotiation instead of inflated towing rates.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-2">
                  <div className="text-xs font-semibold text-orange-700">01. Post Your Offer</div>
                  <h3 className="font-display text-lg font-semibold text-slate-900">
                    Pin breakdown &amp; set price
                  </h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Select tire, battery, lockout, engine, or tow assistance, tap your GPS pin, and enter what you want to pay.
                  </p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-2">
                  <div className="text-xs font-semibold text-orange-700">02. Pick a Mechanic</div>
                  <h3 className="font-display text-lg font-semibold text-slate-900">
                    Compare bids &amp; ETAs
                  </h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Nearby mechanics accept your offer or send a counter-bid with their arrival time. You choose who dispatches.
                  </p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-2">
                  <div className="text-xs font-semibold text-orange-700">03. Scan QR &amp; Pay</div>
                  <h3 className="font-display text-lg font-semibold text-slate-900">
                    Direct mechanic QR code
                  </h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    When your car is running again, scan the mechanic&apos;s personal payment QR code to settle directly.
                  </p>
                </div>
              </div>
            </section>

            {/* Featured Mechanics */}
            <section id="mechanics" className="max-w-7xl mx-auto px-4 sm:px-6">
              <div className="mb-8">
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
                  Mobile Mechanics Ready to Bid
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  Every technician carries a verified QR payment profile for instant roadside settlement.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {FEATURED_MECHANICS.map((m) => (
                  <div
                    key={m.name}
                    className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center gap-4"
                  >
                    <img
                      src={m.avatar}
                      alt={m.name}
                      referrerPolicy="no-referrer"
                      className="w-16 h-16 rounded-2xl object-cover border border-slate-200 shrink-0 bg-slate-100"
                    />
                    <div className="min-w-0">
                      <h3 className="font-display text-base font-semibold text-slate-900 truncate">
                        {m.name}
                      </h3>
                      <p className="text-xs text-slate-600 truncate mt-0.5">{m.specialty}</p>
                      <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-2">
                        <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />
                        <span className="font-semibold text-slate-800 tabular-nums">{m.rating}</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">{m.jobs}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* QR Payments + $4/mo Subscription */}
            <section id="qr-payments" className="max-w-7xl mx-auto px-4 sm:px-6">
              <div
                id="pricing"
                className="bg-slate-900 text-white rounded-3xl p-6 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center"
              >
                <div className="lg:col-span-7 space-y-4">
                  <div className="text-xs font-semibold text-orange-400">
                    For Mobile Mechanics &amp; Workshops
                  </div>
                  <h2 className="font-display text-2xl sm:text-3xl font-bold text-balance">
                    7 Days Free, Then Just $4.00/Month
                  </h2>
                  <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl">
                    Keep 100% of every roadside repair you win. Track your 7-day trial status and manage $4/month subscription payments and receipts right inside your mechanic profile.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                    <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-4">
                      <CalendarClock className="w-5 h-5 text-orange-400 mb-2" />
                      <div className="font-display text-lg font-bold tabular-nums">7 Days Free</div>
                      <div className="text-xs text-slate-400 mt-0.5">Live trial countdown</div>
                    </div>
                    <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-4">
                      <QrCode className="w-5 h-5 text-emerald-400 mb-2" />
                      <div className="font-display text-lg font-bold">Personal QR</div>
                      <div className="text-xs text-slate-400 mt-0.5">Instant direct payouts</div>
                    </div>
                    <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-4">
                      <ShieldCheck className="w-5 h-5 text-sky-400 mb-2" />
                      <div className="font-display text-lg font-bold tabular-nums">$4.00 / mo</div>
                      <div className="text-xs text-slate-400 mt-0.5">Built-in billing &amp; receipts</div>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-5 bg-slate-800 border border-slate-700 rounded-2xl p-6 space-y-4">
                  <div className="text-xs text-slate-400">Dedicated Sign-In Portals</div>
                  <div className="font-display text-xl font-bold">
                    Choose your WrenchBid sign-in page
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Customers sign in to post breakdown offers and rate repairs. Mechanics sign in to start their 7-day free trial, bid on jobs, and manage $4/month billing.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => navigateAuthView('customer_signin')}
                      className="min-h-[46px] px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-900 text-xs font-semibold transition-colors"
                    >
                      Customer Sign In
                    </button>
                    <button
                      type="button"
                      onClick={() => navigateAuthView('mechanic_signin')}
                      className="min-h-[46px] px-4 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold transition-colors"
                    >
                      Mechanic Sign In
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}
      </main>

      {/* Mobile Bottom Thumb Navigation Bar (Signed-in only) */}
      {user && userProfile && (
        <nav
          aria-label="Mobile workspace switch"
          className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-16 pb-safe bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-2 items-center"
        >
          <button
            type="button"
            onClick={() => void handleSwitchRole('motorist')}
            className={`h-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
              activeRole === 'motorist' ? 'text-orange-600' : 'text-slate-500'
            }`}
          >
            <Car className="w-5 h-5" />
            <span>Motorist</span>
          </button>
          <button
            type="button"
            onClick={() => void handleSwitchRole('mechanic')}
            className={`h-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
              activeRole === 'mechanic' ? 'text-orange-600' : 'text-slate-500'
            }`}
          >
            <Wrench className="w-5 h-5" />
            <span>Mechanic &amp; Billing</span>
          </button>
        </nav>
      )}

      <OfflineIndicator />
    </div>
  );
}
