import React, { useEffect, useMemo, useState } from 'react';
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
import { CheckCircle2, Clock, DollarSign, MapPin, Star, Wrench } from 'lucide-react';
import { OperationType, db, handleFirestoreError } from '../firebase';
import {
  BreakdownRequest,
  ISSUE_CATEGORIES,
  IssueCategory,
  LIMITS,
  MechanicBid,
  MechanicProfile,
  MechanicRating,
  RATING_LABELS,
  UserProfile,
} from '../types';
import { MechanicQRCard } from './MechanicQRCard';
import { RoadsideMap } from './RoadsideMap';

interface MotoristWorkspaceProps {
  uid: string;
  userProfile: UserProfile;
  mechanics: MechanicProfile[];
  onSwitchToMechanic: () => void;
}

type RequestFilter = 'all' | 'active' | 'completed';

export function MotoristWorkspace({
  uid,
  userProfile,
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

  // Request Form State
  const [vehicleMakeModel, setVehicleMakeModel] = useState(
    userProfile.vehicleSummary || '2020 Toyota Corolla'
  );
  const [issueCategory, setIssueCategory] = useState<IssueCategory>('tire');
  const [issueNotes, setIssueNotes] = useState('');
  const [locationLabel, setLocationLabel] = useState('I-280 Northbound Mile 14');
  const [lat, setLat] = useState(37.7749);
  const [lng, setLng] = useState(-122.4194);
  const [offerPriceUsd, setOfferPriceUsd] = useState('55');
  const [posting, setPosting] = useState(false);

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

  const handleUseGps = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      setLat(Number(pos.coords.latitude.toFixed(5)));
      setLng(Number(pos.coords.longitude.toFixed(5)));
      setLocationLabel('Current GPS Coordinates');
    });
  };

  const handlePostRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanVehicle = vehicleMakeModel.trim().slice(0, LIMITS.vehicleMax);
    const cleanNotes = issueNotes.trim().slice(0, LIMITS.issueNotesMax);
    const cleanLoc = locationLabel.trim().slice(0, LIMITS.locationMax);
    const price = Math.max(
      LIMITS.offerMin,
      Math.min(LIMITS.offerMax, Number(offerPriceUsd) || 50)
    );

    if (
      cleanVehicle.length < LIMITS.vehicleMin ||
      cleanNotes.length < LIMITS.issueNotesMin ||
      cleanLoc.length < LIMITS.locationMin
    ) {
      return;
    }

    setPosting(true);
    const reqId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    try {
      await setDoc(doc(db, 'requests', reqId), {
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
        status: 'open',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
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

  const handleConfirmQrPaid = async (req: BreakdownRequest) => {
    try {
      await updateDoc(doc(db, 'requests', req.id), {
        status: 'completed',
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left: New Breakdown Request Form + Radar */}
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
              Are you a mechanic?
            </button>
          </div>

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
                  Your Price Offer (USD)
                </label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="req-offer"
                    type="number"
                    min={LIMITS.offerMin}
                    max={LIMITS.offerMax}
                    required
                    value={offerPriceUsd}
                    onChange={(e) => setOfferPriceUsd(e.target.value)}
                    className="w-full min-h-[42px] pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-sm font-bold tabular-nums"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={posting}
              className="w-full min-h-[46px] rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold transition-colors"
            >
              {posting ? 'Posting Request...' : `Publish $${offerPriceUsd} Breakdown Offer`}
            </button>
          </form>
        </div>

        <RoadsideMap
          centerLat={lat}
          centerLng={lng}
          mechanics={mechanics}
          activeLabel={locationLabel}
          onPinSelect={(newLat, newLng) => {
            setLat(newLat);
            setLng(newLng);
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
              Post your price offer on the left to receive live acceptances or counter-bids from nearby mechanics.
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
                        {req.acceptedMechanicName && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>Mechanic: {req.acceptedMechanicName}</span>
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
                    </div>
                  </div>

                  {/* Incoming Mechanic Bids */}
                  {req.status === 'open' && (
                    <div className="border-t border-slate-100 pt-4 space-y-3">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                        <span>Incoming Mechanic Bids ({bids.length})</span>
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
                          Waiting for online mechanics to accept or counter-bid...
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {bids.map((bid) => {
                            const liveMech = mechanics.find((m) => m.uid === bid.mechanicId);
                            const displayRating = liveMech?.rating ?? bid.mechanicRating;
                            const reviewCount = liveMech?.ratingCount ?? 0;
                            return (
                              <div
                                key={bid.id}
                                className="border border-slate-200 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3"
                              >
                                <div className="space-y-0.5">
                                  <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                    <span>{bid.mechanicName}</span>
                                    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 tabular-nums">
                                      <Star className="w-3.5 h-3.5 fill-amber-500" />
                                      {displayRating.toFixed(1)}
                                      {reviewCount > 0 && (
                                        <span className="text-slate-500 font-normal">
                                          ({reviewCount})
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                  <div className="text-xs text-slate-600 flex items-center gap-2">
                                    <span>{bid.mechanicSpecialty}</span>
                                    <span aria-hidden="true">·</span>
                                    <span className="inline-flex items-center gap-1 tabular-nums">
                                      <Clock className="w-3 h-3" />
                                      {bid.etaMinutes} min ETA
                                    </span>
                                  </div>
                                  {bid.note && (
                                    <div className="text-xs text-slate-500 italic">
                                      &ldquo;{bid.note}&rdquo;
                                    </div>
                                  )}
                                </div>

                                <div className="flex items-center gap-3">
                                  <div className="font-display text-xl font-bold text-orange-600 tabular-nums">
                                    ${bid.bidAmountUsd}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => void handleAcceptBid(req, bid)}
                                    className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
                                  >
                                    Accept Bid
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* QR Payment Settlement (Direct to Mechanic) */}
                  {req.status === 'payment_pending' && req.qrPaymentUri && (
                    <div className="border-t border-slate-100 pt-4 space-y-4">
                      <MechanicQRCard
                        mechanicName={req.acceptedMechanicName || 'Mechanic'}
                        qrLabel={req.qrPaymentLabel || 'Direct QR'}
                        qrUri={req.qrPaymentUri}
                        amountUsd={req.agreedPriceUsd ?? req.offerPriceUsd}
                      />
                      <button
                        type="button"
                        onClick={() => void handleConfirmQrPaid(req)}
                        className="w-full min-h-[46px] rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold inline-flex items-center justify-center gap-2"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Confirm QR Payment Sent
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
                                Payment confirmed. Rate your repair with {req.acceptedMechanicName || 'your mechanic'} below.
                              </span>
                            </div>
                          )}

                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <div>
                              <h4 className="font-display text-sm font-bold text-slate-900">
                                Rate {req.acceptedMechanicName || 'Your Mechanic'}
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
  );
}
