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
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  ExternalLink,
  Globe,
  Plus,
  Power,
  QrCode,
  RefreshCw,
  Send,
  ShieldCheck,
  Star,
  Trash2,
  UserCheck,
  Users,
  Wrench,
} from 'lucide-react';
import {
  COUNTRY_PAYMENT_PROFILES,
  detectDefaultCountryCode,
  formatLocalCurrencyApprox,
  getCountryMethodDetail,
  getCountryPaymentProfile,
} from '../data/countryPayments';
import { OperationType, db, handleFirestoreError } from '../firebase';
import {
  CUSTOMER_PAYMENT_METHODS,
  CustomerPaymentMethod,
  BreakdownRequest,
  ISSUE_CATEGORIES,
  IdentityVerification,
  LIMITS,
  MECHANIC_AVATARS,
  MIN_MECHANIC_TEAM_SIZE,
  MONTHLY_FEE_USD,
  MechanicBid,
  MechanicProfile,
  MechanicRating,
  RATING_LABELS,
  TRIAL_DURATION_MS,
  UserProfile,
  formatDurationRemaining,
  getCustomerPaymentMethodMeta,
  isMechanicSubscriptionValid,
} from '../types';
import { IdentityVerificationCard } from './IdentityVerificationCard';
import { MechanicEarningsChart } from './MechanicEarningsChart';
import { MechanicQRCard } from './MechanicQRCard';
import {
  LiveGeoPosition,
  RoadsideMap,
  buildGoogleMapsLink,
  estimateDriveMinutes,
  formatDistance,
  haversineKm,
} from './RoadsideMap';
import { SubscriptionPanel } from './SubscriptionPanel';

interface MechanicWorkspaceProps {
  uid: string;
  userProfile: UserProfile;
  mechanics: MechanicProfile[];
  myMechanic: MechanicProfile | null;
  identityVerification: IdentityVerification | null;
  billingFocusCounter?: number;
}

type MechanicTab = 'dispatch' | 'profile_billing';

function normalizeInitialMembers(
  existing: string[] | undefined,
  leadFallback: string
): string[] {
  const clean = (existing || []).map((n) => n.trim()).filter(Boolean);
  const padded = [...clean];
  if (padded.length === 0 && leadFallback.trim()) {
    padded.push(leadFallback.trim());
  }
  while (padded.length < MIN_MECHANIC_TEAM_SIZE) {
    padded.push('');
  }
  return padded;
}

function extractQrInvoiceRef(uri?: string): string | undefined {
  if (!uri) return undefined;
  const match = uri.match(/[?&]ref=([^&]+)/);
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function buildUniqueJobPaymentQr(params: {
  job: BreakdownRequest;
  mechanic: MechanicProfile;
  customHandle?: string;
  invoiceNonce: string;
}): { qrUri: string; qrLabel: string; invoiceRef: string } {
  const { job, mechanic, customHandle, invoiceNonce } = params;
  const jobCountry = getCountryPaymentProfile(job.countryCode || mechanic.countryCode);
  const jobMethod = job.paymentMethod || jobCountry.defaultMethod;
  const jobPayDetail = getCountryMethodDetail(jobCountry.code, jobMethod);
  const agreedUsd = job.agreedPriceUsd ?? job.offerPriceUsd;

  const jobSlug = job.id.replace(/[^a-zA-Z0-9]/g, '').slice(-5).toUpperCase() || 'JOB';
  const invoiceRef = `WB-${jobSlug}-${invoiceNonce}`;

  const baseUri = (mechanic.qrPaymentUri || 'https://pay.wrenchbid.app/job').trim();
  const sep = baseUri.includes('?') ? '&' : '?';

  const query = new URLSearchParams({
    ref: invoiceRef,
    job: job.id.slice(0, 20),
    amount: agreedUsd.toFixed(2),
    cur: jobCountry.currencyCode,
    country: jobCountry.code,
    method: jobMethod,
  });

  if (job.paymentDetailNote?.trim()) {
    query.set('note', job.paymentDetailNote.trim().slice(0, 32));
  }

  let fullUri = `${baseUri}${sep}${query.toString()}`;
  if (fullUri.length > LIMITS.qrUriMax) {
    query.delete('note');
    fullUri = `${baseUri}${sep}${query.toString()}`;
  }
  if (fullUri.length > LIMITS.qrUriMax) {
    query.set('job', job.id.slice(0, 10));
    fullUri = `${baseUri}${sep}${query.toString()}`.slice(0, LIMITS.qrUriMax);
  }

  const baseHandle = (customHandle?.trim() || mechanic.qrPaymentLabel || 'Workshop').trim();
  const qrLabel = `${baseHandle} · ${jobPayDetail.localLabel} (${invoiceRef})`.slice(
    0,
    LIMITS.qrLabelMax
  );

  return { qrUri: fullUri, qrLabel, invoiceRef };
}

export function MechanicWorkspace({
  uid,
  userProfile,
  mechanics,
  myMechanic,
  identityVerification,
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

  const initialCountry = useMemo(
    () => myMechanic?.countryCode || detectDefaultCountryCode(),
    [myMechanic?.countryCode]
  );

  // Onboarding / Company Profile Form State
  const [displayName, setDisplayName] = useState(
    myMechanic?.displayName || `${userProfile.displayName} Auto Group`
  );
  const [teamMemberNames, setTeamMemberNames] = useState<string[]>(() =>
    normalizeInitialMembers(myMechanic?.teamMemberNames, userProfile.displayName)
  );
  const [specialty, setSpecialty] = useState(
    myMechanic?.specialty || 'Engine, Battery & Tire Recovery'
  );
  const [avatarUrl, setAvatarUrl] = useState<string>(
    myMechanic?.avatarUrl || MECHANIC_AVATARS[0]
  );
  const [countryCode, setCountryCode] = useState<string>(initialCountry);
  const [acceptedPaymentMethods, setAcceptedPaymentMethods] = useState<CustomerPaymentMethod[]>(
    () =>
      myMechanic?.acceptedPaymentMethods?.length
        ? myMechanic.acceptedPaymentMethods
        : getCountryPaymentProfile(initialCountry).recommendedMethods
  );
  const [qrLabel, setQrLabel] = useState(
    myMechanic?.qrPaymentLabel ||
      `@${userProfile.displayName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'workshop'}`
  );
  const [qrUri, setQrUri] = useState(
    myMechanic?.qrPaymentUri || `https://pay.wrenchbid.app/${uid.slice(0, 10)}`
  );
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSavedNotice, setProfileSavedNotice] = useState<string | null>(null);

  // Bid Composer State per request
  const [bidDrafts, setBidDrafts] = useState<
    Record<string, { amount: string; eta: string; note: string }>
  >({});
  const [submittingBidFor, setSubmittingBidFor] = useState<string | null>(null);

  // Per-job Unique Payment QR Generator State
  const [customJobHandles, setCustomJobHandles] = useState<Record<string, string>>({});
  const [generatingQrFor, setGeneratingQrFor] = useState<string | null>(null);
  const [qrGeneratedNotice, setQrGeneratedNotice] = useState<Record<string, string>>({});

  // Live Crew GPS State
  const [mechLocation, setMechLocation] = useState<LiveGeoPosition | null>(null);
  const [mechGpsTracking, setMechGpsTracking] = useState(false);
  const [mechGpsError, setMechGpsError] = useState<string | null>(null);

  useEffect(() => {
    if (!myMechanic) return;
    setDisplayName(myMechanic.displayName);
    setTeamMemberNames(
      normalizeInitialMembers(myMechanic.teamMemberNames, userProfile.displayName)
    );
    setSpecialty(myMechanic.specialty);
    if (myMechanic.avatarUrl) setAvatarUrl(myMechanic.avatarUrl);
    if (myMechanic.countryCode) setCountryCode(myMechanic.countryCode);
    if (myMechanic.acceptedPaymentMethods?.length) {
      setAcceptedPaymentMethods(myMechanic.acceptedPaymentMethods);
    }
    setQrLabel(myMechanic.qrPaymentLabel);
    setQrUri(myMechanic.qrPaymentUri);
  }, [myMechanic, userProfile.displayName]);

  // Watch mechanic crew GPS in real time & sync when moved significantly
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setMechGpsError('Browser geolocation unavailable — crew uses saved dispatch coordinates.');
      return;
    }

    setMechGpsTracking(true);
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const liveLat = Number(pos.coords.latitude.toFixed(5));
        const liveLng = Number(pos.coords.longitude.toFixed(5));
        setMechLocation({
          lat: liveLat,
          lng: liveLng,
          accuracy: pos.coords.accuracy,
        });
        setMechGpsError(null);
        setMechGpsTracking(true);
      },
      () => {
        setMechGpsTracking(false);
        setMechGpsError('Enable location permission to broadcast your crew position on the map.');
      },
      {
        enableHighAccuracy: true,
        maximumAge: 15000,
        timeout: 15000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Auto-sync mechanic GPS coordinates to Firestore when online & moved > ~250m
  useEffect(() => {
    if (!myMechanic || !mechLocation || !myMechanic.isOnline) return;
    const moved = haversineKm(myMechanic.lat, myMechanic.lng, mechLocation.lat, mechLocation.lng);
    if (moved < 0.25) return;

    void updateDoc(doc(db, 'mechanics', uid), {
      lat: mechLocation.lat,
      lng: mechLocation.lng,
      updatedAt: serverTimestamp(),
    }).catch((err) => handleFirestoreError(err, OperationType.UPDATE, `mechanics/${uid}`));
  }, [myMechanic, mechLocation, uid]);

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

  // Requests assigned to this mechanic company
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

  const mechCountryProfile = getCountryPaymentProfile(countryCode);
  const primaryPaymentMethod: CustomerPaymentMethod =
    acceptedPaymentMethods[0] || mechCountryProfile.defaultMethod;
  const primaryMethodDetail = getCountryMethodDetail(countryCode, primaryPaymentMethod);

  const hasValidIdentity = Boolean(
    identityVerification && identityVerification.status !== 'rejected'
  );
  const hasCrewOf3Plus = Boolean(
    myMechanic &&
      (myMechanic.teamMemberCount ?? 0) >= MIN_MECHANIC_TEAM_SIZE &&
      (myMechanic.teamMemberNames?.length ?? 0) >= MIN_MECHANIC_TEAM_SIZE
  );
  const isSubValid = isMechanicSubscriptionValid(myMechanic);
  const canBid = isSubValid && hasValidIdentity && hasCrewOf3Plus;

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

  const handleCountryChange = (nextCode: string) => {
    setCountryCode(nextCode);
    if (!myMechanic) {
      setAcceptedPaymentMethods(getCountryPaymentProfile(nextCode).recommendedMethods);
    }
  };

  const toggleAcceptedMethod = (method: CustomerPaymentMethod) => {
    setAcceptedPaymentMethods((prev) => {
      if (prev.includes(method)) {
        if (prev.length === 1) return prev;
        return prev.filter((m) => m !== method);
      }
      if (prev.length >= 8) return prev;
      return [...prev, method];
    });
  };

  const handleUpdateMember = (index: number, value: string) => {
    setTeamMemberNames((prev) => prev.map((name, i) => (i === index ? value : name)));
  };

  const handleAddMember = () => {
    if (teamMemberNames.length >= 20) return;
    setTeamMemberNames((prev) => [...prev, '']);
  };

  const handleRemoveMember = (index: number) => {
    if (teamMemberNames.length <= MIN_MECHANIC_TEAM_SIZE) return;
    setTeamMemberNames((prev) => prev.filter((_, i) => i !== index));
  };

  const handleActivateTrialProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setProfileSavedNotice(null);

    const cleanName = displayName.trim().slice(0, LIMITS.mechanicNameMax);
    const cleanMembers = teamMemberNames
      .map((n) => n.trim().slice(0, LIMITS.teamMemberNameMax))
      .filter((n) => n.length >= LIMITS.teamMemberNameMin)
      .slice(0, 20);
    const cleanSpec = specialty.trim().slice(0, LIMITS.specialtyMax);
    const cleanLabel = qrLabel.trim().slice(0, LIMITS.qrLabelMax);
    const cleanUri = qrUri.trim().slice(0, LIMITS.qrUriMax);
    const cleanAccepted: CustomerPaymentMethod[] =
      acceptedPaymentMethods.length > 0
        ? acceptedPaymentMethods.slice(0, 8)
        : [mechCountryProfile.defaultMethod];

    if (cleanName.length < LIMITS.mechanicNameMin) {
      setProfileError('Enter your Mechanic Company or Workshop Name (min 2 characters).');
      return;
    }
    if (cleanMembers.length < MIN_MECHANIC_TEAM_SIZE) {
      setProfileError(
        `Mechanics must join as a group of ${MIN_MECHANIC_TEAM_SIZE}+ technicians. Enter at least ${MIN_MECHANIC_TEAM_SIZE} full technician names.`
      );
      return;
    }
    if (cleanSpec.length < LIMITS.specialtyMin) {
      setProfileError('Describe your workshop specialty.');
      return;
    }
    if (cleanLabel.length < LIMITS.qrLabelMin || cleanUri.length < LIMITS.qrUriMin) {
      setProfileError('Enter a valid customer payment handle and payment QR/URI.');
      return;
    }
    if (!myMechanic && !hasValidIdentity) {
      setProfileError(
        'Upload or take a photo of your original National ID or Passport above before setting up your mechanic group.'
      );
      return;
    }

    setSavingProfile(true);
    const mechPath = `mechanics/${uid}`;

    try {
      if (!myMechanic) {
        const trialEndsAtMs = Date.now() + TRIAL_DURATION_MS;
        await setDoc(doc(db, 'mechanics', uid), {
          uid,
          displayName: cleanName,
          teamMemberCount: cleanMembers.length,
          teamMemberNames: cleanMembers,
          specialty: cleanSpec,
          avatarUrl,
          rating: 5,
          ratingCount: 0,
          ratingSum: 0,
          completedJobs: 0,
          lat: mechLocation?.lat ?? 37.7749,
          lng: mechLocation?.lng ?? -122.4194,
          isOnline: true,
          qrPaymentUri: cleanUri,
          qrPaymentLabel: cleanLabel,
          acceptedPaymentMethods: cleanAccepted,
          countryCode: mechCountryProfile.code,
          identityVerificationStatus:
            identityVerification?.status === 'pending_review' ? 'pending_review' : 'unverified',
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
          teamMemberCount: cleanMembers.length,
          teamMemberNames: cleanMembers,
          specialty: cleanSpec,
          avatarUrl,
          qrPaymentUri: cleanUri,
          qrPaymentLabel: cleanLabel,
          acceptedPaymentMethods: cleanAccepted,
          countryCode: mechCountryProfile.code,
          updatedAt: serverTimestamp(),
        });
        setProfileSavedNotice(
          `Company profile (${cleanMembers.length} technicians), country payment settings, and QR details saved.`
        );
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
      : Math.max(
          LIMITS.offerMin,
          Math.min(LIMITS.offerMax, Number(draft.amount) || req.offerPriceUsd)
        );
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

  const handleSyncCrewGps = () => {
    if (!navigator.geolocation) {
      setMechGpsError('Browser geolocation is unavailable on this device.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const liveLat = Number(pos.coords.latitude.toFixed(5));
        const liveLng = Number(pos.coords.longitude.toFixed(5));
        setMechLocation({
          lat: liveLat,
          lng: liveLng,
          accuracy: pos.coords.accuracy,
        });
        setMechGpsError(null);
        setMechGpsTracking(true);
        if (myMechanic) {
          void updateDoc(doc(db, 'mechanics', uid), {
            lat: liveLat,
            lng: liveLng,
            updatedAt: serverTimestamp(),
          }).catch((err) => handleFirestoreError(err, OperationType.UPDATE, `mechanics/${uid}`));
        }
      },
      () => {
        setMechGpsError('Location permission denied — unable to read crew GPS.');
      }
    );
  };

  const handleWithdrawBid = async (requestId: string, bidId: string) => {
    try {
      await updateDoc(doc(db, 'requests', requestId, 'bids', bidId), {
        status: 'withdrawn',
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `requests/${requestId}/bids/${bidId}`);
    }
  };

  const handleGenerateUniqueJobQr = async (job: BreakdownRequest) => {
    if (!myMechanic || generatingQrFor === job.id) return;
    setGeneratingQrFor(job.id);
    const invoiceNonce = Math.random().toString(36).slice(2, 6).toUpperCase() || 'A1';
    const { qrUri: uniqueUri, qrLabel: uniqueLabel, invoiceRef } = buildUniqueJobPaymentQr({
      job,
      mechanic: myMechanic,
      customHandle: customJobHandles[job.id],
      invoiceNonce,
    });

    try {
      await updateDoc(doc(db, 'requests', job.id), {
        qrPaymentUri: uniqueUri,
        qrPaymentLabel: uniqueLabel,
        updatedAt: serverTimestamp(),
      });
      setQrGeneratedNotice((prev) => ({
        ...prev,
        [job.id]: `Unique job QR (${invoiceRef}) generated with ${job.motoristName}'s payment details and synced to checkout.`,
      }));
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `requests/${job.id}`);
    } finally {
      setGeneratingQrFor(null);
    }
  };

  const renderCompanyAndPaymentFields = (isOnboarding: boolean) => {
    const validMemberCount = teamMemberNames.filter(
      (n) => n.trim().length >= LIMITS.teamMemberNameMin
    ).length;

    return (
      <div className="space-y-5">
        {/* Company / Workshop Name & Specialty */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor={isOnboarding ? 'mech-name' : 'edit-mech-name'}
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Company / Workshop Name
            </label>
            <input
              id={isOnboarding ? 'mech-name' : 'edit-mech-name'}
              type="text"
              required
              minLength={LIMITS.mechanicNameMin}
              maxLength={LIMITS.mechanicNameMax}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Apex Mobile Mechanics"
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm text-slate-900"
            />
          </div>

          <div>
            <label
              htmlFor={isOnboarding ? 'mech-spec' : 'edit-mech-spec'}
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Workshop Specialty
            </label>
            <input
              id={isOnboarding ? 'mech-spec' : 'edit-mech-spec'}
              type="text"
              required
              minLength={LIMITS.specialtyMin}
              maxLength={LIMITS.specialtyMax}
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm text-slate-900"
            />
          </div>
        </div>

        {/* Required 3+ Technicians Company Roster */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-orange-600" />
              <span className="text-xs font-bold text-slate-900">
                Mechanic Company Crew (Minimum {MIN_MECHANIC_TEAM_SIZE} Technicians Required)
              </span>
            </div>
            <span
              className={`text-xs font-semibold tabular-nums ${
                validMemberCount >= MIN_MECHANIC_TEAM_SIZE
                  ? 'text-emerald-700'
                  : 'text-amber-700'
              }`}
            >
              {validMemberCount} / {MIN_MECHANIC_TEAM_SIZE}+ ready
            </span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Solo mechanics cannot join individually. List at least 3 technicians on your roadside dispatch team.
          </p>

          <div className="space-y-2">
            {teamMemberNames.map((member, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="w-6 text-xs font-mono text-slate-500 tabular-nums shrink-0">
                  #{index + 1}
                </span>
                <input
                  type="text"
                  required={index < MIN_MECHANIC_TEAM_SIZE}
                  minLength={LIMITS.teamMemberNameMin}
                  maxLength={LIMITS.teamMemberNameMax}
                  value={member}
                  onChange={(e) => handleUpdateMember(index, e.target.value)}
                  placeholder={
                    index === 0
                      ? 'Lead Technician / Representative Full Name'
                      : `Technician #${index + 1} Full Name`
                  }
                  className="flex-1 min-h-[42px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900"
                />
                {teamMemberNames.length > MIN_MECHANIC_TEAM_SIZE && (
                  <button
                    type="button"
                    onClick={() => handleRemoveMember(index)}
                    aria-label={`Remove technician ${index + 1}`}
                    className="min-w-[40px] min-h-[40px] rounded-xl border border-slate-200 bg-white hover:bg-red-50 text-slate-500 hover:text-red-600 flex items-center justify-center shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {teamMemberNames.length < 20 && (
            <button
              type="button"
              onClick={handleAddMember}
              className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5 text-orange-600" />
              Add Another Technician
            </button>
          )}
        </div>

        {/* Operating Country & Local Payment Adaptation */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                <Globe className="w-4 h-4 text-orange-600" />
                <span>Operating Country &amp; Local Payout Rails</span>
              </div>
              <p className="text-[11px] text-slate-600">
                {mechCountryProfile.localNoteBanner}
              </p>
            </div>
            <select
              aria-label="Workshop operating country"
              value={countryCode}
              onChange={(e) => handleCountryChange(e.target.value)}
              className="min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-900 shrink-0"
            >
              {COUNTRY_PAYMENT_PROFILES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name} ({c.currencyCode})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-800">
              Accepted Customer Payment Methods ({acceptedPaymentMethods.length} selected)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {CUSTOMER_PAYMENT_METHODS.map((pm) => {
                const active = acceptedPaymentMethods.includes(pm.id);
                const detail = getCountryMethodDetail(countryCode, pm.id);
                return (
                  <button
                    key={pm.id}
                    type="button"
                    onClick={() => toggleAcceptedMethod(pm.id)}
                    className={`min-h-[50px] px-3 py-2 rounded-xl border text-left transition-colors ${
                      active
                        ? 'border-orange-600 bg-white text-slate-900 ring-1 ring-orange-200'
                        : 'border-slate-200 bg-white/70 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold">{detail.localLabel}</span>
                      <span className="text-[11px] font-semibold text-orange-700">
                        {active ? 'Accepted' : 'Add'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">{detail.localHint}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Country-Adapted QR Handle & URI */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div>
              <label
                htmlFor={isOnboarding ? 'mech-qr-label' : 'edit-mech-qr-label'}
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                {primaryMethodDetail.mechanicHandleLabel}
              </label>
              <input
                id={isOnboarding ? 'mech-qr-label' : 'edit-mech-qr-label'}
                type="text"
                required
                minLength={LIMITS.qrLabelMin}
                maxLength={LIMITS.qrLabelMax}
                value={qrLabel}
                onChange={(e) => setQrLabel(e.target.value)}
                placeholder={primaryMethodDetail.mechanicHandlePlaceholder}
                className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-sm text-slate-900"
              />
            </div>

            <div>
              <label
                htmlFor={isOnboarding ? 'mech-qr-uri' : 'edit-mech-qr-uri'}
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                {primaryMethodDetail.mechanicUriLabel}
              </label>
              <input
                id={isOnboarding ? 'mech-qr-uri' : 'edit-mech-qr-uri'}
                type="text"
                required
                minLength={LIMITS.qrUriMin}
                maxLength={LIMITS.qrUriMax}
                value={qrUri}
                onChange={(e) => setQrUri(e.target.value)}
                placeholder={primaryMethodDetail.mechanicUriPlaceholder}
                className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-xs font-mono text-slate-900"
              />
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Mechanic Company Onboarding Screen (First-time setup with 3+ crew, ID/Passport check, & 7-day free trial)
  if (!myMechanic) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <IdentityVerificationCard
          mode="workspace"
          role="mechanic"
          uid={uid}
          defaultFullName={userProfile.displayName}
          defaultCountryName={mechCountryProfile.name}
          verification={identityVerification}
        />

        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="space-y-2 border-b border-slate-100 pb-5">
            <div className="text-xs font-semibold text-orange-700">
              Mechanic Company Onboarding · Minimum {MIN_MECHANIC_TEAM_SIZE} Mechanics · 7-Day Free Trial
            </div>
            <h2 className="font-display text-2xl font-bold text-slate-900">
              Register Your Mechanic Company &amp; Global Payout Card
            </h2>
            <p className="text-sm text-slate-600">
              Mechanics join as a registered company of 3 or more technicians. Start your free 7-day trial immediately—motorist payments go directly to your workshop across global rails.
            </p>
          </div>

          <form onSubmit={(e) => void handleActivateTrialProfile(e)} className="space-y-5">
            {renderCompanyAndPaymentFields(true)}

            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-700">Select Company Portrait</div>
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
                    <img
                      src={av}
                      alt="Mechanic company avatar option"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>

            {profileError && (
              <div className="text-xs font-medium text-red-800 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{profileError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={savingProfile || !hasValidIdentity}
              className="w-full min-h-[48px] rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
            >
              {savingProfile
                ? 'Registering Mechanic Company...'
                : !hasValidIdentity
                ? 'Complete Original ID / Passport Upload Above First'
                : 'Register 3+ Mechanic Company & Start 7-Day Free Trial'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Mechanic Company Status Bar + Sub-Navigation Tabs */}
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
            <div className="text-xs text-slate-600 truncate">
              {myMechanic.specialty}
              {` · ${myMechanic.teamMemberCount ?? 1}-tech crew`}
            </div>
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
              <span aria-hidden="true">·</span>
              <span className="text-slate-700 font-medium">
                {getCountryPaymentProfile(myMechanic.countryCode).name}
              </span>
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
              Company &amp; Billing
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
        /* Integrated Company Roster, ID Verification, Global Payments & Billing View */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: ID Check + Company Roster & Global Payout Setup */}
          <div className="lg:col-span-5 space-y-6">
            <IdentityVerificationCard
              mode="workspace"
              role="mechanic"
              uid={uid}
              defaultFullName={userProfile.displayName}
              defaultCountryName={mechCountryProfile.name}
              verification={identityVerification}
            />

            <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <UserCheck className="w-4 h-4 text-orange-600" />
                <h3 className="font-display text-lg font-bold text-slate-900">
                  Company Crew &amp; Payout Settings
                </h3>
              </div>

              <form onSubmit={(e) => void handleActivateTrialProfile(e)} className="space-y-4">
                {renderCompanyAndPaymentFields(false)}

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
                        <img
                          src={av}
                          alt="Avatar"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                </div>

                {profileError && (
                  <div className="text-xs font-medium text-red-800 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                    <span>{profileError}</span>
                  </div>
                )}

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
                  {savingProfile ? 'Saving Company Settings...' : 'Save Company, Crew & Payout Settings'}
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

          {/* Right Column: 30-Day Earnings Chart & Integrated Billing Management */}
          <div className="lg:col-span-7 space-y-6">
            <MechanicEarningsChart
              assignedRequests={assignedRequests}
              countryProfile={getCountryPaymentProfile(myMechanic.countryCode || countryCode)}
              onJumpToDispatch={() => setActiveTab('dispatch')}
            />
            <SubscriptionPanel
              mechanic={myMechanic}
              defaultCountryCode={myMechanic.countryCode || countryCode}
            />
          </div>
        </div>
      ) : (
        /* Live Dispatch Feed + Active Repairs */
        <div className="space-y-6">
          {/* Compliance / Trial / ID Gates */}
          {!hasCrewOf3Plus && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <Building2 className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-bold text-amber-950">
                    3+ Mechanic Company Roster Required
                  </div>
                  <p className="text-xs text-amber-900 mt-0.5">
                    Add at least {MIN_MECHANIC_TEAM_SIZE} technicians in Company &amp; Billing before bidding on breakdown jobs.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('profile_billing')}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-amber-900 hover:bg-amber-950 text-white text-xs font-semibold whitespace-nowrap shrink-0"
              >
                Add 3+ Technicians
              </button>
            </div>
          )}

          {!hasValidIdentity && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-bold text-amber-950">
                    Original ID or Passport Verification Needed
                  </div>
                  <p className="text-xs text-amber-900 mt-0.5">
                    Submit a photo of your original National ID or Passport in Company &amp; Billing for verification and background check before bidding.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('profile_billing')}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold whitespace-nowrap shrink-0"
              >
                Upload Original ID / Passport
              </button>
            </div>
          )}

          {!isSubValid ? (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-bold text-red-900">
                    7-Day Free Trial Expired — Bidding Paused
                  </div>
                  <p className="text-xs text-red-800 mt-0.5">
                    Activate your $4.00/month plan in Company &amp; Billing to submit new bids on motorist breakdowns.
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
                Open Company &amp; Billing
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-5 space-y-6">
              <RoadsideMap
                centerLat={mechLocation?.lat ?? myMechanic.lat}
                centerLng={mechLocation?.lng ?? myMechanic.lng}
                mechanics={mechanics}
                requests={openRequests}
                userLocation={mechLocation}
                routeTo={
                  activeJobs[0]
                    ? {
                        lat: activeJobs[0].lat,
                        lng: activeJobs[0].lng,
                        label: `${activeJobs[0].motoristName} (${activeJobs[0].vehicleMakeModel})`,
                      }
                    : null
                }
                gpsTracking={mechGpsTracking}
                gpsError={mechGpsError}
                onRequestCenterOnUser={handleSyncCrewGps}
                activeLabel="Crew Live Dispatch"
              />

              {/* Active Assigned Repairs */}
              {activeJobs.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                  <h3 className="font-display text-lg font-bold text-slate-900">
                    Active Assigned Repairs ({activeJobs.length})
                  </h3>

                  <div className="space-y-4">
                    {activeJobs.map((job) => {
                      const jobCountry = getCountryPaymentProfile(
                        job.countryCode || myMechanic.countryCode
                      );
                      const jobMethod = job.paymentMethod || jobCountry.defaultMethod;
                      const jobPayDetail = getCountryMethodDetail(jobCountry.code, jobMethod);
                      const jobMeta = getCustomerPaymentMethodMeta(jobMethod);
                      const agreedUsd = job.agreedPriceUsd ?? job.offerPriceUsd;
                      const syncedInvoiceRef = extractQrInvoiceRef(job.qrPaymentUri);
                      const localAmountText =
                        jobCountry.currencyCode !== 'USD'
                          ? formatLocalCurrencyApprox(agreedUsd, jobCountry)
                          : undefined;
                      const activeQrUri = job.qrPaymentUri || myMechanic.qrPaymentUri;
                      const activeQrLabel = job.qrPaymentLabel || myMechanic.qrPaymentLabel;
                      const jobDistKm = haversineKm(
                        mechLocation?.lat ?? myMechanic.lat,
                        mechLocation?.lng ?? myMechanic.lng,
                        job.lat,
                        job.lng
                      );
                      const jobGmapsUrl = buildGoogleMapsLink(
                        job.lat,
                        job.lng,
                        mechLocation ?? { lat: myMechanic.lat, lng: myMechanic.lng }
                      );

                      return (
                        <div key={job.id} className="border border-slate-200 rounded-xl p-4 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-bold text-slate-900">
                                {job.vehicleMakeModel}
                              </div>
                              <div className="text-xs text-slate-600">
                                {job.motoristName} · {job.locationLabel} · {formatDistance(jobDistKm)}
                              </div>
                              <a
                                href={jobGmapsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:underline mt-0.5"
                              >
                                <ExternalLink className="w-3 h-3" />
                                Navigate in Google Maps (~{estimateDriveMinutes(jobDistKm)} min)
                              </a>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="font-display text-lg font-bold text-emerald-700 tabular-nums">
                                ${agreedUsd}
                              </div>
                              {localAmountText && (
                                <div className="text-[11px] text-slate-500 tabular-nums">
                                  {localAmountText}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="text-xs text-slate-500 flex flex-wrap items-center gap-1.5">
                            <span>
                              Status: <strong className="text-slate-900">{job.status.replace('_', ' ')}</strong>
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {jobCountry.name} · Customer pays via{' '}
                              <strong className="text-slate-900">
                                {jobPayDetail.localLabel}
                              </strong>
                            </span>
                          </div>

                          {job.paymentDetailNote && (
                            <div className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                              Motorist shared payment detail: <strong>{job.paymentDetailNote}</strong>
                            </div>
                          )}

                          {/* Unique Job-Specific Payment QR Generator */}
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                                <QrCode className="w-4 h-4 text-orange-600 shrink-0" />
                                <span>Job-Specific Payment QR Generator</span>
                              </div>
                              {syncedInvoiceRef && (
                                <span className="text-[11px] font-mono font-semibold text-emerald-700">
                                  Ref: {syncedInvoiceRef}
                                </span>
                              )}
                            </div>

                            <div className="text-[11px] text-slate-600 leading-relaxed">
                              Encodes <strong className="text-slate-800">{jobPayDetail.localLabel}</strong> ({jobCountry.name} ·{' '}
                              {localAmountText || `$${agreedUsd.toFixed(2)} USD`})
                              {job.paymentDetailNote
                                ? ` and "${job.paymentDetailNote}"`
                                : ''}
                              {' '}into a unique invoice QR for this job and syncs it to {job.motoristName}&apos;s checkout.
                            </div>

                            <div className="flex flex-col sm:flex-row gap-2">
                              <input
                                type="text"
                                aria-label={`Custom payout handle for ${job.vehicleMakeModel}`}
                                maxLength={40}
                                value={customJobHandles[job.id] ?? ''}
                                onChange={(e) =>
                                  setCustomJobHandles((prev) => ({
                                    ...prev,
                                    [job.id]: e.target.value,
                                  }))
                                }
                                placeholder={`Handle (default: ${myMechanic.qrPaymentLabel})`}
                                className="flex-1 min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs text-slate-900"
                              />
                              <button
                                type="button"
                                disabled={generatingQrFor === job.id}
                                onClick={() => void handleGenerateUniqueJobQr(job)}
                                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                              >
                                {syncedInvoiceRef ? (
                                  <RefreshCw className="w-3.5 h-3.5 text-orange-400" />
                                ) : (
                                  <QrCode className="w-3.5 h-3.5 text-orange-400" />
                                )}
                                <span>
                                  {generatingQrFor === job.id
                                    ? 'Generating QR...'
                                    : syncedInvoiceRef
                                    ? 'Regenerate Job QR'
                                    : 'Generate Unique Job QR'}
                                </span>
                              </button>
                            </div>

                            {qrGeneratedNotice[job.id] && (
                              <div className="text-[11px] font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-2 flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                <span>{qrGeneratedNotice[job.id]}</span>
                              </div>
                            )}
                          </div>

                          {/* Show Live Unique Job QR Card immediately once generated (or during payment_pending) */}
                          {(syncedInvoiceRef || job.status === 'payment_pending') && (
                            <div className="space-y-3">
                              {job.status === 'payment_pending' && (
                                jobMethod === 'cash' ? (
                                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-700">
                                    Customer selected <strong className="text-slate-900">{jobPayDetail.localLabel}</strong> on site ($
                                    {agreedUsd.toFixed(2)} USD
                                    {localAmountText ? ` · ${localAmountText}` : ''}
                                    ). Waiting for customer confirmation.
                                  </div>
                                ) : (
                                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-700">
                                    <strong>{jobPayDetail.localLabel}:</strong> {jobPayDetail.checkoutInstructions}
                                  </div>
                                )
                              )}
                              <MechanicQRCard
                                mechanicName={myMechanic.displayName}
                                qrLabel={activeQrLabel}
                                qrUri={activeQrUri}
                                amountUsd={agreedUsd}
                                localAmountText={localAmountText}
                                paymentMethodLabel={jobPayDetail.localLabel}
                                motoristPaymentNote={job.paymentDetailNote}
                                invoiceRef={syncedInvoiceRef}
                              />
                            </div>
                          )}

                          {job.status === 'accepted' && (
                            <button
                              type="button"
                              onClick={() => void handleAdvanceJob(job, 'arrived')}
                              className="w-full min-h-[42px] rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
                            >
                              Mark Crew Arrived at Scene
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
                              {jobMethod === 'cash'
                                ? 'Repair Done — Collect Cash Payment'
                                : !jobMeta.usesQrSettlement
                                ? 'Repair Done — Share Bank / Company Details'
                                : `Repair Done — Show ${jobPayDetail.localLabel} QR`}
                            </button>
                          )}
                        </div>
                      );
                    })}
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
                    Keep your company Online—new motorist offers appear here in real time.
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
                    const reqCountry = getCountryPaymentProfile(req.countryCode);
                    const reqMethod = req.paymentMethod || reqCountry.defaultMethod;
                    const reqPayDetail = getCountryMethodDetail(req.countryCode, reqMethod);
                    const reqDistKm = haversineKm(
                      mechLocation?.lat ?? myMechanic.lat,
                      mechLocation?.lng ?? myMechanic.lng,
                      req.lat,
                      req.lng
                    );
                    const isPendingBid = existingBid?.status === 'pending';

                    return (
                      <div
                        key={req.id}
                        className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="space-y-1">
                            <div className="text-xs text-slate-500 tabular-nums">
                              {catLabel} · {req.locationLabel} · {formatDistance(reqDistKm)} (~{estimateDriveMinutes(reqDistKm)} min) · {reqCountry.name}
                            </div>
                            <h4 className="font-display text-lg font-bold text-slate-900">
                              {req.vehicleMakeModel}
                            </h4>
                            <p className="text-sm text-slate-600">{req.issueNotes}</p>
                            <div className="text-xs text-slate-500">
                              Motorist: {req.motoristName} · Shared payment:{' '}
                              <span className="font-semibold text-slate-900">
                                {reqPayDetail.localLabel}
                              </span>
                              {req.paymentDetailNote ? ` (${req.paymentDetailNote})` : ''}
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-xs text-slate-500">Motorist Fare Offer</div>
                            <div className="font-display text-2xl font-bold text-orange-600 tabular-nums">
                              ${req.offerPriceUsd}
                            </div>
                            {reqCountry.currencyCode !== 'USD' && (
                              <div className="text-[11px] text-slate-500 tabular-nums">
                                {formatLocalCurrencyApprox(req.offerPriceUsd, reqCountry)}
                              </div>
                            )}
                          </div>
                        </div>

                        {existingBid && existingBid.status !== 'withdrawn' ? (
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                            <div>
                              <span className="font-semibold text-slate-900">
                                Your offer: ${existingBid.bidAmountUsd}
                              </span>{' '}
                              <span className="text-slate-600 tabular-nums">
                                · ETA {existingBid.etaMinutes} min · Status: {existingBid.status}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-emerald-700 font-semibold">
                                {isPendingBid ? 'Waiting for motorist' : existingBid.status}
                              </span>
                              {isPendingBid && (
                                <button
                                  type="button"
                                  onClick={() => void handleWithdrawBid(req.id, existingBid.id)}
                                  className="min-h-[34px] px-3 py-1 rounded-lg border border-slate-300 bg-white hover:bg-red-50 text-xs font-semibold text-slate-700 hover:text-red-700"
                                >
                                  Withdraw
                                </button>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="border-t border-slate-100 pt-4 space-y-3">
                            {/* inDrive Quick Counter-Offer & ETA Chips */}
                            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-semibold text-slate-600">Quick fare:</span>
                                {[0, 10, 20, 35].map((delta) => {
                                  const target = Math.min(LIMITS.offerMax, req.offerPriceUsd + delta);
                                  return (
                                    <button
                                      key={delta}
                                      type="button"
                                      onClick={() =>
                                        setBidDrafts((prev) => ({
                                          ...prev,
                                          [req.id]: { ...draft, amount: String(target) },
                                        }))
                                      }
                                      className={`min-h-[32px] px-2.5 py-1 rounded-lg border font-semibold tabular-nums transition-colors ${
                                        Number(draft.amount) === target
                                          ? 'bg-slate-900 text-white border-slate-900'
                                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300'
                                      }`}
                                    >
                                      {delta === 0 ? `$${target} (Match)` : `+$${delta} ($${target})`}
                                    </button>
                                  );
                                })}
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="font-semibold text-slate-600 mr-0.5">ETA:</span>
                                {['10', '15', '25', '40'].map((mins) => (
                                  <button
                                    key={mins}
                                    type="button"
                                    onClick={() =>
                                      setBidDrafts((prev) => ({
                                        ...prev,
                                        [req.id]: { ...draft, eta: mins },
                                      }))
                                    }
                                    className={`min-h-[32px] px-2 py-1 rounded-lg border font-semibold tabular-nums transition-colors ${
                                      draft.eta === mins
                                        ? 'bg-slate-900 text-white border-slate-900'
                                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300'
                                    }`}
                                  >
                                    {mins}m
                                  </button>
                                ))}
                              </div>
                            </div>

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
                                  placeholder="Crew & tools ready in van"
                                  className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-300 text-sm"
                                />
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={!canBid || submittingBidFor === req.id}
                                onClick={() => void handleSubmitBid(req, true)}
                                className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Accept ${req.offerPriceUsd} Fare
                              </button>
                              <button
                                type="button"
                                disabled={!canBid || submittingBidFor === req.id}
                                onClick={() => void handleSubmitBid(req, false)}
                                className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                              >
                                <Send className="w-3.5 h-3.5" />
                                Send Counter (${draft.amount})
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

          <MechanicEarningsChart
            assignedRequests={assignedRequests}
            countryProfile={getCountryPaymentProfile(myMechanic.countryCode || countryCode)}
          />
        </div>
      )}
    </div>
  );
}
