import React, { useEffect, useState } from 'react';
import { Lock, Save, Upload, X } from 'lucide-react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { COVER_PRESETS } from '../data/showcaseBooks';
import { uploadCoverImageToStorage } from '../utils/coverUpload';
import {
  BOOK_FORMATS,
  BOOK_GENRES,
  BookCampaign,
  BookFormat,
  BookGenre,
  BookVisibility,
  CoverTone,
  FIELD_LIMITS,
} from '../types';
import { CoverImage } from './CoverImage';

interface AuthorEditDrawerProps {
  book: BookCampaign | null;
  uid: string;
  onClose: () => void;
  onSaved: (bookTitle: string) => void;
}

export const AuthorEditDrawer: React.FC<AuthorEditDrawerProps> = ({
  book,
  uid,
  onClose,
  onSaved,
}) => {
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [authorPenName, setAuthorPenName] = useState('');
  const [authorBio, setAuthorBio] = useState('');
  const [genre, setGenre] = useState<BookGenre>('Literary Fiction');
  const [format, setFormat] = useState<BookFormat>('Paperback & eBook');
  const [pageCount, setPageCount] = useState('240');
  const [pitch, setPitch] = useState('');
  const [excerptTitle, setExcerptTitle] = useState('');
  const [excerptText, setExcerptText] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [coverTone, setCoverTone] = useState<CoverTone>('cobalt');
  const [visibility, setVisibility] = useState<BookVisibility>('public');

  const [editingCost, setEditingCost] = useState('0');
  const [designCost, setDesignCost] = useState('0');
  const [printingCost, setPrintingCost] = useState('0');

  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    if (!book) return;
    setTitle(book.title);
    setSubtitle(book.subtitle || '');
    setAuthorPenName(book.authorPenName);
    setAuthorBio(book.authorBio);
    setGenre(book.genre);
    setFormat(book.format);
    setPageCount(String(book.pageCount));
    setPitch(book.pitch);
    setExcerptTitle(book.excerptTitle);
    setExcerptText(book.excerptText);
    setCoverImageUrl(book.coverImageUrl);
    setCoverTone(book.coverTone);
    setVisibility(book.visibility);
    setEditingCost(String(book.editingCostUsd));
    setDesignCost(String(book.designCostUsd));
    setPrintingCost(String(book.printingCostUsd));
    setUploadProgress(null);
    setUploadError(null);
    setErrorText(null);
  }, [book]);

  if (!book) return null;

  const canEditBudget = book.status !== 'published' && book.donorCount === 0;
  const computedGoal =
    (Number(editingCost) || 0) + (Number(designCost) || 0) + (Number(printingCost) || 0);

  const handleCoverFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploadError(null);
    setUploadProgress(0);
    try {
      const downloadUrl = await uploadCoverImageToStorage(uid, file, (pct) =>
        setUploadProgress(pct)
      );
      setCoverImageUrl(downloadUrl);
      setUploadProgress(null);
    } catch (err) {
      setUploadProgress(null);
      setUploadError(err instanceof Error ? err.message : 'Unable to upload cover image.');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorText(null);

    const cleanTitle = title.trim();
    const cleanSubtitle = subtitle.trim();
    const cleanPen = authorPenName.trim();
    const cleanBio = authorBio.trim();
    const cleanPitch = pitch.trim();
    const cleanExcerptTitle = excerptTitle.trim();
    const cleanExcerptText = excerptText.trim();
    const cleanCoverUrl = coverImageUrl.trim();
    const pages = Math.round(Number(pageCount));

    if (cleanTitle.length < FIELD_LIMITS.titleMin || cleanTitle.length > FIELD_LIMITS.titleMax) {
      setErrorText(`Title must be ${FIELD_LIMITS.titleMin}-${FIELD_LIMITS.titleMax} characters.`);
      return;
    }
    if (cleanPen.length < FIELD_LIMITS.penNameMin || cleanPen.length > FIELD_LIMITS.penNameMax) {
      setErrorText(`Pen name must be ${FIELD_LIMITS.penNameMin}-${FIELD_LIMITS.penNameMax} characters.`);
      return;
    }
    if (cleanBio.length < FIELD_LIMITS.authorBioMin || cleanBio.length > FIELD_LIMITS.authorBioMax) {
      setErrorText(`Author bio must be ${FIELD_LIMITS.authorBioMin}-${FIELD_LIMITS.authorBioMax} characters.`);
      return;
    }
    if (!Number.isFinite(pages) || pages < FIELD_LIMITS.pageCountMin || pages > FIELD_LIMITS.pageCountMax) {
      setErrorText(`Page count must be between ${FIELD_LIMITS.pageCountMin} and ${FIELD_LIMITS.pageCountMax}.`);
      return;
    }
    if (cleanPitch.length < FIELD_LIMITS.pitchMin || cleanPitch.length > FIELD_LIMITS.pitchMax) {
      setErrorText(`Synopsis must be ${FIELD_LIMITS.pitchMin}-${FIELD_LIMITS.pitchMax} characters.`);
      return;
    }
    if (
      cleanExcerptTitle.length < FIELD_LIMITS.excerptTitleMin ||
      cleanExcerptTitle.length > FIELD_LIMITS.excerptTitleMax
    ) {
      setErrorText(
        `Excerpt heading must be ${FIELD_LIMITS.excerptTitleMin}-${FIELD_LIMITS.excerptTitleMax} characters.`
      );
      return;
    }
    if (
      cleanExcerptText.length < FIELD_LIMITS.excerptTextMin ||
      cleanExcerptText.length > FIELD_LIMITS.excerptTextMax
    ) {
      setErrorText(
        `Sample excerpt must be ${FIELD_LIMITS.excerptTextMin}-${FIELD_LIMITS.excerptTextMax} characters.`
      );
      return;
    }
    if (
      cleanCoverUrl.length < FIELD_LIMITS.coverImageUrlMin ||
      cleanCoverUrl.length > FIELD_LIMITS.coverImageUrlMax
    ) {
      setErrorText('Cover image URL is invalid or exceeds maximum length.');
      return;
    }

    const updatePayload: Record<string, unknown> = {
      title: cleanTitle,
      subtitle: cleanSubtitle.slice(0, FIELD_LIMITS.subtitleMax),
      authorPenName: cleanPen,
      authorBio: cleanBio,
      genre,
      format,
      pageCount: pages,
      pitch: cleanPitch,
      excerptTitle: cleanExcerptTitle,
      excerptText: cleanExcerptText,
      coverImageUrl: cleanCoverUrl,
      coverTone,
      visibility,
      updatedAt: serverTimestamp(),
    };

    if (canEditBudget) {
      const editUsd = Math.round(Number(editingCost) || 0);
      const desUsd = Math.round(Number(designCost) || 0);
      const printUsd = Math.round(Number(printingCost) || 0);
      const nextGoal = editUsd + desUsd + printUsd;
      if (nextGoal < FIELD_LIMITS.goalUsdMin || nextGoal > FIELD_LIMITS.goalUsdMax) {
        setErrorText(
          `Total publishing goal must be between $${FIELD_LIMITS.goalUsdMin} and $${FIELD_LIMITS.goalUsdMax.toLocaleString()}.`
        );
        return;
      }
      updatePayload.editingCostUsd = editUsd;
      updatePayload.designCostUsd = desUsd;
      updatePayload.printingCostUsd = printUsd;
      updatePayload.goalUsd = nextGoal;
    }

    setSaving(true);
    try {
      await updateDoc(doc(db, 'books', book.id), updatePayload);
      onSaved(cleanTitle);
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `books/${book.id}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-zinc-950/40 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-drawer-heading"
    >
      <div className="w-full max-w-2xl bg-[#FAF9F6] h-full overflow-y-auto border-l border-[#E6E3DC] shadow-2xl flex flex-col">
        <header className="sticky top-0 z-10 bg-white border-b border-[#E6E3DC] px-6 py-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">
              Editorial Revision Drawer
            </p>
            <h2
              id="edit-drawer-heading"
              className="font-display text-xl font-bold text-zinc-900 truncate"
            >
              Edit “{book.title}”
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close edit drawer"
            className="p-2 rounded-lg border border-[#D8D3C8] text-zinc-600 hover:text-zinc-950 hover:bg-zinc-50 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <form onSubmit={handleSave} className="p-6 space-y-6 flex-1">
          {/* Cover Preview + Upload */}
          <div className="bg-white border border-[#E6E3DC] rounded-xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row gap-5 items-start">
              <div className="w-28 aspect-[3/4] rounded-lg overflow-hidden border border-[#E6E3DC] bg-[#F1EFE9] shrink-0">
                <CoverImage
                  src={coverImageUrl}
                  alt={title || book.title}
                  title={title || book.title}
                  authorPenName={authorPenName || book.authorPenName}
                  tone={coverTone}
                  className="w-full h-full"
                />
              </div>

              <div className="flex-1 space-y-3 min-w-0">
                <div>
                  <p className="text-xs font-medium text-zinc-800">Cover Artwork</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Upload a custom JPEG, PNG, or WebP file directly to Firebase Storage or choose a preset.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <label className="min-h-[38px] px-3.5 py-2 rounded-lg bg-[#1E3A8A] text-white text-xs font-medium inline-flex items-center gap-1.5 hover:bg-[#1E40AF] transition-colors cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>
                      {uploadProgress !== null
                        ? `Uploading ${uploadProgress}%...`
                        : 'Upload Cover Image'}
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={uploadProgress !== null}
                      onChange={handleCoverFileChange}
                      className="sr-only"
                    />
                  </label>
                  <select
                    aria-label="Choose editorial cover preset"
                    value=""
                    onChange={(e) => {
                      const preset = COVER_PRESETS.find((p) => p.id === e.target.value);
                      if (preset) {
                        setCoverImageUrl(preset.imageUrl);
                        setCoverTone(preset.tone);
                      }
                    }}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[#D8D3C8] bg-white text-xs text-zinc-800 focus:outline-none focus:border-[#1E3A8A]"
                  >
                    <option value="">Or apply preset cover...</option>
                    {COVER_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>

                {uploadError && (
                  <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                    {uploadError}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Title, Subtitle, Metadata */}
          <div className="bg-white border border-[#E6E3DC] rounded-xl p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="edit-title" className="block text-xs font-medium text-zinc-700">
                  Book Title
                </label>
                <input
                  id="edit-title"
                  type="text"
                  required
                  maxLength={FIELD_LIMITS.titleMax}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-[#D8D3C8] bg-white text-sm text-zinc-900 focus:outline-none focus:border-[#1E3A8A]"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="edit-subtitle" className="block text-xs font-medium text-zinc-700">
                  Subtitle
                </label>
                <input
                  id="edit-subtitle"
                  type="text"
                  maxLength={FIELD_LIMITS.subtitleMax}
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-[#D8D3C8] bg-white text-sm text-zinc-900 focus:outline-none focus:border-[#1E3A8A]"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="edit-pen" className="block text-xs font-medium text-zinc-700">
                  Author Pen Name
                </label>
                <input
                  id="edit-pen"
                  type="text"
                  required
                  maxLength={FIELD_LIMITS.penNameMax}
                  value={authorPenName}
                  onChange={(e) => setAuthorPenName(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-[#D8D3C8] bg-white text-sm text-zinc-900 focus:outline-none focus:border-[#1E3A8A]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="edit-genre" className="block text-xs font-medium text-zinc-700">
                    Genre
                  </label>
                  <select
                    id="edit-genre"
                    value={genre}
                    onChange={(e) => setGenre(e.target.value as BookGenre)}
                    className="w-full min-h-[40px] px-2.5 py-2 rounded-lg border border-[#D8D3C8] bg-white text-xs text-zinc-900 focus:outline-none focus:border-[#1E3A8A]"
                  >
                    {BOOK_GENRES.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="edit-pages" className="block text-xs font-medium text-zinc-700">
                    Pages
                  </label>
                  <input
                    id="edit-pages"
                    type="number"
                    min={FIELD_LIMITS.pageCountMin}
                    max={FIELD_LIMITS.pageCountMax}
                    value={pageCount}
                    onChange={(e) => setPageCount(e.target.value)}
                    className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-[#D8D3C8] bg-white font-mono text-sm tabular-nums focus:outline-none focus:border-[#1E3A8A]"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="edit-format" className="block text-xs font-medium text-zinc-700">
                  Target Edition
                </label>
                <select
                  id="edit-format"
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

              <div className="space-y-1.5">
                <label htmlFor="edit-visibility" className="block text-xs font-medium text-zinc-700">
                  Catalog Visibility
                </label>
                <select
                  id="edit-visibility"
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as BookVisibility)}
                  className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-[#D8D3C8] bg-white text-sm text-zinc-900 focus:outline-none focus:border-[#1E3A8A]"
                >
                  <option value="public">Public (Visible in Catalog)</option>
                  <option value="archived">Archived (Hidden from Catalog)</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="edit-bio" className="block text-xs font-medium text-zinc-700">
                Author Bio
              </label>
              <textarea
                id="edit-bio"
                rows={2}
                required
                maxLength={FIELD_LIMITS.authorBioMax}
                value={authorBio}
                onChange={(e) => setAuthorBio(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[#D8D3C8] bg-white text-sm text-zinc-900 focus:outline-none focus:border-[#1E3A8A]"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="edit-pitch" className="block text-xs font-medium text-zinc-700">
                Synopsis / Pitch ({pitch.trim().length}/{FIELD_LIMITS.pitchMax})
              </label>
              <textarea
                id="edit-pitch"
                rows={3}
                required
                maxLength={FIELD_LIMITS.pitchMax}
                value={pitch}
                onChange={(e) => setPitch(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[#D8D3C8] bg-white text-sm text-zinc-900 focus:outline-none focus:border-[#1E3A8A]"
              />
            </div>
          </div>

          {/* Sample Chapter Excerpt */}
          <div className="bg-white border border-[#E6E3DC] rounded-xl p-5 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="edit-excerpt-title" className="block text-xs font-medium text-zinc-700">
                Sample Chapter Heading
              </label>
              <input
                id="edit-excerpt-title"
                type="text"
                required
                maxLength={FIELD_LIMITS.excerptTitleMax}
                value={excerptTitle}
                onChange={(e) => setExcerptTitle(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-[#D8D3C8] bg-white text-sm text-zinc-900 focus:outline-none focus:border-[#1E3A8A]"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="edit-excerpt-text" className="font-medium text-zinc-700">
                  Sample Chapter Excerpt
                </label>
                <span className="font-mono text-zinc-500 tabular-nums">
                  {excerptText.trim().length}/{FIELD_LIMITS.excerptTextMax}
                </span>
              </div>
              <textarea
                id="edit-excerpt-text"
                rows={8}
                required
                maxLength={FIELD_LIMITS.excerptTextMax}
                value={excerptText}
                onChange={(e) => setExcerptText(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#D8D3C8] bg-white text-sm leading-relaxed text-zinc-900 focus:outline-none focus:border-[#1E3A8A]"
              />
            </div>
          </div>

          {/* Publishing Budget (Editable only before first donation/publication) */}
          <div className="bg-white border border-[#E6E3DC] rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">
                Publishing Budget Breakdown
              </p>
              {!canEditBudget && (
                <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
                  <Lock className="w-3 h-3" />
                  Locked after first donation or publication
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1">
                <label htmlFor="edit-cost-editing" className="block text-xs text-zinc-600">
                  Editing ($)
                </label>
                <input
                  id="edit-cost-editing"
                  type="number"
                  min={0}
                  max={50000}
                  disabled={!canEditBudget}
                  value={editingCost}
                  onChange={(e) => setEditingCost(e.target.value)}
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg border border-[#D8D3C8] bg-white font-mono text-sm tabular-nums disabled:bg-zinc-100 disabled:text-zinc-500"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="edit-cost-design" className="block text-xs text-zinc-600">
                  Design ($)
                </label>
                <input
                  id="edit-cost-design"
                  type="number"
                  min={0}
                  max={50000}
                  disabled={!canEditBudget}
                  value={designCost}
                  onChange={(e) => setDesignCost(e.target.value)}
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg border border-[#D8D3C8] bg-white font-mono text-sm tabular-nums disabled:bg-zinc-100 disabled:text-zinc-500"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="edit-cost-printing" className="block text-xs text-zinc-600">
                  Printing ($)
                </label>
                <input
                  id="edit-cost-printing"
                  type="number"
                  min={0}
                  max={50000}
                  disabled={!canEditBudget}
                  value={printingCost}
                  onChange={(e) => setPrintingCost(e.target.value)}
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg border border-[#D8D3C8] bg-white font-mono text-sm tabular-nums disabled:bg-zinc-100 disabled:text-zinc-500"
                />
              </div>
              <div className="flex flex-col justify-center">
                <span className="text-xs text-zinc-500">Goal</span>
                <span className="font-mono text-base font-semibold text-zinc-900 tabular-nums">
                  ${computedGoal.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {errorText && (
            <div
              role="alert"
              className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-900"
            >
              {errorText}
            </div>
          )}

          <div className="sticky bottom-0 bg-[#FAF9F6] pt-3 pb-4 border-t border-[#E6E3DC] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] px-4 py-2 rounded-lg border border-[#D8D3C8] bg-white text-sm font-medium text-zinc-700 hover:bg-zinc-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || uploadProgress !== null}
              className="min-h-[42px] px-5 py-2 rounded-lg bg-[#1E3A8A] text-white text-sm font-medium inline-flex items-center gap-2 hover:bg-[#1E40AF] transition-colors cursor-pointer disabled:opacity-60"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving Revisions...' : 'Save Revisions'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
