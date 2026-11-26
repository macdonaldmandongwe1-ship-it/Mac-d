import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  Banknote,
  Bitcoin,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  ExternalLink,
  Globe2,
  Landmark,
  MapPin,
  Minus,
  Plus,
  QrCode,
  ShieldAlert,
  Smartphone,
  Star,
  Users,
  Wallet,
  Wrench,
  X,
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
  BreakdownRequest,
  CUSTOMER_PAYMENT_METHODS,
  CustomerPaymentMethod,
  ISSUE_CATEGORIES,
  IdentityVerification,
  IssueCategory,
  LIMITS,
  MECHANIC_AVATARS,
  MechanicBid,
  MechanicProfile,
  MechanicRating,
  RATING_LABELS,
  UserProfile,
  getCustomerPaymentMethodMeta,
} from '../types';
import { IdentityVerificationCard } from './IdentityVerificationCard';
import { MechanicQRCard } from './MechanicQRCard';
import {
  LiveGeoPosition,
  RoadsideMap,
  buildGoogleMapsLink,
  formatDistance,
  haversineKm,
  reverseGeocodeLabel,
} from './RoadsideMap';

interface MotoristWorkspaceProps {
  uid: string;
  userProfile: UserProfile;
  identityVerification: IdentityVerification | null;
  mechanics: MechanicProfile[];
  onSwitchToMechanic: () => void;
}

type RequestFilter = 'all' | 'active' | 'completed';

function PaymentMethodIcon({
  method,
  className,
}: {
  method: CustomerPaymentMethod;
  className?: string;
}) {
  if (method === 'cash') return <Banknote className={className} />;
  if (method === 'mobile_money') return <Smartphone className={className} />;
  if (method === 'card') return <CreditCard className={className} />;
  if (method === 'bank_transfer') return <Landmark className={className} />;
  if (method === 'upi' || method === 'pix') return <QrCode className={className} />;
  if (method === 'crypto') return <Bitcoin className={className} />;
  return <Wallet className={className} />;
}

export function MotoristWorkspace({
  uid,
  userProfile,
  identityVerification,
  mechanics,
  onSwitchToMechanic,
}: MotoristWorkspaceProps) {
  const [myRequests, setMyRequests] = useState<BreakdownRequest[]>([]);
  const [bidsByRequest, setBidsByRequest] = useState<Record<string, MechanicBid[]>>({});
  const [ratingsByRequest, setRatingsByRequest] = useState<Record<string, MechanicRating>>({});
  const [requestFilter, setRequestFilter] = useState<RequestFilter>('all');

  // Post-repair rating draft state per completed request
  const [starDraftByRequest, setStarDraftByRequest] = useState<Record<string, number>>({});
  const [hoverStarByRequest, setHoverStarByRequest] = useState<Record<string, number>>({});
  const [commentDraftByRequest, setCommentDraftByRequest] = useState<Record<string, string>>({});
  const [submittingRatingFor, setSubmittingRatingFor] = useState<string | null>(null);
  const [ratingErrorByRequest, setRatingErrorByRequest] = useState<Record<string, string>>({});
  const [justPaidRequestId, setJustPaidRequestId] = useState<string | null>(null);
  const [justRatedRequestId, setJustRatedRequestId] = useState<string | null>(null);

  // Country & Global Payment State
  const initialCountryCode = useMemo(() => detectDefaultCountryCode(), []);
  const initialCountry = useMemo(
    () => getCountryPaymentProfile(initialCountryCode),
    [initialCountryCode]
  );

  // Request Form State
  const [vehicleMakeModel, setVehicleMakeModel] = useState(
    userProfile.vehicleSummary || '2020 Toyota Corolla'
  );
  const [issueCategory, setIssueCategory] = useState<IssueCategory>('tire');
  const [issueNotes, setIssueNotes] = useState('');
  const [locationLabel, setLocationLabel] = useState('Main Highway Shoulder');
  const [lat, setLat] = useState(37.7749);
  const [lng, setLng] = useState(-122.4194);
  const [offerPriceUsd, setOfferPriceUsd] = useState('55');
  const [countryCode, setCountryCode] = useState<string>(initialCountry.code);
  const [paymentMethod, setPaymentMethod] = useState<CustomerPaymentMethod>(
    initialCountry.defaultMethod
  );
  const [paymentDetailNote, setPaymentDetailNote] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  // Live GPS Tracking State
  const [userLocation, setUserLocation] = useState<LiveGeoPosition | null>(null);
  const [gpsTracking, setGpsTracking] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const manualPinSetRef = useRef(false);
  const didReverseGeocodeRef = useRef(false);

  const countryProfile = useMemo(() => getCountryPaymentProfile(countryCode), [countryCode]);
  const orderedMethods = useMemo(() => {
    const recSet = new Set(countryProfile.recommendedMethods);
    const recommended = CUSTOMER_PAYMENT_METHODS.filter((m) => recSet.has(m.id));
    const others = CUSTOMER_PAYMENT_METHODS.filter((m) => !recSet.has(m.id));
    return [...recommended, ...others];
  }, [countryProfile]);
  const selectedMethodDetail = useMemo(
    () => getCountryMethodDetail(countryCode, paymentMethod),
    [countryCode, paymentMethod]
  );

  const hasValidIdentity = Boolean(
    identityVerification && identityVerification.status !== 'rejected'
  );

  useEffect(() => {
    const q = query(collection(db, 'requests'), where('motoristId', '==', uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as BreakdownRequest)
          .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
        setMyRequests(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'requests')
    );
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    const activeOpen = myRequests.filter((r) => r.status === 'open');
    if (activeOpen.length === 0) return;

    const unsubs = activeOpen.map((req) => {
      const q = query(
        collection(db, 'requests', req.id, 'bids'),
        where('motoristId', '==', uid)
      );
      return onSnapshot(
        q,
        (snap) => {
          const rows = snap.docs
            .map((d) => d.data() as MechanicBid)
            .filter((b) => b.status === 'pending');
          setBidsByRequest((prev) => ({ ...prev, [req.id]: rows }));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, `requests/${req.id}/bids`)
      );
    });

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [myRequests, uid]);

  // Listen to this motorist's submitted post-repair ratings
  useEffect(() => {
    const q = query(collection(db, 'ratings'), where('motoristId', '==', uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const mapped: Record<string, MechanicRating> = {};
        snap.docs.forEach((d) => {
          const rating = d.data() as MechanicRating;
          mapped[rating.requestId] = rating;
        });
        setRatingsByRequest(mapped);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'ratings')
    );
    return () => unsub();
  }, [uid]);

  // Watch motorist GPS position in real time while workspace is active
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsError('Browser geolocation is unavailable — tap the map to place your pin.');
      return;
    }

    setGpsTracking(true);
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const liveLat = Number(pos.coords.latitude.toFixed(5));
        const liveLng = Number(pos.coords.longitude.toFixed(5));
        setUserLocation({
          lat: liveLat,
          lng: liveLng,
          accuracy: pos.coords.accuracy,
        });
        setGpsError(null);
        setGpsTracking(true);
        if (!manualPinSetRef.current) {
          setLat(liveLat);
          setLng(liveLng);
          if (!didReverseGeocodeRef.current) {
            didReverseGeocodeRef.current = true;
            void reverseGeocodeLabel(liveLat, liveLng).then((resolved) => {
              if (resolved && !manualPinSetRef.current) {
                setLocationLabel(resolved);
              }
            });
          }
        }
      },
      (err) => {
        setGpsTracking(false);
        if (err.code === err.PERMISSION_DENIED) {
          setGpsError('Location permission denied — search your area or tap the map to set your spot.');
        } else {
          setGpsError('Unable to read live GPS — search your area or tap the map.');
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 15000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  const handleCountryChange = (nextCode: string) => {
    const nextProfile = getCountryPaymentProfile(nextCode);
    setCountryCode(nextProfile.code);
    setPaymentMethod(nextProfile.defaultMethod);
  };

  const handleUseGps = () => {
    manualPinSetRef.current = false;
    if (userLocation) {
      setLat(userLocation.lat);
      setLng(userLocation.lng);
      setLocationLabel('Current GPS Location');
      setGpsError(null);
      void reverseGeocodeLabel(userLocation.lat, userLocation.lng).then((resolved) => {
        if (resolved && !manualPinSetRef.current) setLocationLabel(resolved);
      });
      return;
    }
    if (!navigator.geolocation) {
      setGpsError('Browser geolocation is unavailable — search your area or tap the map.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const liveLat = Number(pos.coords.latitude.toFixed(5));
        const liveLng = Number(pos.coords.longitude.toFixed(5));
        setUserLocation({
          lat: liveLat,
          lng: liveLng,
          accuracy: pos.coords.accuracy,
        });
        setLat(liveLat);
        setLng(liveLng);
        setLocationLabel('Current GPS Location');
        setGpsError(null);
        setGpsTracking(true);
        void reverseGeocodeLabel(liveLat, liveLng).then((resolved) => {
          if (resolved && !manualPinSetRef.current) setLocationLabel(resolved);
        });
      },
      () => {
        setGpsError('Could not access GPS — search your area or tap the map.');
      }
    );
  };

  const handlePostRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setPostError(null);

    if (!hasValidIdentity) {
      setPostError(
        'Please submit a photo of your original National ID or Passport above for verification and background check before posting a request.'
      );
      return;
    }

    const cleanVehicle = vehicleMakeModel.trim().slice(0, LIMITS.vehicleMax);
    const cleanNotes = issueNotes.trim().slice(0, LIMITS.issueNotesMax);
    const cleanLoc = locationLabel.trim().slice(0, LIMITS.locationMax);
    const cleanPayNote = paymentDetailNote.trim().slice(0, LIMITS.paymentDetailNoteMax);
    const price = Math.max(
      LIMITS.offerMin,
      Math.min(LIMITS.offerMax, Number(offerPriceUsd) || 50)
    );

    if (
      cleanVehicle.length < LIMITS.vehicleMin ||
      cleanNotes.length < LIMITS.issueNotesMin ||
      cleanLoc.length < LIMITS.locationMin
    ) {
      setPostError('Please fill in your vehicle, location, and at least 3 characters describing the issue.');
      return;
    }

    setPosting(true);
    const reqId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const payload: Record<string, unknown> = {
      id: reqId,
      motoristId: uid,
      motoristName: userProfile.displayName,
      vehicleMakeModel: cleanVehicle,
      issueCategory,
      issueNotes: cleanNotes,
      locationLabel: cleanLoc,
      lat,
      lng,
      offerPriceUsd: price,
      paymentMethod,
      countryCode,
      status: 'open',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (cleanPayNote) {
      payload.paymentDetailNote = cleanPayNote;
    }

    try {
      await setDoc(doc(db, 'requests', reqId), payload);
      setIssueNotes('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `requests/${reqId}`);
    } finally {
      setPosting(false);
    }
  };

  const handleAcceptBid = async (req: BreakdownRequest, bid: MechanicBid) => {
    const batch = writeBatch(db);
    batch.update(doc(db, 'requests', req.id, 'bids', bid.id), {
      status: 'accepted',
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'requests', req.id), {
      status: 'accepted',
      acceptedBidId: bid.id,
      acceptedMechanicId: bid.mechanicId,
      acceptedMechanicName: bid.mechanicName,
      agreedPriceUsd: bid.bidAmountUsd,
      qrPaymentUri: bid.qrPaymentUri,
      qrPaymentLabel: bid.qrPaymentLabel,
      updatedAt: serverTimestamp(),
    });
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `requests/${req.id}`);
    }
  };

  const handleDeclineBid = async (req: BreakdownRequest, bid: MechanicBid) => {
    try {
      await updateDoc(doc(db, 'requests', req.id, 'bids', bid.id), {
        status: 'rejected',
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `requests/${req.id}/bids/${bid.id}`);
    }
  };

  const handleAdjustOfferPrice = async (req: BreakdownRequest, deltaUsd: number) => {
    if (req.status !== 'open') return;
    const nextPrice = Math.max(
      LIMITS.offerMin,
      Math.min(LIMITS.offerMax, Math.round(req.offerPriceUsd + deltaUsd))
    );
    if (nextPrice === req.offerPriceUsd) return;
    try {
      await updateDoc(doc(db, 'requests', req.id), {
        offerPriceUsd: nextPrice,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `requests/${req.id}`);
    }
  };

  const handleUpdatePaymentSelection = async (
    req: BreakdownRequest,
    nextMethod: CustomerPaymentMethod,
    nextCountryCode?: string
  ) => {
    const resolvedCountry = nextCountryCode || req.countryCode || countryCode;
    if (req.paymentMethod === nextMethod && req.countryCode === resolvedCountry) return;
    try {
      await updateDoc(doc(db, 'requests', req.id), {
        paymentMethod: nextMethod,
        countryCode: resolvedCountry,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `requests/${req.id}`);
    }
  };

  const handleConfirmPayment = async (req: BreakdownRequest) => {
    const finalMethod: CustomerPaymentMethod = req.paymentMethod || 'mobile_money';
    const finalCountry = req.countryCode || countryCode;
    try {
      await updateDoc(doc(db, 'requests', req.id), {
        status: 'completed',
        paymentMethod: finalMethod,
        countryCode: finalCountry,
        paymentConfirmedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setJustPaidRequestId(req.id);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `requests/${req.id}`);
    }
  };

  const handleCancelRequest = async (req: BreakdownRequest) => {
    try {
      await updateDoc(doc(db, 'requests', req.id), {
        status: 'cancelled',
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `requests/${req.id}`);
    }
  };

  const handleSubmitRating = async (req: BreakdownRequest) => {
    const stars = starDraftByRequest[req.id] ?? 0;
    const mechanicId = req.acceptedMechanicId;
    if (stars < 1 || stars > 5 || !mechanicId || req.status !== 'completed') {
      setRatingErrorByRequest((prev) => ({
        ...prev,
        [req.id]: 'Please select a rating from 1 to 5 stars.',
      }));
      return;
    }

    if (mechanicId === uid) {
      setRatingErrorByRequest((prev) => ({
        ...prev,
        [req.id]: 'You cannot submit a rating for your own mechanic account.',
      }));
      return;
    }

    setSubmittingRatingFor(req.id);
    setRatingErrorByRequest((prev) => {
      const next = { ...prev };
      delete next[req.id];
      return next;
    });

    try {
      let mechData = mechanics.find((m) => m.uid === mechanicId);
      if (!mechData) {
        const mechSnap = await getDoc(doc(db, 'mechanics', mechanicId));
        if (mechSnap.exists()) {
          mechData = mechSnap.data() as MechanicProfile;
        }
      }

      if (!mechData) {
        setRatingErrorByRequest((prev) => ({
          ...prev,
          [req.id]: 'Mechanic profile could not be found to record this rating.',
        }));
        return;
      }

      const prevCount = typeof mechData.ratingCount === 'number' ? mechData.ratingCount : 0;
      const prevSum = typeof mechData.ratingSum === 'number' ? mechData.ratingSum : 0;
      const nextCount = prevCount + 1;
      const nextSum = prevSum + stars;
      const nextRating = Number((nextSum / nextCount).toFixed(2));

      const cleanComment = (commentDraftByRequest[req.id] || '')
        .trim()
        .slice(0, LIMITS.ratingCommentMax);

      const ratingPayload: Record<string, unknown> = {
        id: req.id,
        requestId: req.id,
        motoristId: uid,
        motoristName: userProfile.displayName.slice(0, LIMITS.displayNameMax),
        mechanicId,
        mechanicName: (req.acceptedMechanicName || mechData.displayName).slice(
          0,
          LIMITS.mechanicNameMax
        ),
        vehicleMakeModel: req.vehicleMakeModel.slice(0, LIMITS.vehicleMax),
        stars,
        createdAt: serverTimestamp(),
      };
      if (cleanComment.length > 0) {
        ratingPayload.comment = cleanComment;
      }

      const batch = writeBatch(db);
      batch.set(doc(db, 'ratings', req.id), ratingPayload);
      batch.update(doc(db, 'mechanics', mechanicId), {
        rating: nextRating,
        ratingCount: nextCount,
        ratingSum: nextSum,
        lastRatingId: req.id,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();

      setJustRatedRequestId(req.id);
      if (justPaidRequestId === req.id) {
        setJustPaidRequestId(null);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `ratings/${req.id}`);
    } finally {
      setSubmittingRatingFor(null);
    }
  };

  const activeRequestsCount = useMemo(
    () => myRequests.filter((r) => r.status !== 'completed' && r.status !== 'cancelled').length,
    [myRequests]
  );
  const completedRequestsCount = useMemo(
    () => myRequests.filter((r) => r.status === 'completed').length,
    [myRequests]
  );
  const unratedCompletedCount = useMemo(
    () =>
      myRequests.filter(
        (r) => r.status === 'completed' && Boolean(r.acceptedMechanicId) && !ratingsByRequest[r.id]
      ).length,
    [myRequests, ratingsByRequest]
  );

  const filteredRequests = useMemo(() => {
    if (requestFilter === 'active') {
      return myRequests.filter((r) => r.status !== 'completed' && r.status !== 'cancelled');
    }
    if (requestFilter === 'completed') {
      return myRequests.filter((r) => r.status === 'completed');
    }
    return myRequests;
  }, [myRequests, requestFilter]);

  const activeRouteTarget = useMemo(() => {
    const dispatched = myRequests.find(
      (r) =>
        ['accepted', 'arrived', 'in_progress', 'payment_pending'].includes(r.status) &&
        r.acceptedMechanicId
    );
    if (!dispatched?.acceptedMechanicId) return null;
    const mech = mechanics.find((m) => m.uid === dispatched.acceptedMechanicId);
    if (!mech) return null;
    return {
      lat: mech.lat,
      lng: mech.lng,
      label: mech.displayName,
    };
  }, [myRequests, mechanics]);

  return (
    <div className="space-y-6">
      {/* Customer Original ID / Passport Verification & Background Check */}
      <IdentityVerificationCard
        mode="workspace"
        role="motorist"
        uid={uid}
        defaultFullName={userProfile.displayName}
        defaultCountryName={countryProfile.name}
        verification={identityVerification}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: New Breakdown Request Form + Live Map */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-lg font-bold text-slate-900">
                Post Breakdown Offer
              </h2>
              <button
                type="button"
                onClick={onSwitchToMechanic}
                className="text-xs font-semibold text-orange-700 hover:underline underline-offset-2"
              >
                Mechanic Company (3+ Crew)?
              </button>
            </div>

            {!hasValidIdentity && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-amber-900">
                <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <span>
                  Upload a photo of your <strong>original National ID or Passport</strong> above to verify your identity before posting a breakdown offer.
                </span>
              </div>
            )}

            <form onSubmit={(e) => void handlePostRequest(e)} className="space-y-4">
              <div>
                <label htmlFor="req-vehicle" className="block text-xs font-semibold text-slate-700 mb-1">
                  Vehicle Make &amp; Model
                </label>
                <input
                  id="req-vehicle"
                  type="text"
                  required
                  minLength={LIMITS.vehicleMin}
                  maxLength={LIMITS.vehicleMax}
                  value={vehicleMakeModel}
                  onChange={(e) => setVehicleMakeModel(e.target.value)}
                  className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ISSUE_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setIssueCategory(cat.id);
                      setOfferPriceUsd(String(cat.suggestedUsd));
                    }}
                    className={`min-h-[40px] px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${
                      issueCategory === cat.id
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <div>
                <label htmlFor="req-notes" className="block text-xs font-semibold text-slate-700 mb-1">
                  What Happened?
                </label>
                <textarea
                  id="req-notes"
                  rows={2}
                  required
                  minLength={LIMITS.issueNotesMin}
                  maxLength={LIMITS.issueNotesMax}
                  value={issueNotes}
                  onChange={(e) => setIssueNotes(e.target.value)}
                  placeholder="Front passenger tire blew out, have spare in trunk..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="req-location" className="block text-xs font-semibold text-slate-700 mb-1">
                    Location Description
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      id="req-location"
                      type="text"
                      required
                      minLength={LIMITS.locationMin}
                      maxLength={LIMITS.locationMax}
                      value={locationLabel}
                      onChange={(e) => setLocationLabel(e.target.value)}
                      className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 text-xs"
                    />
                    <button
                      type="button"
                      onClick={handleUseGps}
                      title="Use current GPS"
                      className="min-w-[42px] min-h-[42px] rounded-xl border border-slate-300 flex items-center justify-center text-slate-700 hover:bg-slate-50"
                    >
                      <MapPin className="w-4 h-4 text-orange-600" />
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="req-offer" className="block text-xs font-semibold text-slate-700 mb-1">
                    Name Your Fare (USD)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      aria-label="Decrease offer by $5"
                      onClick={() =>
                        setOfferPriceUsd((prev) =>
                          String(Math.max(LIMITS.offerMin, (Number(prev) || 50) - 5))
                        )
                      }
                      className="min-w-[38px] min-h-[42px] rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-700 shrink-0"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <div className="relative flex-1 min-w-0">
                      <DollarSign className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        id="req-offer"
                        type="number"
                        min={LIMITS.offerMin}
                        max={LIMITS.offerMax}
                        required
                        value={offerPriceUsd}
                        onChange={(e) => setOfferPriceUsd(e.target.value)}
                        className="w-full min-h-[42px] pl-7 pr-2 py-2 rounded-xl border border-slate-300 text-sm font-bold tabular-nums"
                      />
                    </div>
                    <button
                      type="button"
                      aria-label="Increase offer by $5"
                      onClick={() =>
                        setOfferPriceUsd((prev) =>
                          String(Math.min(LIMITS.offerMax, (Number(prev) || 50) + 5))
                        )
                      }
                      className="min-w-[38px] min-h-[42px] rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-700 shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {countryProfile.currencyCode !== 'USD' && (
                    <div className="text-[11px] text-slate-500 mt-1 tabular-nums">
                      {formatLocalCurrencyApprox(Number(offerPriceUsd) || 0, countryProfile)}
                    </div>
                  )}
                </div>
              </div>

              {/* Country-Specific Global Payment Method Selector */}
              <div className="border-t border-slate-100 pt-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                    <Globe2 className="w-4 h-4 text-orange-600" />
                    <span>Country &amp; How You Will Pay</span>
                  </div>
                  <select
                    aria-label="Select your country for local payment methods"
                    value={countryCode}
                    onChange={(e) => handleCountryChange(e.target.value)}
                    className="min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800"
                  >
                    {COUNTRY_PAYMENT_PROFILES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name} ({c.currencyCode})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                  {countryProfile.localNoteBanner}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {orderedMethods.map((m) => {
                    const detail = getCountryMethodDetail(countryCode, m.id);
                    const active = paymentMethod === m.id;
                    const isRecommended = countryProfile.recommendedMethods.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setPaymentMethod(m.id)}
                        className={`min-h-[52px] px-3 py-2 rounded-xl border text-left flex items-start gap-2 transition-colors ${
                          active
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <PaymentMethodIcon
                          method={m.id}
                          className={`w-4 h-4 shrink-0 mt-0.5 ${
                            active ? 'text-orange-400' : 'text-slate-500'
                          }`}
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold truncate">{detail.localLabel}</div>
                          <div
                            className={`text-[10px] truncate ${
                              active ? 'text-slate-300' : 'text-slate-500'
                            }`}
                          >
                            {isRecommended ? `Popular in ${countryProfile.code} · ` : ''}
                            {detail.localHint}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div>
                  <label htmlFor="req-pay-note" className="block text-[11px] font-semibold text-slate-700 mb-1">
                    {selectedMethodDetail.customerFieldLabel} (shared with mechanic team)
                  </label>
                  <input
                    id="req-pay-note"
                    type="text"
                    maxLength={LIMITS.paymentDetailNoteMax}
                    value={paymentDetailNote}
                    onChange={(e) => setPaymentDetailNote(e.target.value)}
                    placeholder={selectedMethodDetail.customerPlaceholder}
                    className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-300 text-xs text-slate-900"
                  />
                </div>
              </div>

              {postError && (
                <p className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
                  {postError}
                </p>
              )}

              <button
                type="submit"
                disabled={posting || !hasValidIdentity}
                className="w-full min-h-[46px] rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-55 text-white text-sm font-semibold transition-colors"
              >
                {posting
                  ? 'Posting Request...'
                  : !hasValidIdentity
                  ? 'Submit ID Verification Above to Post'
                  : `Publish $${offerPriceUsd} Breakdown Offer`}
              </button>
            </form>
          </div>

          <RoadsideMap
            centerLat={lat}
            centerLng={lng}
            mechanics={mechanics}
            activeLabel={locationLabel}
            userLocation={userLocation}
            routeTo={activeRouteTarget}
            gpsTracking={gpsTracking}
            gpsError={gpsError}
            onRequestCenterOnUser={handleUseGps}
            onPinSelect={(newLat, newLng, resolvedLabel) => {
              manualPinSetRef.current = true;
              setLat(newLat);
              setLng(newLng);
              if (resolvedLabel) {
                setLocationLabel(resolvedLabel);
              } else {
                void reverseGeocodeLabel(newLat, newLng).then((lbl) => {
                  if (lbl) setLocationLabel(lbl);
                });
              }
            }}
          />
        </div>

        {/* Right: My Active Requests, Completed Repairs & Post-Repair Ratings */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="font-display text-xl font-bold text-slate-900">
              Your Roadside Requests &amp; Live Bids
            </h2>

            {myRequests.length > 0 && (
              <div className="flex items-center gap-1 p-1 bg-slate-200/75 rounded-xl self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setRequestFilter('all')}
                  className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold tabular-nums whitespace-nowrap transition-colors ${
                    requestFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All ({myRequests.length})
                </button>
                <button
                  type="button"
                  onClick={() => setRequestFilter('active')}
                  className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold tabular-nums whitespace-nowrap transition-colors ${
                    requestFilter === 'active'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Active ({activeRequestsCount})
                </button>
                <button
                  type="button"
                  onClick={() => setRequestFilter('completed')}
                  className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold tabular-nums whitespace-nowrap transition-colors ${
                    requestFilter === 'completed'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Completed ({completedRequestsCount})
                </button>
              </div>
            )}
          </div>

          {unratedCompletedCount > 0 && requestFilter === 'active' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3 text-xs">
              <span className="font-medium text-amber-900">
                {unratedCompletedCount} completed {unratedCompletedCount === 1 ? 'repair is' : 'repairs are'} ready for your 1–5 star rating.
              </span>
              <button
                type="button"
                onClick={() => setRequestFilter('completed')}
                className="font-semibold text-amber-900 underline underline-offset-2 whitespace-nowrap"
              >
                Rate now
              </button>
            </div>
          )}

          {myRequests.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-2">
              <Wrench className="w-7 h-7 text-slate-400 mx-auto" />
              <div className="text-sm font-semibold text-slate-800">No active breakdown requests</div>
              <p className="text-xs text-slate-500">
                Post your price offer and payment method on the left to receive live bids from verified 3+ technician mechanic companies.
              </p>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-2">
              <Wrench className="w-7 h-7 text-slate-400 mx-auto" />
              <div className="text-sm font-semibold text-slate-800">
                No {requestFilter} requests
              </div>
              <button
                type="button"
                onClick={() => setRequestFilter('all')}
                className="text-xs font-semibold text-orange-700 hover:underline underline-offset-2"
              >
                Show all requests
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredRequests.map((req) => {
                const bids = bidsByRequest[req.id] || [];
                const existingRating = ratingsByRequest[req.id];
                const selectedStars = starDraftByRequest[req.id] ?? 0;
                const hoveredStars = hoverStarByRequest[req.id] ?? 0;
                const activeStars = hoveredStars || selectedStars;
                const ratingComment = commentDraftByRequest[req.id] || '';
                const ratingError = ratingErrorByRequest[req.id];

                const reqCountry = getCountryPaymentProfile(req.countryCode || countryCode);
                const reqPayMethod: CustomerPaymentMethod = req.paymentMethod || 'mobile_money';
                const reqPayDetail = getCountryMethodDetail(reqCountry.code, reqPayMethod);
                const reqPayMeta = getCustomerPaymentMethodMeta(reqPayMethod);

                return (
                  <div key={req.id} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 space-y-1">
                        <div className="text-xs text-slate-500 flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-slate-700 capitalize">
                            {req.status.replace('_', ' ')}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{req.locationLabel}</span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {reqCountry.name} ({reqCountry.currencyCode}) · Pay via{' '}
                            <strong className="text-slate-800">{reqPayDetail.localLabel}</strong>
                          </span>
                          {req.paymentDetailNote && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{req.paymentDetailNote}</span>
                            </>
                          )}
                          {req.acceptedMechanicName && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>Company: {req.acceptedMechanicName}</span>
                            </>
                          )}
                        </div>
                        <h3 className="font-display text-lg font-bold text-slate-900">
                          {req.vehicleMakeModel}
                        </h3>
                        <p className="text-sm text-slate-600">{req.issueNotes}</p>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-xs text-slate-500">
                          {req.agreedPriceUsd ? 'Agreed Price' : 'Your Offer'}
                        </div>
                        <div className="font-display text-2xl font-bold text-slate-900 tabular-nums">
                          ${req.agreedPriceUsd ?? req.offerPriceUsd}
                        </div>
                        {reqCountry.currencyCode !== 'USD' && (
                          <div className="text-[11px] text-slate-500 tabular-nums">
                            {formatLocalCurrencyApprox(
                              req.agreedPriceUsd ?? req.offerPriceUsd,
                              reqCountry
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Live payment preference switcher during active dispatch */}
                    {['open', 'accepted', 'arrived', 'in_progress'].includes(req.status) && (
                      <div className="border-t border-slate-100 pt-3 space-y-2 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-slate-600 font-medium">
                            Shared payment method ({reqCountry.name}):
                          </span>
                          <select
                            aria-label="Request payment country"
                            value={reqCountry.code}
                            onChange={(e) =>
                              void handleUpdatePaymentSelection(req, reqPayMethod, e.target.value)
                            }
                            className="min-h-[30px] px-2 py-1 rounded-lg border border-slate-200 bg-white text-[11px] font-semibold text-slate-700"
                          >
                            {COUNTRY_PAYMENT_PROFILES.map((c) => (
                              <option key={c.code} value={c.code}>
                                {c.name} ({c.currencyCode})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {CUSTOMER_PAYMENT_METHODS.map((m) => {
                            const selected = reqPayMethod === m.id;
                            const detail = getCountryMethodDetail(reqCountry.code, m.id);
                            return (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() =>
                                  void handleUpdatePaymentSelection(req, m.id, reqCountry.code)
                                }
                                className={`min-h-[32px] px-2.5 py-1 rounded-lg border text-[11px] font-semibold whitespace-nowrap transition-colors ${
                                  selected
                                    ? 'bg-slate-900 text-white border-slate-900'
                                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                                }`}
                              >
                                {detail.localLabel}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* inDrive-Style Live Fare Adjustment & Dispatcher Status */}
                    {req.status === 'open' && (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="text-slate-700 font-medium">
                          Adjust your offer fare live:
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void handleAdjustOfferPrice(req, -5)}
                            className="min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 font-semibold text-slate-700 tabular-nums"
                          >
                            -$5
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleAdjustOfferPrice(req, 5)}
                            className="min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 font-semibold text-slate-900 tabular-nums"
                          >
                            +$5
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleAdjustOfferPrice(req, 10)}
                            className="min-h-[34px] px-2.5 py-1 rounded-lg border border-emerald-600 bg-emerald-50 hover:bg-emerald-100 font-semibold text-emerald-800 tabular-nums"
                          >
                            +$10
                          </button>
                        </div>
                      </div>
                    )}

                    {/* inDrive-Style 4-Step Active Dispatch Tracker */}
                    {['accepted', 'arrived', 'in_progress', 'payment_pending'].includes(req.status) && (() => {
                      const steps = [
                        { id: 'accepted', label: 'Dispatched' },
                        { id: 'arrived', label: 'Arrived' },
                        { id: 'in_progress', label: 'Repairing' },
                        { id: 'payment_pending', label: 'Pay' },
                      ];
                      const currentIdx = steps.findIndex((s) => s.id === req.status);
                      const assignedMech = mechanics.find((m) => m.uid === req.acceptedMechanicId);
                      const distKm = assignedMech
                        ? haversineKm(req.lat, req.lng, assignedMech.lat, assignedMech.lng)
                        : null;
                      const gmapsUrl = assignedMech
                        ? buildGoogleMapsLink(req.lat, req.lng, { lat: assignedMech.lat, lng: assignedMech.lng })
                        : buildGoogleMapsLink(req.lat, req.lng, userLocation);

                      return (
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className="font-semibold text-slate-900">
                              {req.acceptedMechanicName || 'Mechanic Company'}
                              {distKm !== null ? ` · ${formatDistance(distKm)}` : ''}
                            </span>
                            <a
                              href={gmapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              Google Maps
                            </a>
                          </div>
                          <div className="grid grid-cols-4 gap-1.5">
                            {steps.map((step, idx) => {
                              const done = idx <= currentIdx;
                              return (
                                <div key={step.id} className="space-y-1">
                                  <div
                                    className={`h-1.5 rounded-full ${
                                      done ? 'bg-emerald-600' : 'bg-slate-200'
                                    }`}
                                  />
                                  <div
                                    className={`text-[11px] font-medium truncate ${
                                      done ? 'text-slate-900' : 'text-slate-400'
                                    }`}
                                  >
                                    {step.label}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Incoming Mechanic Company Offers (inDrive-Style Cards) */}
                    {req.status === 'open' && (
                      <div className="border-t border-slate-100 pt-4 space-y-3">
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                          <span>Incoming Crew Offers ({bids.length})</span>
                          <button
                            type="button"
                            onClick={() => void handleCancelRequest(req)}
                            className="text-red-700 hover:underline"
                          >
                            Cancel Request
                          </button>
                        </div>

                        {bids.length === 0 ? (
                          <div className="text-xs text-slate-500 py-2">
                            Waiting for nearby verified 3+ mechanic crews to accept your ${req.offerPriceUsd} fare or send a counter-offer...
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                            {bids.map((bid) => {
                              const liveMech = mechanics.find((m) => m.uid === bid.mechanicId);
                              const displayRating = liveMech?.rating ?? bid.mechanicRating;
                              const reviewCount = liveMech?.ratingCount ?? 0;
                              const teamSize = liveMech?.teamMemberCount ?? 3;
                              const distKm = liveMech
                                ? haversineKm(req.lat, req.lng, liveMech.lat, liveMech.lng)
                                : null;
                              const fareDiff = bid.bidAmountUsd - req.offerPriceUsd;

                              return (
                                <div
                                  key={bid.id}
                                  className="border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white"
                                >
                                  <div className="flex items-start gap-3 min-w-0">
                                    <img
                                      src={liveMech?.avatarUrl || MECHANIC_AVATARS[0]}
                                      alt={bid.mechanicName}
                                      referrerPolicy="no-referrer"
                                      className="w-11 h-11 rounded-xl object-cover border border-slate-200 shrink-0 bg-slate-100"
                                    />
                                    <div className="min-w-0 space-y-0.5">
                                      <div className="text-sm font-bold text-slate-900 flex flex-wrap items-center gap-2">
                                        <span className="truncate">{bid.mechanicName}</span>
                                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 tabular-nums">
                                          <Star className="w-3.5 h-3.5 fill-amber-500" />
                                          {displayRating.toFixed(1)}
                                          {reviewCount > 0 && (
                                            <span className="text-slate-500 font-normal">
                                              ({reviewCount})
                                            </span>
                                          )}
                                        </span>
                                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 tabular-nums">
                                          <Users className="w-3 h-3 text-slate-500" />
                                          {teamSize}-tech crew
                                        </span>
                                      </div>
                                      <div className="text-xs text-slate-600 flex flex-wrap items-center gap-2">
                                        <span>{bid.mechanicSpecialty}</span>
                                        <span aria-hidden="true">·</span>
                                        <span className="inline-flex items-center gap-1 font-medium text-slate-800 tabular-nums">
                                          <Clock className="w-3 h-3 text-emerald-600" />
                                          {bid.etaMinutes} min
                                        </span>
                                        {distKm !== null && (
                                          <>
                                            <span aria-hidden="true">·</span>
                                            <span className="tabular-nums">{formatDistance(distKm)}</span>
                                          </>
                                        )}
                                      </div>
                                      {bid.note && (
                                        <div className="text-xs text-slate-500 italic">
                                          &ldquo;{bid.note}&rdquo;
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex flex-col sm:items-end gap-2 shrink-0">
                                    <div className="sm:text-right">
                                      <div className="font-display text-xl font-bold text-slate-900 tabular-nums">
                                        ${bid.bidAmountUsd}
                                      </div>
                                      <div
                                        className={`text-[11px] font-medium tabular-nums ${
                                          fareDiff <= 0 ? 'text-emerald-700' : 'text-amber-700'
                                        }`}
                                      >
                                        {fareDiff === 0
                                          ? 'Matches your offer'
                                          : fareDiff < 0
                                          ? `$${Math.abs(fareDiff)} below your offer`
                                          : `+$${fareDiff} counter-offer`}
                                        {reqCountry.currencyCode !== 'USD'
                                          ? ` · ${formatLocalCurrencyApprox(bid.bidAmountUsd, reqCountry)}`
                                          : ''}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => void handleDeclineBid(req, bid)}
                                        aria-label={`Decline offer from ${bid.mechanicName}`}
                                        className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                        Decline
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void handleAcceptBid(req, bid)}
                                        className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold whitespace-nowrap"
                                      >
                                        Accept ${bid.bidAmountUsd}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Direct Country-Aware Payment Settlement */}
                    {req.status === 'payment_pending' && (
                      <div className="border-t border-slate-100 pt-4 space-y-4">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-xs font-semibold text-slate-800">
                              Settle Payment with {req.acceptedMechanicName || 'Mechanic Company'} ({reqCountry.name})
                            </div>
                            <select
                              aria-label="Checkout country"
                              value={reqCountry.code}
                              onChange={(e) =>
                                void handleUpdatePaymentSelection(req, reqPayMethod, e.target.value)
                              }
                              className="min-h-[32px] px-2 py-1 rounded-lg border border-slate-200 bg-white text-[11px] font-semibold text-slate-700"
                            >
                              {COUNTRY_PAYMENT_PROFILES.map((c) => (
                                <option key={c.code} value={c.code}>
                                  {c.name} ({c.currencyCode})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {CUSTOMER_PAYMENT_METHODS.map((m) => {
                              const active = reqPayMethod === m.id;
                              const detail = getCountryMethodDetail(reqCountry.code, m.id);
                              return (
                                <button
                                  key={m.id}
                                  type="button"
                                  onClick={() =>
                                    void handleUpdatePaymentSelection(req, m.id, reqCountry.code)
                                  }
                                  className={`min-h-[42px] px-2.5 py-2 rounded-xl border text-[11px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors ${
                                    active
                                      ? 'bg-slate-900 text-white border-slate-900'
                                      : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                                  }`}
                                >
                                  <PaymentMethodIcon
                                    method={m.id}
                                    className={`w-3.5 h-3.5 shrink-0 ${
                                      active ? 'text-orange-400' : 'text-slate-500'
                                    }`}
                                  />
                                  <span className="truncate">{detail.localLabel}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-1.5">
                          <div className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                            <PaymentMethodIcon method={reqPayMethod} className="w-4 h-4 text-emerald-700" />
                            <span>
                              {reqPayDetail.localLabel} · {reqCountry.name} ({reqCountry.currencyCode})
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 leading-relaxed">
                            {reqPayDetail.checkoutInstructions}{' '}
                            Amount:{' '}
                            <strong className="text-slate-900 tabular-nums">
                              ${(req.agreedPriceUsd ?? req.offerPriceUsd).toFixed(2)} USD
                            </strong>
                            {reqCountry.currencyCode !== 'USD' && (
                              <span className="text-slate-600 tabular-nums">
                                {' '}
                                ({formatLocalCurrencyApprox(req.agreedPriceUsd ?? req.offerPriceUsd, reqCountry)})
                              </span>
                            )}
                            .
                          </p>
                        </div>

                        {reqPayMeta.usesQrSettlement && req.qrPaymentUri && (
                          <MechanicQRCard
                            mechanicName={req.acceptedMechanicName || 'Mechanic Company'}
                            qrLabel={req.qrPaymentLabel || reqPayDetail.mechanicHandleLabel}
                            qrUri={req.qrPaymentUri}
                            amountUsd={req.agreedPriceUsd ?? req.offerPriceUsd}
                            localAmountText={
                              reqCountry.currencyCode !== 'USD'
                                ? formatLocalCurrencyApprox(
                                    req.agreedPriceUsd ?? req.offerPriceUsd,
                                    reqCountry
                                  )
                                : undefined
                            }
                            paymentMethodLabel={reqPayDetail.localLabel}
                            motoristPaymentNote={req.paymentDetailNote}
                            invoiceRef={req.qrPaymentUri.match(/[?&]ref=([^&]+)/)?.[1]}
                          />
                        )}

                        <button
                          type="button"
                          onClick={() => void handleConfirmPayment(req)}
                          className="w-full min-h-[46px] rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold inline-flex items-center justify-center gap-2"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Confirm {reqPayDetail.localLabel} Payment Completed
                        </button>
                      </div>
                    )}

                    {/* Post-Repair 1-5 Star Rating */}
                    {req.status === 'completed' && req.acceptedMechanicId && (
                      <div className="border-t border-slate-100 pt-4 space-y-3">
                        {existingRating ? (
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-xs font-semibold text-slate-900">
                                Your Post-Repair Rating for {existingRating.mechanicName}
                              </div>
                              <div className="text-xs text-slate-500 tabular-nums">
                                {existingRating.createdAt?.toMillis
                                  ? new Date(existingRating.createdAt.toMillis()).toLocaleDateString()
                                  : 'Submitted'}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2.5">
                              <div
                                className="inline-flex items-center gap-1"
                                aria-label={`Rated ${existingRating.stars} out of 5 stars`}
                              >
                                {[1, 2, 3, 4, 5].map((value) => (
                                  <Star
                                    key={value}
                                    className={`w-4 h-4 ${
                                      value <= existingRating.stars
                                        ? 'text-amber-500 fill-amber-500'
                                        : 'text-slate-200'
                                    }`}
                                  />
                                ))}
                              </div>
                              <span className="text-xs font-semibold text-slate-800 tabular-nums">
                                {existingRating.stars}.0 / 5 · {RATING_LABELS[existingRating.stars]}
                              </span>
                            </div>

                            {existingRating.comment && (
                              <p className="text-xs text-slate-600 leading-relaxed">
                                &ldquo;{existingRating.comment}&rdquo;
                              </p>
                            )}

                            {justRatedRequestId === req.id && (
                              <div className="text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2.5 flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                <span>
                                  Rating saved and applied to {existingRating.mechanicName}&apos;s profile.
                                </span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {justPaidRequestId === req.id && (
                              <div className="text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2.5 flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                <span>
                                  Payment confirmed. Rate your repair with {req.acceptedMechanicName || 'your mechanic company'} below.
                                </span>
                              </div>
                            )}

                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <div>
                                <h4 className="font-display text-sm font-bold text-slate-900">
                                  Rate {req.acceptedMechanicName || 'Your Mechanic Company'}
                                </h4>
                                <p className="text-xs text-slate-500">
                                  Select 1–5 stars to review this completed repair.
                                </p>
                              </div>
                              <span className="text-xs font-semibold text-slate-700 tabular-nums">
                                {activeStars > 0
                                  ? `${activeStars}/5 · ${RATING_LABELS[activeStars]}`
                                  : 'Tap a star'}
                              </span>
                            </div>

                            <div
                              className="flex items-center gap-1.5"
                              role="group"
                              aria-label={`Rate ${req.acceptedMechanicName || 'mechanic'} from 1 to 5 stars`}
                              onMouseLeave={() =>
                                setHoverStarByRequest((prev) => {
                                  const next = { ...prev };
                                  delete next[req.id];
                                  return next;
                                })
                              }
                            >
                              {[1, 2, 3, 4, 5].map((value) => {
                                const filled = value <= activeStars;
                                return (
                                  <button
                                    key={value}
                                    type="button"
                                    aria-label={`Rate ${value} ${value === 1 ? 'star' : 'stars'} (${RATING_LABELS[value]})`}
                                    aria-pressed={selectedStars === value}
                                    onMouseEnter={() =>
                                      setHoverStarByRequest((prev) => ({ ...prev, [req.id]: value }))
                                    }
                                    onClick={() => {
                                      setStarDraftByRequest((prev) => ({ ...prev, [req.id]: value }));
                                      setRatingErrorByRequest((prev) => {
                                        const next = { ...prev };
                                        delete next[req.id];
                                        return next;
                                      });
                                    }}
                                    className={`min-w-[44px] min-h-[44px] rounded-xl border flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
                                      filled
                                        ? 'border-amber-300 bg-amber-50/70'
                                        : 'border-slate-200 bg-white hover:border-slate-300'
                                    }`}
                                  >
                                    <Star
                                      className={`w-5 h-5 transition-colors ${
                                        filled ? 'text-amber-500 fill-amber-500' : 'text-slate-300'
                                      }`}
                                    />
                                  </button>
                                );
                              })}
                            </div>

                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[11px] text-slate-500">
                                <label htmlFor={`rating-comment-${req.id}`} className="font-medium text-slate-700">
                                  Review Note (optional)
                                </label>
                                <span className="tabular-nums">
                                  {ratingComment.length}/{LIMITS.ratingCommentMax}
                                </span>
                              </div>
                              <textarea
                                id={`rating-comment-${req.id}`}
                                rows={2}
                                maxLength={LIMITS.ratingCommentMax}
                                value={ratingComment}
                                onChange={(e) =>
                                  setCommentDraftByRequest((prev) => ({
                                    ...prev,
                                    [req.id]: e.target.value,
                                  }))
                                }
                                placeholder="Fast arrival, transparent pricing, fixed on the spot..."
                                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs text-slate-900"
                              />
                            </div>

                            {ratingError && (
                              <p className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                                {ratingError}
                              </p>
                            )}

                            <button
                              type="button"
                              disabled={selectedStars < 1 || submittingRatingFor === req.id}
                              onClick={() => void handleSubmitRating(req)}
                              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
                            >
                              {submittingRatingFor === req.id
                                ? 'Submitting Rating...'
                                : selectedStars > 0
                                ? `Submit ${selectedStars}-Star Rating`
                                : 'Select Stars to Rate'}
                            </button>
                          </div>
                        )}
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
  );
}
