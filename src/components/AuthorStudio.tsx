import React, { useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  ExternalLink,
  Lock,
  Mail,
  Pencil,
  Plus,
  Send,
  Star,
  Trash2,
  Upload,
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { COVER_PRESETS } from '../data/showcaseBooks';
import {
  AuthorSubscription,
  AuthorSubscriptionPayment,
  BOOK_FORMATS,
  BOOK_GENRES,
  BookCampaign,
  BookFormat,
  BookGenre,
  CoverTone,
  FIELD_LIMITS,
} from '../types';
import { AuthorSubscriptionCard } from './AuthorSubscriptionCard';
import { AuthorEditDrawer } from './AuthorEditDrawer';
import { CoverImage } from './CoverImage';
import { AuthorEmailStatus } from '../utils/emailNotifications';
import { StripeConfigResponse } from '../utils/stripeClient';
import { uploadCoverImageToStorage } from '../utils/coverUpload';

interface AuthorStudioProps {
  currentUser: User | null;
  subscription: AuthorSubscription | null;
  subscriptionPayments: AuthorSubscriptionPayment[];
  myBooks: BookCampaign[];
  stripeConfig: StripeConfigResponse;
  emailStatus: AuthorEmailStatus | null;
  onSendTestEmail: () => Promise<{ delivered: boolean; reason: string | null }>;
  onRequestSignIn: () => void;
  onSelectBook: (book: BookCampaign) => void;
  onViewPublicAuthorPage: (authorId: string, authorPenName: string) => void;
}

export const AuthorStudio: React.FC<AuthorStudioProps> = ({
  currentUser,
  subscription,
  subscriptionPayments,
  myBooks,
  stripeConfig,
  emailStatus,
  onSendTestEmail,
  onRequestSignIn,
  onSelectBook,
  onViewPublicAuthorPage,
}) => {
  const [penName, setPenName] = useState(
    subscription?.penName || currentUser?.displayName || ''
  );
  const [authorBio, setAuthorBio] = useState('');
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [genre, setGenre] = useState<BookGenre>('Literary Fiction');
  const [format, setFormat] = useState<BookFormat>('Paperback & eBook');
  const [pageCount, setPageCount] = useState<string>('240');
  const [pitch, setPitch] = useState('');
  const [excerptTitle, setExcerptTitle] = useState('Chapter One');
  const [excerptText, setExcerptText] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState(COVER_PRESETS[0].id);
  const [customCoverUrl, setCustomCoverUrl] = useState('');
  const [editingCost, setEditingCost] = useState<string>('800');
  const [designCost, setDesignCost] = useState<string>('450');
  const [printingCost, setPrintingCost] = useState<string>('750');

  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [publishing, setPublishing] = useState(false);
  const [formFeedback, setFormFeedback] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [busyBookId, setBusyBookId] = useState<string | null>(null);
  const [editingBook, setEditingBook] = useState<BookCampaign | null>(null);

  const [testEmailBusy, setTestEmailBusy] = useState(false);
  const [testEmailNotice, setTestEmailNotice] = useState<{ type: 'ok' | 'info' | 'error'; text: string } | null>(null);

  if (!currentUser) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-16">
        <div className="bg-white border border-[#E6E3DC] rounded-xl p-8 md:p-12 text-center space-y-5">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">
            Author Studio
          </p>
          <h1 className="font-display text-3xl font-bold text-zinc-900 text-balance">
            Post your debut manuscript and raise reader patronage
          </h1>
          <p className="text-sm text-zinc-600 max-w-xl mx-auto leading-relaxed">
            Sign in with your Google account to activate your{' '}
            <span className="font-mono font-semibold text-zinc-900">$1/month</span> author
            publishing membership, upload your opening chapter, and receive ratings and publishing donations.
          </p>
          <button
            type="button"
            onClick={onRequestSignIn}
            className="min-h-[44px] px-6 py-2.5 rounded-lg bg-[#1E3A8A] text-white text-sm font-medium hover:bg-[#1E40AF] transition-colors cursor-pointer"
          >
            Sign In to Open Author Studio
          </button>
        </div>
      </div>
    );
  }

  const isSubscriptionActive = Boolean(
    subscription &&
      subscription.status === 'active' &&
      subscription.paidUntilMs > Date.now()
  );

  const totalGoalUsd =
    (Number(editingCost) || 0) + (Number(designCost) || 0) + (Number(printingCost) || 0);

  const activePreset = COVER_PRESETS.find((p) => p.id === selectedPresetId) || COVER_PRESETS[0];
  const resolvedCoverUrl = customCoverUrl.trim() || activePreset.imageUrl;
  const resolvedCoverTone: CoverTone = activePreset.tone;

  const handleCoverFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploadError(null);
    setUploadProgress(0);
    try {
      const downloadUrl = await uploadCoverImageToStorage(currentUser.uid, file, (pct) =>
        setUploadProgress(pct)
      );
      setCustomCoverUrl(downloadUrl);
      setUploadProgress(null);
    } catch (err) {
      setUploadProgress(null);
      setUploadError(err instanceof Error ? err.message : 'Unable to upload cover image.');
    }
  };

  const handleTriggerTestEmail = async () => {
    setTestEmailBusy(true);
    setTestEmailNotice(null);
    try {
      const result = await onSendTestEmail();
      if (result.delivered) {
        setTestEmailNotice({
          type: 'ok',
          text: `Test email sent to ${currentUser.email || 'your verified inbox'}.`,
        });
      } else if (result.reason === 'email_provider_not_configured') {
        setTestEmailNotice({
          type: 'info',
          text: 'RESEND_API_KEY is not configured in Settings → Secrets yet. Notifications appear as local previews until added.',
        });
      } else {
        setTestEmailNotice({
          type: 'error',
          text: result.reason || 'Unable to send test email.',
        });
      }
    } finally {
      setTestEmailBusy(false);
    }
  };

  const handleCreateBook = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormFeedback(null);

    if (!isSubscriptionActive) {
      setFormFeedback({
        type: 'error',
        text: 'Please activate your $1/month author subscription above before posting a manuscript.',
      });
      return;
    }

    const cleanPen = (penName || subscription?.penName || currentUser.displayName || '').trim();
    const cleanBio = authorBio.trim();
    const cleanTitle = title.trim();
    const cleanSubtitle = subtitle.trim();
    const cleanPitch = pitch.trim();
    const cleanExcerptTitle = excerptTitle.trim();
    const cleanExcerptText = excerptText.trim();
    const pages = Math.round(Number(pageCount));
    const editUsd = Math.round(Number(editingCost) || 0);
    const desUsd = Math.round(Number(designCost) || 0);
    const printUsd = Math.round(Number(printingCost) || 0);
    const goalUsd = editUsd + desUsd + printUsd;

    if (cleanPen.length < FIELD_LIMITS.penNameMin || cleanPen.length > FIELD_LIMITS.penNameMax) {
      setFormFeedback({ type: 'error', text: `Pen name must be ${FIELD_LIMITS.penNameMin}-${FIELD_LIMITS.penNameMax} characters.` });
      return;
    }
    if (cleanBio.length < FIELD_LIMITS.authorBioMin || cleanBio.length > FIELD_LIMITS.authorBioMax) {
      setFormFeedback({ type: 'error', text: `Author bio must be ${FIELD_LIMITS.authorBioMin}-${FIELD_LIMITS.authorBioMax} characters.` });
      return;
    }
    if (cleanTitle.length < FIELD_LIMITS.titleMin || cleanTitle.length > FIELD_LIMITS.titleMax) {
      setFormFeedback({ type: 'error', text: `Book title must be ${FIELD_LIMITS.titleMin}-${FIELD_LIMITS.titleMax} characters.` });
      return;
    }
    if (pages < FIELD_LIMITS.pageCountMin || pages > FIELD_LIMITS.pageCountMax || !Number.isFinite(pages)) {
      setFormFeedback({ type: 'error', text: `Page count must be between ${FIELD_LIMITS.pageCountMin} and ${FIELD_LIMITS.pageCountMax}.` });
      return;
    }
    if (cleanPitch.length < FIELD_LIMITS.pitchMin || cleanPitch.length > FIELD_LIMITS.pitchMax) {
      setFormFeedback({ type: 'error', text: `Synopsis pitch must be ${FIELD_LIMITS.pitchMin}-${FIELD_LIMITS.pitchMax} characters.` });
      return;
    }
    if (cleanExcerptTitle.length < FIELD_LIMITS.excerptTitleMin || cleanExcerptTitle.length > FIELD_LIMITS.excerptTitleMax) {
      setFormFeedback({ type: 'error', text: `Chapter heading must be ${FIELD_LIMITS.excerptTitleMin}-${FIELD_LIMITS.excerptTitleMax} characters.` });
      return;
    }
    if (cleanExcerptText.length < FIELD_LIMITS.excerptTextMin || cleanExcerptText.length > FIELD_LIMITS.excerptTextMax) {
      setFormFeedback({ type: 'error', text: `Sample chapter excerpt must be between ${FIELD_LIMITS.excerptTextMin} and ${FIELD_LIMITS.excerptTextMax} characters.` });
      return;
    }
    if (goalUsd < FIELD_LIMITS.goalUsdMin || goalUsd > FIELD_LIMITS.goalUsdMax) {
      setFormFeedback({ type: 'error', text: `Total publishing goal must be between $${FIELD_LIMITS.goalUsdMin} and $${FIELD_LIMITS.goalUsdMax.toLocaleString()}.` });
      return;
    }
    if (resolvedCoverUrl.length < FIELD_LIMITS.coverImageUrlMin || resolvedCoverUrl.length > FIELD_LIMITS.coverImageUrlMax) {
      setFormFeedback({ type: 'error', text: `Cover image URL must be between ${FIELD_LIMITS.coverImageUrlMin} and ${FIELD_LIMITS.coverImageUrlMax} characters.` });
      return;
    }

    const bookId = `book_${currentUser.uid.slice(0, 10)}_${Date.now()}`;
    const payload: Record<string, unknown> = {
      id: bookId,
      authorId: currentUser.uid,
      authorPenName: cleanPen,
      authorBio: cleanBio,
      title: cleanTitle,
      genre,
      format,
      pageCount: pages,
      pitch: cleanPitch,
      excerptTitle: cleanExcerptTitle,
      excerptText: cleanExcerptText,
      coverImageUrl: resolvedCoverUrl,
      coverTone: resolvedCoverTone,
      goalUsd,
      raisedUsd: 0,
      donorCount: 0,
      editingCostUsd: editUsd,
      designCostUsd: desUsd,
      printingCostUsd: printUsd,
      ratingSum: 0,
      ratingCount: 0,
      averageRating: 0,
      visibility: 'public',
      status: 'seeking_funding',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (cleanSubtitle.length > 0) {
      payload.subtitle = cleanSubtitle.slice(0, FIELD_LIMITS.subtitleMax);
    }

    setPublishing(true);
    try {
      await setDoc(doc(db, 'books', bookId), payload);
      setTitle('');
      setSubtitle('');
      setPitch('');
      setExcerptText('');
      setAuthorBio('');
      setCustomCoverUrl('');
      setFormFeedback({
        type: 'ok',
        text: `"${cleanTitle}" is now live in the catalog! Readers can read your excerpt, rate your prose, and donate toward your publishing goal.`,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `books/${bookId}`);
    } finally {
      setPublishing(false);
    }
  };

  const handleMarkPublished = async (book: BookCampaign) => {
    setBusyBookId(book.id);
    try {
      await updateDoc(doc(db, 'books', book.id), {
        status: 'published',
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `books/${book.id}`);
    } finally {
      setBusyBookId(null);
    }
  };

  const handleDeleteDraft = async (book: BookCampaign) => {
    if (book.donorCount > 0 || book.ratingCount > 0) return;
    setBusyBookId(book.id);
    try {
      await deleteDoc(doc(db, 'books', book.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `books/${book.id}`);
    } finally {
      setBusyBookId(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#E6E3DC] pb-6">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">
            Author Studio
          </p>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-zinc-900">
            Manage Membership &amp; Publish Your Manuscript
          </h1>
          <p className="text-sm text-zinc-600 max-w-2xl">
            Signed in as <span className="font-medium text-zinc-900">{currentUser.displayName}</span>.
            Activate your $1/month membership below, post your book excerpt, and track live donations and reader ratings.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            onViewPublicAuthorPage(
              currentUser.uid,
              subscription?.penName || currentUser.displayName || 'Author'
            )
          }
          className="min-h-[40px] px-4 py-2 rounded-lg border border-[#D8D3C8] bg-white text-xs font-medium text-zinc-800 inline-flex items-center gap-1.5 hover:bg-zinc-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          View Public Author Page
        </button>
      </div>

      {/* $1/month Author Subscription Panel */}
      <AuthorSubscriptionCard
        currentUser={currentUser}
        defaultPenName={currentUser.displayName || ''}
        subscription={subscription}
        payments={subscriptionPayments}
        stripeConfig={stripeConfig}
      />

      {/* Author Email Notifications Status & Test */}
      <section className="bg-white border border-[#E6E3DC] rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">
            <Mail className="w-3.5 h-3.5 text-[#1E3A8A]" />
            Author Email Notifications
          </div>
          <p className="text-sm font-medium text-zinc-900">
            {emailStatus?.emailConfigured
              ? `Live inbox delivery active for ${currentUser.email}`
              : `Email delivery ready for ${currentUser.email || 'your verified inbox'}`}
          </p>
          <p className="text-xs text-zinc-600">
            {emailStatus?.emailConfigured
              ? 'Readers triggering donations or 1–5 star reviews automatically send an email via Resend.'
              : 'Add RESEND_API_KEY (and optional RESEND_FROM_EMAIL) in Settings → Secrets to send live emails.'}
          </p>
          {testEmailNotice && (
            <p
              role="status"
              className={`text-xs pt-1 ${
                testEmailNotice.type === 'ok'
                  ? 'text-emerald-800'
                  : testEmailNotice.type === 'error'
                    ? 'text-red-700'
                    : 'text-zinc-700'
              }`}
            >
              {testEmailNotice.text}
            </p>
          )}
        </div>

        <button
          type="button"
          disabled={testEmailBusy}
          onClick={handleTriggerTestEmail}
          className="min-h-[40px] px-4 py-2 rounded-lg border border-[#D8D3C8] bg-[#FAF9F6] text-xs font-medium text-zinc-900 inline-flex items-center gap-1.5 hover:bg-zinc-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
        >
          <Send className="w-3.5 h-3.5" />
          {testEmailBusy ? 'Sending...' : 'Send Test Email'}
        </button>
      </section>

      {/* Submit New Book Form */}
      <section className="bg-white border border-[#E6E3DC] rounded-xl p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E6E3DC] pb-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">
              New Manuscript Submission
            </p>
            <h2 className="font-display text-2xl font-semibold text-zinc-900 mt-0.5">
              Post a Book for Funding &amp; Ratings
            </h2>
          </div>
          {!isSubscriptionActive && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800">
              <Lock className="w-3.5 h-3.5" />
              Requires active $1/mo membership above
            </span>
          )}
        </div>

        <form onSubmit={handleCreateBook} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label htmlFor="book-title" className="block text-xs font-medium text-zinc-700">
                Book Title
              </label>
              <input
                id="book-title"
                type="text"
                required
                maxLength={FIELD_LIMITS.titleMax}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Letters from the Harbor"
                className="w-full min-h-[42px] px-3.5 py-2 rounded-lg border border-[#D8D3C8] bg-white text-sm text-zinc-900 focus:outline-none focus:border-[#1E3A8A]"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="book-subtitle" className="block text-xs font-medium text-zinc-700">
                Subtitle (optional)
              </label>
              <input
                id="book-subtitle"
                type="text"
                maxLength={FIELD_LIMITS.subtitleMax}
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder="e.g., A debut novel of coastal memory"
                className="w-full min-h-[42px] px-3.5 py-2 rounded-lg border border-[#D8D3C8] bg-white text-sm text-zinc-900 focus:outline-none focus:border-[#1E3A8A]"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="author-pen" className="block text-xs font-medium text-zinc-700">
                Author Pen Name
              </label>
              <input
                id="author-pen"
                type="text"
                required
                maxLength={FIELD_LIMITS.penNameMax}
                value={penName}
                onChange={(e) => setPenName(e.target.value)}
                placeholder="Your public author name"
                className="w-full min-h-[42px] px-3.5 py-2 rounded-lg border border-[#D8D3C8] bg-white text-sm text-zinc-900 focus:outline-none focus:border-[#1E3A8A]"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5 col-span-2">
                <label htmlFor="book-genre" className="block text-xs font-medium text-zinc-700">
                  Genre
                </label>
                <select
                  id="book-genre"
                  value={genre}
                  onChange={(e) => setGenre(e.target.value as BookGenre)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-[#D8D3C8] bg-white text-sm text-zinc-900 focus:outline-none focus:border-[#1E3A8A]"
                >
                  {BOOK_GENRES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="book-pages" className="block text-xs font-medium text-zinc-700">
                  Pages
                </label>
                <input
                  id="book-pages"
                  type="number"
                  min={FIELD_LIMITS.pageCountMin}
                  max={FIELD_LIMITS.pageCountMax}
                  required
                  value={pageCount}
                  onChange={(e) => setPageCount(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-[#D8D3C8] bg-white font-mono text-sm text-zinc-900 tabular-nums focus:outline-none focus:border-[#1E3A8A]"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label htmlFor="author-bio" className="block text-xs font-medium text-zinc-700">
                Debut Author Bio (min {FIELD_LIMITS.authorBioMin} chars)
              </label>
              <textarea
                id="author-bio"
                rows={2}
                required
                maxLength={FIELD_LIMITS.authorBioMax}
                value={authorBio}
                onChange={(e) => setAuthorBio(e.target.value)}
                placeholder="Tell readers a little about yourself and what inspired this book..."
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#D8D3C8] bg-white text-sm text-zinc-900 focus:outline-none focus:border-[#1E3A8A]"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="book-pitch" className="block text-xs font-medium text-zinc-700">
                Short Synopsis / Pitch (max {FIELD_LIMITS.pitchMax} chars)
              </label>
              <textarea
                id="book-pitch"
                rows={2}
                required
                maxLength={FIELD_LIMITS.pitchMax}
                value={pitch}
                onChange={(e) => setPitch(e.target.value)}
                placeholder="A compelling two-sentence hook for readers..."
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#D8D3C8] bg-white text-sm text-zinc-900 focus:outline-none focus:border-[#1E3A8A]"
              />
            </div>
          </div>

          {/* Publishing Budget & Format */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 bg-[#FAF9F6] border border-[#E6E3DC] rounded-lg p-4">
            <div className="space-y-1">
              <label htmlFor="book-format" className="block text-xs font-medium text-zinc-700">
                Target Edition
              </label>
              <select
                id="book-format"
                value={format}
                onChange={(e) => setFormat(e.target.value as BookFormat)}
                className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-[#D8D3C8] bg-white text-sm text-zinc-900 focus:outline-none focus:border-[#1E3A8A]"
              >
                {BOOK_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="cost-editing" className="block text-xs font-medium text-zinc-700">
                Editing ($)
              </label>
              <input
                id="cost-editing"
                type="number"
                min={0}
                max={50000}
                value={editingCost}
                onChange={(e) => setEditingCost(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-[#D8D3C8] bg-white font-mono text-sm tabular-nums focus:outline-none focus:border-[#1E3A8A]"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="cost-design" className="block text-xs font-medium text-zinc-700">
                Design ($)
              </label>
              <input
                id="cost-design"
                type="number"
                min={0}
                max={50000}
                value={designCost}
                onChange={(e) => setDesignCost(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-[#D8D3C8] bg-white font-mono text-sm tabular-nums focus:outline-none focus:border-[#1E3A8A]"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="cost-printing" className="block text-xs font-medium text-zinc-700">
                Printing &amp; ISBN ($)
              </label>
              <input
                id="cost-printing"
                type="number"
                min={0}
                max={50000}
                value={printingCost}
                onChange={(e) => setPrintingCost(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-[#D8D3C8] bg-white font-mono text-sm tabular-nums focus:outline-none focus:border-[#1E3A8A]"
              />
            </div>
            <div className="flex flex-col justify-center">
              <span className="text-xs text-zinc-500">Total Goal</span>
              <span className="font-mono text-lg font-semibold text-zinc-900 tabular-nums">
                ${totalGoalUsd.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Cover Artwork Picker & Direct Device Upload */}
          <div className="space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <span className="text-xs font-medium text-zinc-700">
                Select Editorial Cover Artwork or Upload Custom Cover
              </span>
              <div className="flex flex-wrap items-center gap-2.5">
                <label className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-[#1E3A8A] text-white text-xs font-medium inline-flex items-center gap-1.5 hover:bg-[#1E40AF] transition-colors cursor-pointer whitespace-nowrap shrink-0">
                  <Upload className="w-3.5 h-3.5" />
                  <span>
                    {uploadProgress !== null
                      ? `Uploading ${uploadProgress}%...`
                      : 'Upload Cover File'}
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={uploadProgress !== null}
                    onChange={handleCoverFileSelect}
                    className="sr-only"
                  />
                </label>
                <input
                  type="text"
                  maxLength={FIELD_LIMITS.coverImageUrlMax}
                  value={customCoverUrl}
                  onChange={(e) => setCustomCoverUrl(e.target.value)}
                  placeholder="Or paste custom cover image URL"
                  className="sm:w-72 min-h-[36px] px-3 py-1.5 rounded-lg border border-[#D8D3C8] bg-white text-xs text-zinc-900 focus:outline-none focus:border-[#1E3A8A]"
                />
              </div>
            </div>

            {uploadError && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {uploadError}
              </p>
            )}

            {customCoverUrl.trim() && (
              <div className="flex items-center gap-4 p-3 rounded-lg border border-[#E6E3DC] bg-[#FAF9F6]">
                <div className="w-14 aspect-[3/4] rounded overflow-hidden border border-[#E6E3DC] shrink-0">
                  <CoverImage
                    src={customCoverUrl.trim()}
                    alt="Uploaded cover preview"
                    title={title || 'Custom Cover'}
                    authorPenName={penName || 'Debut Author'}
                    tone={resolvedCoverTone}
                    className="w-full h-full"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-zinc-800">Custom Cover Selected</p>
                  <p className="text-[11px] text-zinc-500 truncate">{customCoverUrl.trim()}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setCustomCoverUrl('')}
                  className="text-xs font-medium text-zinc-600 hover:text-zinc-900 underline cursor-pointer"
                >
                  Use Preset
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {COVER_PRESETS.map((preset) => {
                const selected = selectedPresetId === preset.id && !customCoverUrl.trim();
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setSelectedPresetId(preset.id);
                      setCustomCoverUrl('');
                    }}
                    className={`text-left rounded-lg border overflow-hidden transition-all cursor-pointer ${
                      selected
                        ? 'border-[#1E3A8A] ring-2 ring-[#1E3A8A]/20'
                        : 'border-[#E6E3DC] hover:border-zinc-400'
                    }`}
                  >
                    <div className="aspect-[3/4] w-full bg-[#F1EFE9]">
                      <CoverImage
                        src={preset.imageUrl}
                        alt={preset.label}
                        title={preset.label}
                        authorPenName={penName || 'Debut Author'}
                        tone={preset.tone}
                        className="w-full h-full"
                      />
                    </div>
                    <p className="px-2.5 py-2 text-xs font-medium text-zinc-800 truncate bg-white">
                      {preset.label}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sample Chapter Excerpt */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="excerpt-title" className="block text-xs font-medium text-zinc-700">
                  Sample Chapter Title
                </label>
                <input
                  id="excerpt-title"
                  type="text"
                  required
                  maxLength={FIELD_LIMITS.excerptTitleMax}
                  value={excerptTitle}
                  onChange={(e) => setExcerptTitle(e.target.value)}
                  className="w-full min-h-[42px] px-3.5 py-2 rounded-lg border border-[#D8D3C8] bg-white text-sm text-zinc-900 focus:outline-none focus:border-[#1E3A8A]"
                />
              </div>
              <div className="md:col-span-2 flex items-end justify-between text-xs text-zinc-500 pb-2">
                <span>Readers evaluate your sample chapter before rating and donating.</span>
                <span className="font-mono tabular-nums">
                  {excerptText.trim().length}/{FIELD_LIMITS.excerptTextMax} chars (min {FIELD_LIMITS.excerptTextMin})
                </span>
              </div>
            </div>

            <textarea
              id="excerpt-text"
              rows={7}
              required
              maxLength={FIELD_LIMITS.excerptTextMax}
              value={excerptText}
              onChange={(e) => setExcerptText(e.target.value)}
              placeholder="Paste your opening chapter or excerpt here (at least 80 characters)..."
              className="w-full px-4 py-3 rounded-lg border border-[#D8D3C8] bg-white text-sm leading-relaxed text-zinc-900 focus:outline-none focus:border-[#1E3A8A]"
            />
          </div>

          {formFeedback && (
            <div
              role="status"
              className={`p-4 rounded-lg text-sm ${
                formFeedback.type === 'ok'
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                  : 'bg-red-50 border border-red-200 text-red-900'
              }`}
            >
              {formFeedback.text}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={publishing || !isSubscriptionActive || uploadProgress !== null}
              className="min-h-[44px] px-6 py-2.5 rounded-lg bg-[#1E3A8A] text-white text-sm font-medium inline-flex items-center gap-2 hover:bg-[#1E40AF] transition-colors cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              {publishing ? 'Publishing Manuscript...' : 'Publish Manuscript to Catalog'}
            </button>
          </div>
        </form>
      </section>

      {/* Author's Posted Books */}
      <section className="space-y-4">
        <h2 className="font-display text-2xl font-semibold text-zinc-900">
          Your Posted Manuscripts ({myBooks.length})
        </h2>

        {myBooks.length === 0 ? (
          <div className="bg-white border border-[#E6E3DC] rounded-xl p-8 text-center text-sm text-zinc-500">
            You haven’t posted any manuscripts yet. Activate your $1/month membership above and submit your first book.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {myBooks.map((book) => {
              const pct = book.goalUsd > 0 ? Math.min(100, Math.round((book.raisedUsd / book.goalUsd) * 100)) : 0;
              return (
                <div
                  key={book.id}
                  className="bg-white border border-[#E6E3DC] rounded-xl p-5 flex gap-5 items-start"
                >
                  <div className="w-24 aspect-[3/4] rounded-lg overflow-hidden border border-[#E6E3DC] shrink-0">
                    <CoverImage
                      src={book.coverImageUrl}
                      alt={book.title}
                      title={book.title}
                      authorPenName={book.authorPenName}
                      tone={book.coverTone}
                      className="w-full h-full"
                    />
                  </div>
                  <div className="flex-1 min-w-0 space-y-2.5">
                    <div>
                      <p className="text-xs text-zinc-500">
                        {book.genre} · {book.status === 'published' ? 'Published' : book.status === 'funded' ? 'Funded' : 'Seeking Funding'}
                        {book.visibility === 'archived' ? ' · Archived' : ''}
                      </p>
                      <h3 className="font-display text-lg font-semibold text-zinc-900 truncate">
                        {book.title}
                      </h3>
                    </div>

                    <div className="text-xs font-mono text-zinc-700 tabular-nums space-y-1">
                      <p>
                        ${book.raisedUsd.toLocaleString()} raised of ${book.goalUsd.toLocaleString()} ({pct}%) · {book.donorCount} backers
                      </p>
                      <p className="inline-flex items-center gap-1">
                        <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                        {book.ratingCount > 0 ? `${book.averageRating.toFixed(1)} (${book.ratingCount} ratings)` : 'No ratings yet'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => onSelectBook(book)}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[#D8D3C8] text-xs font-medium text-zinc-800 inline-flex items-center gap-1.5 hover:bg-zinc-50 cursor-pointer"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        View Page
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingBook(book)}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[#D8D3C8] text-xs font-medium text-zinc-800 inline-flex items-center gap-1.5 hover:bg-zinc-50 cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit Manuscript
                      </button>
                      {book.status === 'funded' && (
                        <button
                          type="button"
                          disabled={busyBookId === book.id}
                          onClick={() => handleMarkPublished(book)}
                          className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#1E3A8A] text-white text-xs font-medium inline-flex items-center gap-1.5 hover:bg-[#1E40AF] cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Mark Published
                        </button>
                      )}
                      {book.donorCount === 0 && book.ratingCount === 0 && (
                        <button
                          type="button"
                          disabled={busyBookId === book.id}
                          onClick={() => handleDeleteDraft(book)}
                          className="min-h-[36px] px-3 py-1.5 rounded-lg border border-red-200 text-red-700 text-xs font-medium inline-flex items-center gap-1.5 hover:bg-red-50 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <AuthorEditDrawer
        book={editingBook}
        uid={currentUser.uid}
        onClose={() => setEditingBook(null)}
        onSaved={(savedTitle) =>
          setFormFeedback({
            type: 'ok',
            text: `Saved revisions to "${savedTitle}".`,
          })
        }
      />
    </div>
  );
};
