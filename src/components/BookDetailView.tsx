import React, { useEffect, useState } from 'react';
import { ArrowLeft, Check, Heart, Lock, Star, UserPlus } from 'lucide-react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  BookCampaign,
  BookDonation,
  BookRating,
  CRAFT_FOCUSES,
  CraftFocus,
  FIELD_LIMITS,
  PAYMENT_METHOD_LABELS,
  PaymentMethod,
} from '../types';
import { CoverImage } from './CoverImage';
import { AuthorEmailInput } from '../utils/emailNotifications';
import {
  StripeConfigResponse,
  createDonationPaymentIntent,
  verifyStripePaymentIntent,
} from '../utils/stripeClient';
import { StripePaymentForm } from './StripePaymentForm';

interface BookDetailViewProps {
  book: BookCampaign;
  isLiveFirestoreDoc: boolean;
  currentUser: User | null;
  stripeConfig: StripeConfigResponse;
  followerCount: number;
  isFollowingAuthor: boolean;
  followBusy: boolean;
  onToggleFollowAuthor: (authorId: string, authorPenName: string) => void;
  onSelectAuthor: (authorId: string, authorPenName: string) => void;
  onBack: () => void;
  onRequestSignIn: () => void;
  onNotifyAuthorEmail: (input: AuthorEmailInput) => void;
}

const PRESET_AMOUNTS = [5, 15, 25, 50];
const DONATION_METHODS: PaymentMethod[] = ['card', 'digital_wallet', 'bank_transfer', 'mobile_money'];

export const BookDetailView: React.FC<BookDetailViewProps> = ({
  book,
  isLiveFirestoreDoc,
  currentUser,
  stripeConfig,
  followerCount,
  isFollowingAuthor,
  followBusy,
  onToggleFollowAuthor,
  onSelectAuthor,
  onBack,
  onRequestSignIn,
  onNotifyAuthorEmail,
}) => {
  const [donations, setDonations] = useState<BookDonation[]>([]);
  const [ratings, setRatings] = useState<BookRating[]>([]);
  const [loadingCommunity, setLoadingCommunity] = useState(true);

  // Donation state
  const [amountUsd, setAmountUsd] = useState<number>(25);
  const [customAmount, setCustomAmount] = useState<string>('25');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');
  const [donorMessage, setDonorMessage] = useState<string>('');
  const [donating, setDonating] = useState(false);
  const [pendingClientSecret, setPendingClientSecret] = useState<string | null>(null);
  const [pendingAmountUsd, setPendingAmountUsd] = useState<number>(0);
  const [donationFeedback, setDonationFeedback] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  // Rating state
  const [stars, setStars] = useState<number>(5);
  const [hoverStars, setHoverStars] = useState<number>(0);
  const [craftFocus, setCraftFocus] = useState<CraftFocus>('Storytelling');
  const [reviewText, setReviewText] = useState<string>('');
  const [ratingBusy, setRatingBusy] = useState(false);
  const [ratingFeedback, setRatingFeedback] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setPendingClientSecret(null);
    setDonationFeedback(null);
    setRatingFeedback(null);

    if (!isLiveFirestoreDoc) {
      setDonations([]);
      setRatings([]);
      setLoadingCommunity(false);
      return;
    }

    setLoadingCommunity(true);
    const donationsQuery = query(
      collection(db, 'donations'),
      where('bookId', '==', book.id),
      where('visibility', '==', 'public')
    );
    const ratingsQuery = query(
      collection(db, 'ratings'),
      where('bookId', '==', book.id),
      where('visibility', '==', 'public')
    );

    const unsubDonations = onSnapshot(
      donationsQuery,
      (snap) => {
        const rows = snap.docs.map((d) => d.data() as BookDonation);
        rows.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setDonations(rows);
        setLoadingCommunity(false);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `donations?bookId=${book.id}`)
    );

    const unsubRatings = onSnapshot(
      ratingsQuery,
      (snap) => {
        const rows = snap.docs.map((d) => d.data() as BookRating);
        rows.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setRatings(rows);
        setLoadingCommunity(false);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `ratings?bookId=${book.id}`)
    );

    return () => {
      unsubDonations();
      unsubRatings();
    };
  }, [book.id, isLiveFirestoreDoc]);

  const pct = book.goalUsd > 0 ? Math.min(100, Math.round((book.raisedUsd / book.goalUsd) * 100)) : 0;
  const isAuthorSelf = Boolean(currentUser && currentUser.uid === book.authorId);
  const userExistingRating = currentUser
    ? ratings.find((r) => r.reviewerId === currentUser.uid)
    : undefined;

  const handleSelectPreset = (amt: number) => {
    setAmountUsd(amt);
    setCustomAmount(String(amt));
  };

  const commitDonationBatch = async (
    cleanAmount: number,
    stripePaymentIntentId?: string
  ) => {
    if (!currentUser) return;
    const trimmedMessage = donorMessage.trim().slice(0, FIELD_LIMITS.donationMessageMax);
    const donationId = `don_${book.id.slice(0, 14)}_${Date.now()}`;
    const nextRaised = book.raisedUsd + cleanAmount;
    const nextStatus =
      nextRaised >= book.goalUsd && book.status === 'seeking_funding' ? 'funded' : book.status;

    const batch = writeBatch(db);
    const donationPayload: Record<string, unknown> = {
      id: donationId,
      bookId: book.id,
      bookTitle: book.title,
      authorId: book.authorId,
      donorId: currentUser.uid,
      donorName: (currentUser.displayName || 'Reader Patron').slice(0, FIELD_LIMITS.displayNameMax),
      amountUsd: cleanAmount,
      paymentMethod: stripePaymentIntentId ? 'card' : paymentMethod,
      visibility: 'public',
      createdAt: serverTimestamp(),
    };
    if (trimmedMessage.length > 0) {
      donationPayload.message = trimmedMessage;
    }
    if (stripePaymentIntentId) {
      donationPayload.stripePaymentIntentId = stripePaymentIntentId;
    }

    batch.set(doc(db, 'donations', donationId), donationPayload);
    batch.update(doc(db, 'books', book.id), {
      raisedUsd: nextRaised,
      donorCount: book.donorCount + 1,
      lastDonationId: donationId,
      status: nextStatus,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
    setDonorMessage('');
    setDonationFeedback({
      type: 'ok',
      text: `Thank you! Your $${cleanAmount.toLocaleString()} pledge${
        stripePaymentIntentId ? ' via Stripe' : ''
      } has been recorded toward publishing "${book.title}".`,
    });
    onNotifyAuthorEmail({
      kind: 'donation',
      eventKey: `donation_${donationId}`,
      authorId: book.authorId,
      authorPenName: book.authorPenName,
      recipientLabel:
        book.authorId === currentUser.uid && currentUser.email
          ? currentUser.email
          : `${book.authorPenName} (Author)`,
      bookTitle: book.title,
      donorName: (currentUser.displayName || 'Reader Patron').slice(0, FIELD_LIMITS.displayNameMax),
      amountUsd: cleanAmount,
      message: trimmedMessage || undefined,
    });
  };

  const handleDonate = async (e: React.FormEvent) => {
    e.preventDefault();
    setDonationFeedback(null);

    if (!currentUser) {
      onRequestSignIn();
      return;
    }

    if (!isLiveFirestoreDoc) {
      setDonationFeedback({
        type: 'error',
        text: 'This preview catalog entry is syncing. Please reload or sign in as curator to activate live pledges.',
      });
      return;
    }

    const parsed = Number(customAmount);
    if (!Number.isFinite(parsed) || parsed < FIELD_LIMITS.donationMin || parsed > FIELD_LIMITS.donationMax) {
      setDonationFeedback({
        type: 'error',
        text: `Donation must be between $${FIELD_LIMITS.donationMin} and $${FIELD_LIMITS.donationMax.toLocaleString()}.`,
      });
      return;
    }

    const cleanAmount = Math.round(parsed * 100) / 100;
    setDonating(true);
    try {
      if (stripeConfig.configured && stripeConfig.publishableKey) {
        const intent = await createDonationPaymentIntent(currentUser, {
          bookId: book.id,
          authorId: book.authorId,
          bookTitle: book.title,
          amountUsd: cleanAmount,
        });
        setPendingAmountUsd(intent.amountUsd);
        setPendingClientSecret(intent.clientSecret);
        return;
      }

      await commitDonationBatch(cleanAmount);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('{')) {
        handleFirestoreError(err, OperationType.WRITE, `donations/${book.id}`);
      } else {
        setDonationFeedback({
          type: 'error',
          text: err instanceof Error ? err.message : 'Unable to process donation.',
        });
      }
    } finally {
      setDonating(false);
    }
  };

  const handleStripeDonationSuccess = async (paymentIntentId: string) => {
    if (!currentUser) return;
    const verified = await verifyStripePaymentIntent(currentUser, {
      paymentIntentId,
      expectedKind: 'book_donation',
      bookId: book.id,
    });
    await commitDonationBatch(verified.amountUsd || pendingAmountUsd, paymentIntentId);
    setPendingClientSecret(null);
    setPendingAmountUsd(0);
  };

  const handleSubmitRating = async (e: React.FormEvent) => {
    e.preventDefault();
    setRatingFeedback(null);

    if (!currentUser) {
      onRequestSignIn();
      return;
    }

    if (!isLiveFirestoreDoc) {
      setRatingFeedback({
        type: 'error',
        text: 'Preview manuscripts require live catalog sync before saving ratings.',
      });
      return;
    }

    if (isAuthorSelf) {
      setRatingFeedback({
        type: 'error',
        text: 'Authors cannot rate their own manuscripts.',
      });
      return;
    }

    if (userExistingRating) {
      setRatingFeedback({
        type: 'error',
        text: 'You have already submitted a rating for this book.',
      });
      return;
    }

    const intStars = Math.round(stars);
    if (intStars < 1 || intStars > 5) {
      setRatingFeedback({ type: 'error', text: 'Please select between 1 and 5 stars.' });
      return;
    }

    const ratingId = `${book.id}_${currentUser.uid}`;
    const trimmedReview = reviewText.trim().slice(0, FIELD_LIMITS.reviewTextMax);
    const nextCount = book.ratingCount + 1;
    const nextSum = book.ratingSum + intStars;
    const nextAvg = Math.round((nextSum / nextCount) * 10) / 10;

    setRatingBusy(true);
    const batch = writeBatch(db);
    const ratingPayload: Record<string, unknown> = {
      id: ratingId,
      bookId: book.id,
      bookTitle: book.title,
      authorId: book.authorId,
      reviewerId: currentUser.uid,
      reviewerName: (currentUser.displayName || 'Community Reader').slice(0, FIELD_LIMITS.displayNameMax),
      stars: intStars,
      craftFocus,
      visibility: 'public',
      createdAt: serverTimestamp(),
    };
    if (trimmedReview.length > 0) {
      ratingPayload.reviewText = trimmedReview;
    }

    batch.set(doc(db, 'ratings', ratingId), ratingPayload);
    batch.update(doc(db, 'books', book.id), {
      ratingSum: nextSum,
      ratingCount: nextCount,
      averageRating: nextAvg,
      lastRatingId: ratingId,
      updatedAt: serverTimestamp(),
    });

    try {
      await batch.commit();
      setReviewText('');
      setRatingFeedback({
        type: 'ok',
        text: `Your ${intStars}-star review has been published.`,
      });
      onNotifyAuthorEmail({
        kind: 'rating',
        eventKey: `rating_${ratingId}`,
        authorId: book.authorId,
        authorPenName: book.authorPenName,
        recipientLabel: `${book.authorPenName} (Author)`,
        bookTitle: book.title,
        reviewerName: (currentUser.displayName || 'Community Reader').slice(0, FIELD_LIMITS.displayNameMax),
        stars: intStars,
        craftFocus,
        reviewText: trimmedReview || undefined,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `ratings/${ratingId}`);
    } finally {
      setRatingBusy(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 md:py-12 space-y-8">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-950 transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Manuscript Catalog
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        {/* Left Column: Cover Art, Budget, & Contiguous Donation Module */}
        <aside className="lg:col-span-5 lg:sticky lg:top-24 space-y-6">
          <div className="bg-white border border-[#E6E3DC] rounded-xl overflow-hidden">
            <div className="aspect-[3/4] w-full bg-[#F1EFE9] border-b border-[#E6E3DC]">
              <CoverImage
                src={book.coverImageUrl}
                alt={`Cover for ${book.title}`}
                title={book.title}
                authorPenName={book.authorPenName}
                tone={book.coverTone}
                className="w-full h-full"
              />
            </div>

            <div className="p-6 space-y-5">
              {/* Funding Progress */}
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-2xl font-semibold text-zinc-900 tabular-nums">
                    ${book.raisedUsd.toLocaleString()}
                  </span>
                  <span className="text-xs font-mono text-zinc-500 tabular-nums">
                    of ${book.goalUsd.toLocaleString()} goal ({pct}%)
                  </span>
                </div>
                <div className="h-2 w-full bg-[#EFECE5] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#1E3A8A] rounded-full transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-xs text-zinc-600 flex items-center justify-between pt-1">
                  <span className="font-mono tabular-nums">
                    {book.donorCount} {book.donorCount === 1 ? 'reader backer' : 'reader backers'}
                  </span>
                  <span className="font-medium text-zinc-800">
                    {book.status === 'published'
                      ? 'Published'
                      : book.status === 'funded'
                        ? 'Publishing Goal Reached'
                        : 'Seeking Publishing Support'}
                  </span>
                </p>
              </div>

              {/* Publishing Budget Allocation */}
              <div className="pt-4 border-t border-[#E6E3DC] space-y-2">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">
                  Publishing Cost Breakdown
                </p>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <p className="text-zinc-500">Copy Editing</p>
                    <p className="font-mono font-semibold text-zinc-900 tabular-nums mt-0.5">
                      ${book.editingCostUsd.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Cover &amp; Layout</p>
                    <p className="font-mono font-semibold text-zinc-900 tabular-nums mt-0.5">
                      ${book.designCostUsd.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Print &amp; ISBN</p>
                    <p className="font-mono font-semibold text-zinc-900 tabular-nums mt-0.5">
                      ${book.printingCostUsd.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              {/* Donate to Publish Form */}
              <div className="pt-5 border-t border-[#E6E3DC] space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg font-semibold text-zinc-900">
                    Donate to Publish
                  </h3>
                  <span className="text-xs text-zinc-500">100% goes to the author’s press run</span>
                </div>

                {!stripeConfig.configured && (
                  <p className="text-[11px] text-zinc-500 bg-[#FAF9F6] border border-[#E6E3DC] rounded-lg px-3 py-2">
                    Preview pledge mode active. Configure <span className="font-mono">STRIPE_SECRET_KEY</span> &amp;{' '}
                    <span className="font-mono">STRIPE_PUBLISHABLE_KEY</span> in Secrets for live Stripe payments.
                  </p>
                )}

                {pendingClientSecret && stripeConfig.publishableKey ? (
                  <StripePaymentForm
                    publishableKey={stripeConfig.publishableKey}
                    clientSecret={pendingClientSecret}
                    amountLabel={`$${pendingAmountUsd.toLocaleString()} USD`}
                    submitLabel={`Confirm $${pendingAmountUsd.toLocaleString()} Donation`}
                    onSuccess={handleStripeDonationSuccess}
                    onCancel={() => {
                      setPendingClientSecret(null);
                      setPendingAmountUsd(0);
                    }}
                  />
                ) : (
                  <form onSubmit={handleDonate} className="space-y-4">
                    <div className="grid grid-cols-4 gap-2">
                      {PRESET_AMOUNTS.map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => handleSelectPreset(amt)}
                          className={`min-h-[40px] rounded-lg border text-sm font-mono font-medium transition-colors cursor-pointer tabular-nums ${
                            amountUsd === amt && Number(customAmount) === amt
                              ? 'bg-[#1E3A8A] border-[#1E3A8A] text-white'
                              : 'bg-[#FAF9F6] border-[#D8D3C8] text-zinc-800 hover:border-zinc-400'
                          }`}
                        >
                          ${amt}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label htmlFor="donate-amount" className="block text-xs text-zinc-600">
                          Amount (USD)
                        </label>
                        <input
                          id="donate-amount"
                          type="number"
                          min={FIELD_LIMITS.donationMin}
                          max={FIELD_LIMITS.donationMax}
                          step="1"
                          value={customAmount}
                          onChange={(e) => {
                            setCustomAmount(e.target.value);
                            setAmountUsd(Number(e.target.value) || 0);
                          }}
                          className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-[#D8D3C8] bg-white font-mono text-sm text-zinc-900 tabular-nums focus:outline-none focus:border-[#1E3A8A]"
                        />
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="donate-method" className="block text-xs text-zinc-600">
                          Payment Method
                        </label>
                        <select
                          id="donate-method"
                          value={paymentMethod}
                          onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                          className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-[#D8D3C8] bg-white text-sm text-zinc-900 focus:outline-none focus:border-[#1E3A8A]"
                        >
                          {DONATION_METHODS.map((m) => (
                            <option key={m} value={m}>
                              {PAYMENT_METHOD_LABELS[m]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="donate-note" className="block text-xs text-zinc-600">
                        Encouragement Note (optional)
                      </label>
                      <input
                        id="donate-note"
                        type="text"
                        maxLength={FIELD_LIMITS.donationMessageMax}
                        value={donorMessage}
                        onChange={(e) => setDonorMessage(e.target.value)}
                        placeholder="Rooting for your first print run..."
                        className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-[#D8D3C8] bg-white text-sm text-zinc-900 focus:outline-none focus:border-[#1E3A8A]"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={donating}
                      className="w-full min-h-[44px] px-4 py-2.5 rounded-lg bg-[#1E3A8A] text-white text-sm font-medium inline-flex items-center justify-center gap-2 hover:bg-[#1E40AF] transition-colors cursor-pointer disabled:opacity-60"
                    >
                      <Heart className="w-4 h-4" />
                      {currentUser
                        ? donating
                          ? 'Preparing Checkout...'
                          : stripeConfig.configured
                            ? `Donate $${Number(customAmount) || 0} via Stripe`
                            : `Donate $${Number(customAmount) || 0} to Publish`
                        : 'Sign In to Donate'}
                    </button>
                  </form>
                )}

                {donationFeedback && (
                  <p
                    role="status"
                    className={`text-xs p-3 rounded-lg ${
                      donationFeedback.type === 'ok'
                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                        : 'bg-red-50 border border-red-200 text-red-900'
                    }`}
                  >
                    {donationFeedback.text}
                  </p>
                )}
              </div>
            </div>
          </div>
        </aside>

        {/* Right Column: Editorial Excerpt, Author Bio + Follow, & Ratings/Critiques */}
        <div className="lg:col-span-7 space-y-10">
          {/* Book Header */}
          <header className="space-y-4 border-b border-[#E6E3DC] pb-8">
            <p className="text-xs text-zinc-500 flex flex-wrap items-center gap-2">
              <span>{book.genre}</span>
              <span aria-hidden="true">·</span>
              <span>{book.format}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{book.pageCount} pages</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 font-medium text-zinc-800">
                <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                <span className="font-mono tabular-nums">
                  {book.ratingCount > 0 ? book.averageRating.toFixed(1) : 'Unrated'}
                </span>
                <span className="text-zinc-500 font-normal tabular-nums">
                  ({book.ratingCount} {book.ratingCount === 1 ? 'rating' : 'ratings'})
                </span>
              </span>
            </p>

            <h1 className="font-display text-3xl md:text-4xl font-bold text-zinc-900 leading-tight text-balance">
              {book.title}
            </h1>
            {book.subtitle && (
              <p className="font-display italic text-lg text-zinc-600">{book.subtitle}</p>
            )}

            <p className="text-sm text-zinc-700 leading-relaxed max-w-2xl">{book.pitch}</p>

            <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-[#E6E3DC] rounded-xl p-4">
              <div className="text-sm text-zinc-600 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectAuthor(book.authorId, book.authorPenName)}
                    className="font-semibold text-zinc-900 hover:text-[#1E3A8A] underline underline-offset-4 transition-colors cursor-pointer"
                  >
                    By {book.authorPenName}
                  </button>
                  <span className="text-xs font-mono text-zinc-500 tabular-nums">
                    · {followerCount} {followerCount === 1 ? 'follower' : 'followers'}
                  </span>
                </div>
                <p className="text-xs text-zinc-600 leading-relaxed">{book.authorBio}</p>
              </div>

              {!isAuthorSelf && (
                <button
                  type="button"
                  disabled={followBusy}
                  onClick={() => onToggleFollowAuthor(book.authorId, book.authorPenName)}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60 ${
                    isFollowingAuthor
                      ? 'border border-[#1E3A8A] bg-[#EFF3FF] text-[#1E3A8A] hover:bg-[#E0E7FF]'
                      : 'border border-[#D8D3C8] bg-[#FAF9F6] text-zinc-900 hover:border-[#1E3A8A]'
                  }`}
                >
                  {isFollowingAuthor ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Following
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-3.5 h-3.5" />
                      Follow Author
                    </>
                  )}
                </button>
              )}
            </div>
          </header>

          {/* Opening Chapter / Manuscript Excerpt */}
          <section className="space-y-4 border-b border-[#E6E3DC] pb-10">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">
                  Sample Manuscript Excerpt
                </p>
                <h2 className="font-display text-2xl font-semibold text-zinc-900 mt-1">
                  {book.excerptTitle}
                </h2>
              </div>
            </div>

            <div className="bg-white border border-[#E6E3DC] rounded-xl p-6 md:p-8">
              <div className="max-w-[65ch] space-y-4 text-[15.5px] leading-[1.75] text-zinc-800 whitespace-pre-line">
                {book.excerptText}
              </div>
            </div>
          </section>

          {/* Rate & Critique Author's Work */}
          <section className="space-y-6 border-b border-[#E6E3DC] pb-10">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">
                Reader Evaluation
              </p>
              <h2 className="font-display text-2xl font-semibold text-zinc-900 mt-1">
                Rate &amp; Review This Manuscript
              </h2>
            </div>

            {isAuthorSelf ? (
              <div className="bg-white border border-[#E6E3DC] rounded-xl p-5 flex items-center gap-3 text-sm text-zinc-600">
                <Lock className="w-4 h-4 text-zinc-400 shrink-0" />
                <span>You are the author of this manuscript, so community ratings come exclusively from readers.</span>
              </div>
            ) : userExistingRating ? (
              <div className="bg-white border border-[#E6E3DC] rounded-xl p-5 space-y-1.5">
                <p className="text-sm font-semibold text-zinc-900">
                  You rated this manuscript {userExistingRating.stars} out of 5 stars
                </p>
                <p className="text-xs text-zinc-500">
                  Focus: {userExistingRating.craftFocus}
                </p>
                {userExistingRating.reviewText && (
                  <p className="text-sm text-zinc-700 pt-1">{userExistingRating.reviewText}</p>
                )}
              </div>
            ) : (
              <form
                onSubmit={handleSubmitRating}
                className="bg-white border border-[#E6E3DC] rounded-xl p-6 space-y-5"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1.5">
                    <span className="block text-xs font-medium text-zinc-700">Your Star Rating</span>
                    <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Star rating">
                      {[1, 2, 3, 4, 5].map((value) => {
                        const active = value <= (hoverStars || stars);
                        return (
                          <button
                            key={value}
                            type="button"
                            onMouseEnter={() => setHoverStars(value)}
                            onMouseLeave={() => setHoverStars(0)}
                            onClick={() => setStars(value)}
                            aria-label={`${value} star${value > 1 ? 's' : ''}`}
                            className="p-1.5 rounded-md hover:bg-[#FAF9F6] transition-colors cursor-pointer"
                          >
                            <Star
                              className={`w-6 h-6 transition-colors ${
                                active ? 'fill-amber-500 text-amber-500' : 'text-zinc-300'
                              }`}
                            />
                          </button>
                        );
                      })}
                      <span className="ml-2 font-mono text-sm font-medium text-zinc-700 tabular-nums">
                        {stars}/5
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5 min-w-[200px]">
                    <label htmlFor="craft-focus" className="block text-xs font-medium text-zinc-700">
                      Strongest Craft Element
                    </label>
                    <select
                      id="craft-focus"
                      value={craftFocus}
                      onChange={(e) => setCraftFocus(e.target.value as CraftFocus)}
                      className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-[#D8D3C8] bg-white text-sm text-zinc-900 focus:outline-none focus:border-[#1E3A8A]"
                    >
                      {CRAFT_FOCUSES.map((cf) => (
                        <option key={cf} value={cf}>
                          {cf}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="review-text" className="block text-xs font-medium text-zinc-700">
                    Constructive Critique (optional, up to {FIELD_LIMITS.reviewTextMax} characters)
                  </label>
                  <textarea
                    id="review-text"
                    rows={3}
                    maxLength={FIELD_LIMITS.reviewTextMax}
                    value={reviewText}
                    onChange={(e) => setReviewText(e.target.value)}
                    placeholder="Share what stood out in the voice, pacing, or worldbuilding..."
                    className="w-full px-3.5 py-2.5 rounded-lg border border-[#D8D3C8] bg-white text-sm text-zinc-900 focus:outline-none focus:border-[#1E3A8A]"
                  />
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs text-zinc-500">
                    One verified rating per reader helps debut authors earn editorial visibility.
                  </span>
                  <button
                    type="submit"
                    disabled={ratingBusy}
                    className="min-h-[42px] px-5 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                  >
                    {currentUser
                      ? ratingBusy
                        ? 'Publishing...'
                        : 'Submit Rating'
                      : 'Sign In to Rate'}
                  </button>
                </div>

                {ratingFeedback && (
                  <p
                    role="status"
                    className={`text-xs p-3 rounded-lg ${
                      ratingFeedback.type === 'ok'
                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                        : 'bg-red-50 border border-red-200 text-red-900'
                    }`}
                  >
                    {ratingFeedback.text}
                  </p>
                )}
              </form>
            )}

            {/* Existing Reader Reviews */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-zinc-900">
                Community Reviews ({ratings.length})
              </h3>
              {loadingCommunity ? (
                <p className="text-sm text-zinc-500">Loading reader reviews...</p>
              ) : ratings.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  No written reviews yet. Read the opening excerpt above and leave the first rating.
                </p>
              ) : (
                <div className="divide-y divide-[#E6E3DC] bg-white border border-[#E6E3DC] rounded-xl">
                  {ratings.map((r) => (
                    <div key={r.id} className="p-5 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-semibold text-zinc-900">{r.reviewerName}</span>
                          <span aria-hidden="true" className="text-zinc-400">·</span>
                          <span className="text-xs text-zinc-500">{r.craftFocus}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`w-3.5 h-3.5 ${
                                i < r.stars ? 'fill-amber-500 text-amber-500' : 'text-zinc-200'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                      {r.reviewText && (
                        <p className="text-sm text-zinc-700 leading-relaxed">{r.reviewText}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Supporter Wall */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-zinc-900">
              Recent Patron Pledges ({donations.length})
            </h3>
            {donations.length === 0 ? (
              <p className="text-sm text-zinc-500">
                Be the first patron to back this debut print run.
              </p>
            ) : (
              <div className="divide-y divide-[#E6E3DC] bg-white border border-[#E6E3DC] rounded-xl">
                {donations.map((d) => (
                  <div key={d.id} className="p-4 flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-zinc-900">
                        {d.donorName}{' '}
                        <span className="text-xs font-normal text-zinc-500">
                          via {d.stripePaymentIntentId ? 'Stripe' : PAYMENT_METHOD_LABELS[d.paymentMethod]}
                        </span>
                      </p>
                      {d.message && <p className="text-sm text-zinc-600">{d.message}</p>}
                    </div>
                    <span className="font-mono text-sm font-semibold text-zinc-900 tabular-nums shrink-0">
                      +${d.amountUsd.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
