import React, { useEffect, useMemo, useState } from 'react';
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
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  Power,
  Send,
  Star,
  UserCheck,
  Wrench,
} from 'lucide-react';
import { OperationType, db, handleFirestoreError } from '../firebase';
import {
  BreakdownRequest,
  ISSUE_CATEGORIES,
  LIMITS,
  MECHANIC_AVATARS,
  MONTHLY_FEE_USD,
  MechanicBid,
  MechanicProfile,
  MechanicRating,
  RATING_LABELS,
  TRIAL_DURATION_MS,
  UserProfile,
  formatDurationRemaining,
  isMechanicSubscriptionValid,
} from '../types';
import { MechanicQRCard } from './MechanicQRCard';
import { RoadsideMap } from './RoadsideMap';
import { SubscriptionPanel } from './SubscriptionPanel';

interface MechanicWorkspaceProps {
  uid: string;
  userProfile: UserProfile;
  mechanics: MechanicProfile[];
  myMechanic: MechanicProfile | null;
  billingFocusCounter?: number;
}

type MechanicTab = 'dispatch' | 'profile_billing';

export function MechanicWorkspace({
  uid,
  userProfile,
  mechanics,
  myMechanic,
  billingFocusCounter = 0,
}: MechanicWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<MechanicTab>('dispatch');

  useEffect(() => {
    if (billingFocusCounter > 0) {
      setActiveTab('profile_billing');
    }
  }, [billingFocusCounter]);

  const [openRequests, setOpenRequests] = useState<BreakdownRequest[]>([]);
  const [assignedRequests, setAssignedRequests] = useState<BreakdownRequest[]>([]);
  const [myBidsByReq, setMyBidsByReq] = useState<Record<string, MechanicBid>>({});
  const [myRatings, setMyRatings] = useState<MechanicRating[]>([]);

  // Onboarding / Profile Form State
  const [displayName, setDisplayName] = useState(userProfile.displayName);
  const [specialty, setSpecialty] = useState('Engine, Battery & Tire Recovery');
  const [avatarUrl, setAvatarUrl] = useState<string>(MECHANIC_AVATARS[0]);
  const [qrLabel, setQrLabel] = useState(`@${userProfile.displayName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'mechanic'}`);
  const [qrUri, setQrUri] = useState(`https://pay.wrenchbid.app/${uid.slice(0, 10)}`);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSavedNotice, setProfileSavedNotice] = useState<string | null>(null);

  // Bid Composer State per request
  const [bidDrafts, setBidDrafts] = useState<
    Record<string, { amount: string; eta: string; note: string }>
  >({});
  const [submittingBidFor, setSubmittingBidFor] = useState<string | null>(null);

  useEffect(() => {
    if (!myMechanic) return;
    setDisplayName(myMechanic.displayName);
    setSpecialty(myMechanic.specialty);
    if (myMechanic.avatarUrl) setAvatarUrl(myMechanic.avatarUrl);
    setQrLabel(myMechanic.qrPaymentLabel);
    setQrUri(myMechanic.qrPaymentUri);
  }, [myMechanic]);

  // Open breakdown requests
  useEffect(() => {
    const q = query(collection(db, 'requests'), where('status', '==', 'open'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as BreakdownRequest)
          .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
        setOpenRequests(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'requests')
    );
    return () => unsub();
  }, []);

  // Requests assigned to this mechanic
  useEffect(() => {
    const q = query(collection(db, 'requests'), where('acceptedMechanicId', '==', uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as BreakdownRequest)
          .sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0));
        setAssignedRequests(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'requests')
    );
    return () => unsub();
  }, [uid]);

  // Listen to this mechanic's own bids on open requests
  useEffect(() => {
    if (openRequests.length === 0) {
      setMyBidsByReq({});
      return;
    }

    const unsubs = openRequests.map((req) => {
      const q = query(
        collection(db, 'requests', req.id, 'bids'),
        where('mechanicId', '==', uid)
      );
      return onSnapshot(
        q,
        (snap) => {
          const bid = snap.docs[0]?.data() as MechanicBid | undefined;
          setMyBidsByReq((prev) => {
            if (!bid) {
              const copy = { ...prev };
              delete copy[req.id];
              return copy;
            }
            return { ...prev, [req.id]: bid };
          });
        },
        (err) => handleFirestoreError(err, OperationType.LIST, `requests/${req.id}/bids`)
      );
    });

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [openRequests, uid]);

  // Listen to motorist post-repair ratings for this mechanic
  useEffect(() => {
    const q = query(collection(db, 'ratings'), where('mechanicId', '==', uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as MechanicRating)
          .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
        setMyRatings(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'ratings')
    );
    return () => unsub();
  }, [uid]);

  const canBid = isMechanicSubscriptionValid(myMechanic);
  const nowMs = Date.now();
  const isTrialActive =
    myMechanic?.subscriptionStatus === 'trial' && myMechanic.trialEndsAtMs > nowMs;
  const isPaidActive =
    myMechanic?.subscriptionStatus === 'active' && myMechanic.subscriptionPaidUntilMs > nowMs;

  const activeJobs = useMemo(
    () =>
      assignedRequests.filter(
        (r) => r.status !== 'completed' && r.status !== 'cancelled'
      ),
    [assignedRequests]
  );

  const handleActivateTrialProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = displayName.trim().slice(0, LIMITS.mechanicNameMax);
    const cleanSpec = specialty.trim().slice(0, LIMITS.specialtyMax);
    const cleanLabel = qrLabel.trim().slice(0, LIMITS.qrLabelMax);
    const cleanUri = qrUri.trim().slice(0, LIMITS.qrUriMax);

    if (
      cleanName.length < LIMITS.mechanicNameMin ||
      cleanSpec.length < LIMITS.specialtyMin ||
      cleanLabel.length < LIMITS.qrLabelMin ||
      cleanUri.length < LIMITS.qrUriMin
    ) {
      return;
    }

    setSavingProfile(true);
    setProfileSavedNotice(null);
    const mechPath = `mechanics/${uid}`;

    try {
      if (!myMechanic) {
        const trialEndsAtMs = Date.now() + TRIAL_DURATION_MS;
        await setDoc(doc(db, 'mechanics', uid), {
          uid,
          displayName: cleanName,
          specialty: cleanSpec,
          avatarUrl,
          rating: 5,
          ratingCount: 0,
          ratingSum: 0,
          completedJobs: 0,
          lat: 37.7749,
          lng: -122.4194,
          isOnline: true,
          qrPaymentUri: cleanUri,
          qrPaymentLabel: cleanLabel,
          trialStartedAt: serverTimestamp(),
          trialEndsAtMs,
          subscriptionStatus: 'trial',
          subscriptionPaidUntilMs: 0,
          monthlyFeeUsd: MONTHLY_FEE_USD,
          autoRenew: true,
          preferredBillingMethod: 'card',
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(doc(db, 'mechanics', uid), {
          displayName: cleanName,
          specialty: cleanSpec,
          avatarUrl,
          qrPaymentUri: cleanUri,
          qrPaymentLabel: cleanLabel,
          updatedAt: serverTimestamp(),
        });
        setProfileSavedNotice('Mechanic profile & QR payment settings saved.');
      }
    } catch (err) {
      handleFirestoreError(err, myMechanic ? OperationType.UPDATE : OperationType.CREATE, mechPath);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleToggleOnline = async () => {
    if (!myMechanic) return;
    try {
      await updateDoc(doc(db, 'mechanics', uid), {
        isOnline: !myMechanic.isOnline,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `mechanics/${uid}`);
    }
  };

  const handleSubmitBid = async (req: BreakdownRequest, acceptOfferOnly: boolean) => {
    if (!myMechanic || !canBid) {
      setActiveTab('profile_billing');
      return;
    }
    const draft = bidDrafts[req.id] || {
      amount: String(req.offerPriceUsd),
      eta: '15',
      note: '',
    };
    const bidAmount = acceptOfferOnly
      ? req.offerPriceUsd
      : Math.max(LIMITS.offerMin, Math.min(LIMITS.offerMax, Number(draft.amount) || req.offerPriceUsd));
    const etaMinutes = Math.max(
      LIMITS.etaMin,
      Math.min(LIMITS.etaMax, Math.round(Number(draft.eta) || 15))
    );
    const cleanNote = draft.note.trim().slice(0, LIMITS.bidNoteMax);

    setSubmittingBidFor(req.id);
    const bidId = `bid_${uid}_${req.id}`;
    const bidPath = `requests/${req.id}/bids/${bidId}`;

    try {
      const payload: Record<string, unknown> = {
        id: bidId,
        requestId: req.id,
        motoristId: req.motoristId,
        mechanicId: uid,
        mechanicName: myMechanic.displayName,
        mechanicSpecialty: myMechanic.specialty,
        mechanicRating: myMechanic.rating,
        bidAmountUsd: bidAmount,
        etaMinutes,
        qrPaymentUri: myMechanic.qrPaymentUri,
        qrPaymentLabel: myMechanic.qrPaymentLabel,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (cleanNote) payload.note = cleanNote;

      await setDoc(doc(db, 'requests', req.id, 'bids', bidId), payload);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, bidPath);
    } finally {
      setSubmittingBidFor(null);
    }
  };

  const handleAdvanceJob = async (
    req: BreakdownRequest,
    nextStatus: 'arrived' | 'in_progress' | 'payment_pending'
  ) => {
    try {
      await updateDoc(doc(db, 'requests', req.id), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `requests/${req.id}`);
    }
  };

  // Mechanic Onboarding Screen (First-time setup with 7-day free trial)
  if (!myMechanic) {
    return (
      <div className="max-w-3xl mx-auto bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="space-y-2 border-b border-slate-100 pb-5">
          <div className="text-xs font-semibold text-orange-700">
            7-Day Free Trial · Then $4.00/Month
          </div>
          <h2 className="font-display text-2xl font-bold text-slate-900">
            Create Your Mechanic Profile &amp; QR Payout Card
          </h2>
          <p className="text-sm text-slate-600">
            Start your free 7-day trial immediately. Customers pay you directly by scanning your personal QR code—keep 100% of every job.
          </p>
        </div>

        <form onSubmit={(e) => void handleActivateTrialProfile(e)} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="mech-name" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Mechanic / Shop Name
              </label>
              <input
                id="mech-name"
                type="text"
                required
                minLength={LIMITS.mechanicNameMin}
                maxLength={LIMITS.mechanicNameMax}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm text-slate-900"
              />
            </div>

            <div>
              <label htmlFor="mech-spec" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Specialty
              </label>
              <input
                id="mech-spec"
                type="text"
                required
                minLength={LIMITS.specialtyMin}
                maxLength={LIMITS.specialtyMax}
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm text-slate-900"
              />
            </div>

            <div>
              <label htmlFor="mech-qr-label" className="block text-xs font-semibold text-slate-700 mb-1.5">
                QR Payment Handle / Label
              </label>
              <input
                id="mech-qr-label"
                type="text"
                required
                minLength={LIMITS.qrLabelMin}
                maxLength={LIMITS.qrLabelMax}
                value={qrLabel}
                onChange={(e) => setQrLabel(e.target.value)}
                placeholder="@yourshop"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm text-slate-900"
              />
            </div>

            <div>
              <label htmlFor="mech-qr-uri" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Personal Payment URI (Venmo / CashApp / Stripe / UPI)
              </label>
              <input
                id="mech-qr-uri"
                type="text"
                required
                minLength={LIMITS.qrUriMin}
                maxLength={LIMITS.qrUriMax}
                value={qrUri}
                onChange={(e) => setQrUri(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm text-slate-900 font-mono"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-700">Select Profile Portrait</div>
            <div className="flex items-center gap-3">
              {MECHANIC_AVATARS.map((av) => (
                <button
                  key={av}
                  type="button"
                  onClick={() => setAvatarUrl(av)}
                  className={`w-16 h-16 rounded-2xl overflow-hidden border-2 transition-all ${
                    avatarUrl === av ? 'border-orange-600 ring-2 ring-orange-200' : 'border-slate-200'
                  }`}
                >
                  <img src={av} alt="Mechanic avatar option" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={savingProfile}
            className="w-full min-h-[48px] rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold transition-colors"
          >
            {savingProfile ? 'Starting 7-Day Free Trial...' : 'Start 7-Day Free Trial & Go Online'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Mechanic Profile Status Bar + Sub-Navigation Tabs */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <img
            src={myMechanic.avatarUrl || MECHANIC_AVATARS[0]}
            alt={myMechanic.displayName}
            referrerPolicy="no-referrer"
            className="w-14 h-14 rounded-2xl object-cover border border-slate-200 shrink-0 bg-slate-100"
          />
          <div className="min-w-0 space-y-0.5">
            <div className="font-display text-lg font-bold text-slate-900 truncate">
              {myMechanic.displayName}
            </div>
            <div className="text-xs text-slate-600 truncate">{myMechanic.specialty}</div>
            <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2 pt-0.5">
              <span className="inline-flex items-center gap-1 font-semibold text-slate-800 tabular-nums">
                <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                {myMechanic.rating.toFixed(1)}
                <span className="font-normal text-slate-500">
                  ({myMechanic.ratingCount ?? myRatings.length})
                </span>
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-semibold text-slate-800">
                {isPaidActive
                  ? 'Active $4.00/mo Plan'
                  : isTrialActive
                  ? `7-Day Free Trial · ${formatDurationRemaining(myMechanic.trialEndsAtMs, nowMs)}`
                  : 'Trial Expired'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{myMechanic.completedJobs} completed jobs</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Segmented Sub-Navigation */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('dispatch')}
              className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                activeTab === 'dispatch'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Wrench className="w-3.5 h-3.5 text-orange-600" />
              Live Dispatch
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('profile_billing')}
              className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                activeTab === 'profile_billing'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5 text-slate-700" />
              Profile &amp; Billing
            </button>
          </div>

          <button
            type="button"
            onClick={() => void handleToggleOnline()}
            className={`min-h-[40px] px-3.5 py-2 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              myMechanic.isOnline
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-slate-50 border-slate-300 text-slate-700'
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            {myMechanic.isOnline ? 'Online' : 'Offline'}
          </button>
        </div>
      </div>

      {activeTab === 'profile_billing' ? (
        /* Integrated Mechanic Profile + Billing Management View */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Mechanic Profile & QR Payment Setup */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <UserCheck className="w-4 h-4 text-orange-600" />
                <h3 className="font-display text-lg font-bold text-slate-900">
                  Mechanic Profile &amp; QR Setup
                </h3>
              </div>

              <form onSubmit={(e) => void handleActivateTrialProfile(e)} className="space-y-4">
                <div>
                  <label htmlFor="edit-mech-name" className="block text-xs font-semibold text-slate-700 mb-1">
                    Display / Shop Name
                  </label>
                  <input
                    id="edit-mech-name"
                    type="text"
                    required
                    minLength={LIMITS.mechanicNameMin}
                    maxLength={LIMITS.mechanicNameMax}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm text-slate-900"
                  />
                </div>

                <div>
                  <label htmlFor="edit-mech-spec" className="block text-xs font-semibold text-slate-700 mb-1">
                    Specialty
                  </label>
                  <input
                    id="edit-mech-spec"
                    type="text"
                    required
                    minLength={LIMITS.specialtyMin}
                    maxLength={LIMITS.specialtyMax}
                    value={specialty}
                    onChange={(e) => setSpecialty(e.target.value)}
                    className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm text-slate-900"
                  />
                </div>

                <div>
                  <label htmlFor="edit-mech-qr-label" className="block text-xs font-semibold text-slate-700 mb-1">
                    Customer QR Handle
                  </label>
                  <input
                    id="edit-mech-qr-label"
                    type="text"
                    required
                    minLength={LIMITS.qrLabelMin}
                    maxLength={LIMITS.qrLabelMax}
                    value={qrLabel}
                    onChange={(e) => setQrLabel(e.target.value)}
                    className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm text-slate-900"
                  />
                </div>

                <div>
                  <label htmlFor="edit-mech-qr-uri" className="block text-xs font-semibold text-slate-700 mb-1">
                    Customer QR Payment URI
                  </label>
                  <input
                    id="edit-mech-qr-uri"
                    type="text"
                    required
                    minLength={LIMITS.qrUriMin}
                    maxLength={LIMITS.qrUriMax}
                    value={qrUri}
                    onChange={(e) => setQrUri(e.target.value)}
                    className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-mono text-slate-900"
                  />
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-700 mb-2">Portrait</div>
                  <div className="flex items-center gap-2.5">
                    {MECHANIC_AVATARS.map((av) => (
                      <button
                        key={av}
                        type="button"
                        onClick={() => setAvatarUrl(av)}
                        className={`w-12 h-12 rounded-xl overflow-hidden border-2 ${
                          avatarUrl === av ? 'border-orange-600' : 'border-slate-200'
                        }`}
                      >
                        <img src={av} alt="Avatar" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>

                {profileSavedNotice && (
                  <div className="text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2.5 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{profileSavedNotice}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={savingProfile}
                  className="w-full min-h-[44px] rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors"
                >
                  {savingProfile ? 'Saving Profile...' : 'Save Profile & QR Settings'}
                </button>
              </form>
            </div>

            <MechanicQRCard
              mechanicName={myMechanic.displayName}
              qrLabel={myMechanic.qrPaymentLabel}
              qrUri={myMechanic.qrPaymentUri}
            />

            {/* Motorist Post-Repair Ratings & Feedback */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                  <h3 className="font-display text-base font-bold text-slate-900">
                    Motorist Ratings
                  </h3>
                </div>
                <span className="text-xs font-semibold text-slate-700 tabular-nums">
                  {myMechanic.rating.toFixed(1)} / 5 ({myRatings.length})
                </span>
              </div>

              {myRatings.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No post-repair ratings yet. Ratings from motorists appear here once repairs are completed and reviewed.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {myRatings.slice(0, 5).map((r) => (
                    <div key={r.id} className="py-3 first:pt-0 last:pb-0 space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-slate-900">{r.motoristName}</span>
                        <span className="inline-flex items-center gap-1 font-semibold text-amber-600 tabular-nums">
                          <Star className="w-3.5 h-3.5 fill-amber-500" />
                          {r.stars}.0 · {RATING_LABELS[r.stars]}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {r.vehicleMakeModel}
                        {r.createdAt?.toMillis
                          ? ` · ${new Date(r.createdAt.toMillis()).toLocaleDateString()}`
                          : ''}
                      </div>
                      {r.comment && (
                        <p className="text-xs text-slate-700 leading-relaxed pt-0.5">
                          &ldquo;{r.comment}&rdquo;
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Integrated Billing Management View (7-Day Trial & $4/mo Payments) */}
          <div className="lg:col-span-7">
            <SubscriptionPanel mechanic={myMechanic} />
          </div>
        </div>
      ) : (
        /* Live Dispatch Feed + Active Repairs */
        <div className="space-y-6">
          {/* Trial / Billing Gate Banner */}
          {!canBid ? (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-bold text-red-900">
                    7-Day Free Trial Expired — Bidding Paused
                  </div>
                  <p className="text-xs text-red-800 mt-0.5">
                    Activate your $4.00/month plan in Profile &amp; Billing to submit new bids on motorist breakdowns.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('profile_billing')}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs font-semibold whitespace-nowrap shrink-0"
              >
                Manage Billing ($4/mo)
              </button>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-slate-700">
                <CalendarClock className="w-4 h-4 text-orange-600 shrink-0" />
                <span>
                  {isPaidActive
                    ? `Active $4.00/mo plan · Valid until ${new Date(
                        myMechanic.subscriptionPaidUntilMs
                      ).toLocaleDateString()}`
                    : `7-Day Free Trial Active · ${formatDurationRemaining(
                        myMechanic.trialEndsAtMs,
                        nowMs
                      )} before $4.00/mo billing`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('profile_billing')}
                className="text-orange-700 hover:text-orange-800 font-semibold hover:underline underline-offset-2 text-left sm:text-right whitespace-nowrap"
              >
                Open Billing Management
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-5 space-y-6">
              <RoadsideMap
                centerLat={myMechanic.lat}
                centerLng={myMechanic.lng}
                mechanics={mechanics}
                requests={openRequests}
                activeLabel="Nearby Roadside Requests"
              />

              {/* Active Assigned Repairs */}
              {activeJobs.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                  <h3 className="font-display text-lg font-bold text-slate-900">
                    Active Assigned Repairs ({activeJobs.length})
                  </h3>

                  <div className="space-y-4">
                    {activeJobs.map((job) => (
                      <div key={job.id} className="border border-slate-200 rounded-xl p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-bold text-slate-900">
                              {job.vehicleMakeModel}
                            </div>
                            <div className="text-xs text-slate-600">
                              {job.motoristName} · {job.locationLabel}
                            </div>
                          </div>
                          <div className="font-display text-lg font-bold text-emerald-700 tabular-nums">
                            ${job.agreedPriceUsd ?? job.offerPriceUsd}
                          </div>
                        </div>

                        <div className="text-xs text-slate-500">
                          Status: <strong className="text-slate-900">{job.status.replace('_', ' ')}</strong>
                        </div>

                        {job.status === 'accepted' && (
                          <button
                            type="button"
                            onClick={() => void handleAdvanceJob(job, 'arrived')}
                            className="w-full min-h-[42px] rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
                          >
                            Mark Arrived at Scene
                          </button>
                        )}
                        {job.status === 'arrived' && (
                          <button
                            type="button"
                            onClick={() => void handleAdvanceJob(job, 'in_progress')}
                            className="w-full min-h-[42px] rounded-xl bg-orange-600 text-white text-xs font-semibold hover:bg-orange-700"
                          >
                            Start Roadside Repair
                          </button>
                        )}
                        {job.status === 'in_progress' && (
                          <button
                            type="button"
                            onClick={() => void handleAdvanceJob(job, 'payment_pending')}
                            className="w-full min-h-[42px] rounded-xl bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800"
                          >
                            Repair Done — Show Customer QR Code
                          </button>
                        )}
                        {job.status === 'payment_pending' && (
                          <MechanicQRCard
                            mechanicName={myMechanic.displayName}
                            qrLabel={myMechanic.qrPaymentLabel}
                            qrUri={myMechanic.qrPaymentUri}
                            amountUsd={job.agreedPriceUsd ?? job.offerPriceUsd}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Open Breakdown Offers Feed */}
            <div className="lg:col-span-7 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-xl font-bold text-slate-900">
                  Open Motorist Breakdowns
                </h3>
                <span className="text-xs text-slate-500 tabular-nums">
                  {openRequests.length} available
                </span>
              </div>

              {openRequests.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-2">
                  <Wrench className="w-7 h-7 text-slate-400 mx-auto" />
                  <div className="text-sm font-semibold text-slate-800">
                    No open breakdown requests right now
                  </div>
                  <p className="text-xs text-slate-500">
                    Keep your profile Online—new motorist offers appear here in real time.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {openRequests.map((req) => {
                    const existingBid = myBidsByReq[req.id];
                    const draft = bidDrafts[req.id] || {
                      amount: String(req.offerPriceUsd),
                      eta: '15',
                      note: '',
                    };
                    const catLabel =
                      ISSUE_CATEGORIES.find((c) => c.id === req.issueCategory)?.label ||
                      req.issueCategory;

                    return (
                      <div
                        key={req.id}
                        className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="space-y-1">
                            <div className="text-xs text-slate-500">
                              {catLabel} · {req.locationLabel}
                            </div>
                            <h4 className="font-display text-lg font-bold text-slate-900">
                              {req.vehicleMakeModel}
                            </h4>
                            <p className="text-sm text-slate-600">{req.issueNotes}</p>
                            <div className="text-xs text-slate-500">
                              Motorist: {req.motoristName}
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-xs text-slate-500">Driver Offer</div>
                            <div className="font-display text-2xl font-bold text-orange-600 tabular-nums">
                              ${req.offerPriceUsd}
                            </div>
                          </div>
                        </div>

                        {existingBid ? (
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                            <div>
                              <span className="font-semibold text-slate-900">
                                Your bid: ${existingBid.bidAmountUsd}
                              </span>{' '}
                              <span className="text-slate-600 tabular-nums">
                                · ETA {existingBid.etaMinutes} min · Status: {existingBid.status}
                              </span>
                            </div>
                            <span className="text-emerald-700 font-semibold">
                              Waiting for motorist
                            </span>
                          </div>
                        ) : (
                          <div className="border-t border-slate-100 pt-4 space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div>
                                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                  Counter Price (USD)
                                </label>
                                <div className="relative">
                                  <DollarSign className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                  <input
                                    type="number"
                                    min={LIMITS.offerMin}
                                    max={LIMITS.offerMax}
                                    value={draft.amount}
                                    onChange={(e) =>
                                      setBidDrafts((prev) => ({
                                        ...prev,
                                        [req.id]: { ...draft, amount: e.target.value },
                                      }))
                                    }
                                    className="w-full min-h-[40px] pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 text-sm tabular-nums"
                                  />
                                </div>
                              </div>

                              <div>
                                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                  ETA (minutes)
                                </label>
                                <div className="relative">
                                  <Clock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                  <input
                                    type="number"
                                    min={LIMITS.etaMin}
                                    max={LIMITS.etaMax}
                                    value={draft.eta}
                                    onChange={(e) =>
                                      setBidDrafts((prev) => ({
                                        ...prev,
                                        [req.id]: { ...draft, eta: e.target.value },
                                      }))
                                    }
                                    className="w-full min-h-[40px] pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 text-sm tabular-nums"
                                  />
                                </div>
                              </div>

                              <div>
                                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                  Note (optional)
                                </label>
                                <input
                                  type="text"
                                  maxLength={LIMITS.bidNoteMax}
                                  value={draft.note}
                                  onChange={(e) =>
                                    setBidDrafts((prev) => ({
                                      ...prev,
                                      [req.id]: { ...draft, note: e.target.value },
                                    }))
                                  }
                                  placeholder="Tools ready in van"
                                  className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-300 text-sm"
                                />
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={!canBid || submittingBidFor === req.id}
                                onClick={() => void handleSubmitBid(req, true)}
                                className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Accept ${req.offerPriceUsd} Offer
                              </button>
                              <button
                                type="button"
                                disabled={!canBid || submittingBidFor === req.id}
                                onClick={() => void handleSubmitBid(req, false)}
                                className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                              >
                                <Send className="w-3.5 h-3.5" />
                                Send Bid (${draft.amount})
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
