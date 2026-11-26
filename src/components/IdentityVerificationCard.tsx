import React, { useEffect, useRef, useState } from 'react';
import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  FileCheck2,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { OperationType, db, handleFirestoreError } from '../firebase';
import {
  IdentityDocumentType,
  IdentityVerification,
  LIMITS,
  UserRole,
} from '../types';

export interface PendingIdentityDraft {
  role: UserRole;
  legalFullName: string;
  documentType: IdentityDocumentType;
  issuingCountry: string;
  documentNumberLast4: string;
  documentImageDataUrl: string;
  originalDocumentConfirmed: boolean;
  backgroundCheckConsent: boolean;
}

export async function compressIdentityImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a valid image file (JPG, PNG, or WebP) of your original ID or Passport.');
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Could not read the selected image.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not decode image file.'));
    image.src = dataUrl;
  });

  const attempts = [
    { maxDim: 960, quality: 0.8 },
    { maxDim: 800, quality: 0.72 },
    { maxDim: 680, quality: 0.62 },
    { maxDim: 560, quality: 0.52 },
  ];

  for (const { maxDim, quality } of attempts) {
    const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
    const width = Math.max(120, Math.round(img.width * scale));
    const height = Math.max(120, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Browser canvas unavailable for image compression.');
    }
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const compressed = canvas.toDataURL('image/jpeg', quality);
    if (compressed.length <= 390000) {
      return compressed;
    }
  }

  throw new Error('Image is still too large after compression. Please retake with standard resolution.');
}

export async function saveIdentityVerification(
  uid: string,
  draft: PendingIdentityDraft,
  hasExistingRecord: boolean
): Promise<void> {
  const path = `identityVerifications/${uid}`;
  const batch = writeBatch(db);
  const verRef = doc(db, 'identityVerifications', uid);
  const userRef = doc(db, 'users', uid);

  if (hasExistingRecord) {
    batch.update(verRef, {
      role: draft.role,
      legalFullName: draft.legalFullName.trim().slice(0, LIMITS.legalFullNameMax),
      documentType: draft.documentType,
      issuingCountry: draft.issuingCountry.trim().slice(0, LIMITS.issuingCountryMax),
      documentNumberLast4: draft.documentNumberLast4.trim().slice(0, LIMITS.docLast4Max),
      documentImageDataUrl: draft.documentImageDataUrl,
      originalDocumentConfirmed: true,
      backgroundCheckConsent: true,
      status: 'pending_review',
      updatedAt: serverTimestamp(),
    });
  } else {
    batch.set(verRef, {
      uid,
      role: draft.role,
      legalFullName: draft.legalFullName.trim().slice(0, LIMITS.legalFullNameMax),
      documentType: draft.documentType,
      issuingCountry: draft.issuingCountry.trim().slice(0, LIMITS.issuingCountryMax),
      documentNumberLast4: draft.documentNumberLast4.trim().slice(0, LIMITS.docLast4Max),
      documentImageDataUrl: draft.documentImageDataUrl,
      originalDocumentConfirmed: true,
      backgroundCheckConsent: true,
      status: 'pending_review',
      submittedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  batch.update(userRef, {
    identityVerificationStatus: 'pending_review',
    updatedAt: serverTimestamp(),
  });

  const mechSnap = await getDoc(doc(db, 'mechanics', uid));
  if (mechSnap.exists()) {
    batch.update(doc(db, 'mechanics', uid), {
      identityVerificationStatus: 'pending_review',
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

interface IdentityVerificationCardProps {
  mode: 'pre_signin' | 'workspace';
  role: UserRole;
  uid?: string;
  defaultFullName?: string;
  defaultCountryName?: string;
  verification?: IdentityVerification | null;
  darkSurface?: boolean;
  onDraftChange?: (draft: PendingIdentityDraft | null) => void;
  onSaved?: () => void;
}

export function IdentityVerificationCard({
  mode,
  role,
  uid,
  defaultFullName = '',
  defaultCountryName = 'United States',
  verification = null,
  darkSurface = false,
  onDraftChange,
  onSaved,
}: IdentityVerificationCardProps) {
  const [documentType, setDocumentType] = useState<IdentityDocumentType>(
    verification?.documentType || 'national_id'
  );
  const [legalFullName, setLegalFullName] = useState(
    verification?.legalFullName || defaultFullName
  );
  const [issuingCountry, setIssuingCountry] = useState(
    verification?.issuingCountry || defaultCountryName
  );
  const [documentNumberLast4, setDocumentNumberLast4] = useState(
    verification?.documentNumberLast4 || ''
  );
  const [documentImageDataUrl, setDocumentImageDataUrl] = useState(
    verification?.documentImageDataUrl || ''
  );
  const [originalConfirmed, setOriginalConfirmed] = useState(
    Boolean(verification?.originalDocumentConfirmed)
  );
  const [backgroundConsent, setBackgroundConsent] = useState(
    Boolean(verification?.backgroundCheckConsent)
  );
  const [processingImage, setProcessingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [blurPreview, setBlurPreview] = useState(false);
  const [editingExisting, setEditingExisting] = useState(!verification);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!verification) {
      setEditingExisting(true);
      return;
    }
    setDocumentType(verification.documentType);
    setLegalFullName(verification.legalFullName);
    setIssuingCountry(verification.issuingCountry);
    setDocumentNumberLast4(verification.documentNumberLast4);
    setDocumentImageDataUrl(verification.documentImageDataUrl);
    setOriginalConfirmed(verification.originalDocumentConfirmed);
    setBackgroundConsent(verification.backgroundCheckConsent);
    setEditingExisting(verification.status === 'rejected');
  }, [verification]);

  useEffect(() => {
    if (!onDraftChange) return;
    const valid =
      legalFullName.trim().length >= LIMITS.legalFullNameMin &&
      issuingCountry.trim().length >= LIMITS.issuingCountryMin &&
      documentNumberLast4.trim().length >= LIMITS.docLast4Min &&
      documentImageDataUrl.length >= 100 &&
      originalConfirmed &&
      backgroundConsent;

    if (valid) {
      onDraftChange({
        role,
        legalFullName: legalFullName.trim().slice(0, LIMITS.legalFullNameMax),
        documentType,
        issuingCountry: issuingCountry.trim().slice(0, LIMITS.issuingCountryMax),
        documentNumberLast4: documentNumberLast4.trim().slice(0, LIMITS.docLast4Max),
        documentImageDataUrl,
        originalDocumentConfirmed: true,
        backgroundCheckConsent: true,
      });
    } else {
      onDraftChange(null);
    }
  }, [
    role,
    legalFullName,
    documentType,
    issuingCountry,
    documentNumberLast4,
    documentImageDataUrl,
    originalConfirmed,
    backgroundConsent,
    onDraftChange,
  ]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setProcessingImage(true);
    setErrorMsg(null);
    setSavedNotice(null);
    try {
      const compressed = await compressIdentityImage(file);
      setDocumentImageDataUrl(compressed);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to process image.');
    } finally {
      setProcessingImage(false);
    }
  };

  const handleSubmitVerification = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!uid) return;

    setErrorMsg(null);
    setSavedNotice(null);

    if (legalFullName.trim().length < LIMITS.legalFullNameMin) {
      setErrorMsg('Enter your legal full name as printed on your original ID or Passport.');
      return;
    }
    if (issuingCountry.trim().length < LIMITS.issuingCountryMin) {
      setErrorMsg('Enter the issuing country of your ID or Passport.');
      return;
    }
    if (documentNumberLast4.trim().length < LIMITS.docLast4Min) {
      setErrorMsg('Enter at least the last 2–4 characters of your ID or Passport number.');
      return;
    }
    if (!documentImageDataUrl || documentImageDataUrl.length < 100) {
      setErrorMsg('Attach or capture a photo of your original National ID or Passport.');
      return;
    }
    if (!originalConfirmed || !backgroundConsent) {
      setErrorMsg('Confirm the original document statement and background check authorization.');
      return;
    }

    setSaving(true);
    try {
      await saveIdentityVerification(
        uid,
        {
          role,
          legalFullName: legalFullName.trim(),
          documentType,
          issuingCountry: issuingCountry.trim(),
          documentNumberLast4: documentNumberLast4.trim(),
          documentImageDataUrl,
          originalDocumentConfirmed: true,
          backgroundCheckConsent: true,
        },
        Boolean(verification)
      );
      setSavedNotice(
        'Original document submitted securely for verification and background check.'
      );
      setEditingExisting(false);
      onSaved?.();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not save verification.');
    } finally {
      setSaving(false);
    }
  };

  const approxKb = documentImageDataUrl ? Math.round((documentImageDataUrl.length * 0.75) / 1024) : 0;

  const surfaceCls = darkSurface
    ? 'bg-slate-800/70 border border-slate-700 text-white'
    : 'bg-white border border-slate-200 text-slate-900';
  const inputCls = darkSurface
    ? 'w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder:text-slate-400'
    : 'w-full min-h-[42px] px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 placeholder:text-slate-400';
  const labelCls = darkSurface
    ? 'block text-[11px] font-semibold text-slate-300 mb-1'
    : 'block text-[11px] font-semibold text-slate-700 mb-1';
  const mutedCls = darkSurface ? 'text-slate-300' : 'text-slate-600';

  if (mode === 'workspace' && verification && !editingExisting) {
    const isVerified = verification.status === 'verified';
    const isRejected = verification.status === 'rejected';

    return (
      <div className={`rounded-2xl p-5 space-y-4 ${surfaceCls}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            {isVerified ? (
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : isRejected ? (
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            ) : (
              <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            )}
            <div className="space-y-0.5">
              <div className="text-sm font-bold">
                {isVerified
                  ? 'Identity & Background Check Verified'
                  : isRejected
                  ? 'Document Re-upload Required'
                  : 'Original ID Submitted · Background Check In Review'}
              </div>
              <div className={`text-xs ${mutedCls}`}>
                {verification.documentType === 'passport' ? 'Original Passport' : 'Original National ID'} ·{' '}
                {verification.legalFullName} · {verification.issuingCountry} · Ending in{' '}
                <span className="font-mono font-semibold">{verification.documentNumberLast4}</span>
              </div>
              {verification.reviewNote && (
                <div className="text-xs text-red-700 pt-1">
                  Reviewer note: {verification.reviewNote}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setBlurPreview((b) => !b)}
              className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5"
            >
              {blurPreview ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              {blurPreview ? 'Show ID Photo' : 'Hide ID Photo'}
            </button>
            {verification.status !== 'verified' && (
              <button
                type="button"
                onClick={() => setEditingExisting(true)}
                className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800"
              >
                Replace Photo
              </button>
            )}
          </div>
        </div>

        {!blurPreview && (
          <div className="flex items-center gap-4 border-t border-slate-100 pt-3">
            <img
              src={verification.documentImageDataUrl}
              alt={`Submitted ${verification.documentType === 'passport' ? 'Passport' : 'National ID'}`}
              className="w-28 h-20 object-cover rounded-xl border border-slate-200 bg-slate-100 shrink-0"
            />
            <p className="text-xs text-slate-500 leading-relaxed">
              Stored privately in your encrypted identity verification record. Other drivers and mechanics cannot view your ID or Passport image.
            </p>
          </div>
        )}

        {savedNotice && (
          <div className="text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2.5 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{savedNotice}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`rounded-2xl p-4 sm:p-5 space-y-4 ${surfaceCls}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 text-xs font-bold">
            <FileCheck2 className="w-4 h-4 text-orange-500 shrink-0" />
            <span>
              Original ID or Passport Verification &amp; Background Check
            </span>
          </div>
          <p className={`text-xs leading-relaxed ${mutedCls}`}>
            {mode === 'pre_signin'
              ? `Required when joining as a ${role === 'mechanic' ? 'mechanic company representative' : 'customer'}. Attach a clear photo of your original physical ID or Passport now, or complete right after Google Sign-In.`
              : `Upload a clear photo of your original physical National ID or Passport so WrenchBid can complete your ${role === 'mechanic' ? 'mechanic company' : 'customer'} background check.`}
          </p>
        </div>
        {verification && editingExisting && (
          <button
            type="button"
            onClick={() => setEditingExisting(false)}
            className="text-xs font-semibold text-slate-500 hover:text-slate-900 underline"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Document Type Toggle */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setDocumentType('national_id')}
          className={`min-h-[40px] px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${
            documentType === 'national_id'
              ? darkSurface
                ? 'bg-orange-600 border-orange-500 text-white'
                : 'bg-slate-900 border-slate-900 text-white'
              : darkSurface
              ? 'bg-slate-900/70 border-slate-700 text-slate-300 hover:border-slate-500'
              : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
          }`}
        >
          Original National ID
        </button>
        <button
          type="button"
          onClick={() => setDocumentType('passport')}
          className={`min-h-[40px] px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${
            documentType === 'passport'
              ? darkSurface
                ? 'bg-orange-600 border-orange-500 text-white'
                : 'bg-slate-900 border-slate-900 text-white'
              : darkSurface
              ? 'bg-slate-900/70 border-slate-700 text-slate-300 hover:border-slate-500'
              : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
          }`}
        >
          Original Passport
        </button>
      </div>

      {/* Legal Name, Country, Doc Last 4 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-1">
          <label className={labelCls}>Legal Full Name (as on ID)</label>
          <input
            type="text"
            maxLength={LIMITS.legalFullNameMax}
            value={legalFullName}
            onChange={(e) => setLegalFullName(e.target.value)}
            placeholder="Full name on document"
            className={inputCls}
          />
        </div>
        <div className="sm:col-span-1">
          <label className={labelCls}>Issuing Country</label>
          <input
            type="text"
            maxLength={LIMITS.issuingCountryMax}
            value={issuingCountry}
            onChange={(e) => setIssuingCountry(e.target.value)}
            placeholder="e.g. Kenya, USA, India, UK"
            className={inputCls}
          />
        </div>
        <div className="sm:col-span-1">
          <label className={labelCls}>Last 4 Chars of ID / Passport</label>
          <input
            type="text"
            maxLength={LIMITS.docLast4Max}
            value={documentNumberLast4}
            onChange={(e) => setDocumentNumberLast4(e.target.value)}
            placeholder="e.g. 4829"
            className={`${inputCls} font-mono`}
          />
        </div>
      </div>

      {/* Hidden File & Camera Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => void handleFileChange(e)}
        className="hidden"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => void handleFileChange(e)}
        className="hidden"
      />

      {/* Capture / Upload Controls & Image Preview */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={processingImage}
            onClick={() => cameraInputRef.current?.click()}
            className={`min-h-[42px] px-3.5 py-2 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
              darkSurface
                ? 'bg-slate-900 border-slate-600 text-white hover:bg-slate-800'
                : 'bg-slate-50 border-slate-300 text-slate-800 hover:bg-slate-100'
            }`}
          >
            <Camera className="w-4 h-4 text-orange-500" />
            <span>
              {processingImage ? 'Compressing...' : `Take Photo of Original ${documentType === 'passport' ? 'Passport' : 'ID'}`}
            </span>
          </button>

          <button
            type="button"
            disabled={processingImage}
            onClick={() => fileInputRef.current?.click()}
            className={`min-h-[42px] px-3.5 py-2 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
              darkSurface
                ? 'bg-slate-900 border-slate-600 text-white hover:bg-slate-800'
                : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50'
            }`}
          >
            <Upload className="w-4 h-4 text-slate-500" />
            <span>Upload Photo File</span>
          </button>
        </div>

        {documentImageDataUrl ? (
          <div
            className={`rounded-xl border p-3 flex flex-wrap items-center gap-3 ${
              darkSurface ? 'bg-slate-900 border-slate-700' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <img
              src={documentImageDataUrl}
              alt="Original ID or Passport preview"
              className="w-28 h-20 object-cover rounded-lg border border-slate-300 bg-white shrink-0"
            />
            <div className="space-y-1 text-xs min-w-0">
              <div className="font-semibold inline-flex items-center gap-1.5 text-emerald-600">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Original document photo attached ({approxKb} KB)</span>
              </div>
              <div className={mutedCls}>
                Ensure all 4 corners and your portrait/document details are legible without glare.
              </div>
            </div>
          </div>
        ) : (
          <div
            className={`rounded-xl border border-dashed p-4 text-xs text-center ${
              darkSurface
                ? 'border-slate-700 text-slate-400 bg-slate-900/40'
                : 'border-slate-300 text-slate-500 bg-slate-50/70'
            }`}
          >
            No original {documentType === 'passport' ? 'Passport' : 'National ID'} photo selected yet. Use camera or upload above.
          </div>
        )}
      </div>

      {/* Original Document & Background Check Authorizations */}
      <div className="space-y-2 pt-1">
        <label className="flex items-start gap-2.5 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={originalConfirmed}
            onChange={(e) => setOriginalConfirmed(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-orange-600"
          />
          <span className={mutedCls}>
            I confirm this is a genuine photo of my <strong>original physical National ID or Passport</strong> (not a photocopy or edited screen image).
          </span>
        </label>

        <label className="flex items-start gap-2.5 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={backgroundConsent}
            onChange={(e) => setBackgroundConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-orange-600"
          />
          <span className={mutedCls}>
            I authorize WrenchBid to run an <strong>identity verification and safety background check</strong> using this document.
          </span>
        </label>
      </div>

      {errorMsg && (
        <div className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
          {errorMsg}
        </div>
      )}

      {mode === 'workspace' && (
        <button
          type="button"
          disabled={saving || processingImage}
          onClick={() => void handleSubmitVerification()}
          className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors"
        >
          <ShieldCheck className="w-4 h-4 text-orange-400" />
          <span>
            {saving
              ? 'Submitting Original Document...'
              : 'Submit Original ID / Passport for Background Check'}
          </span>
        </button>
      )}
    </div>
  );
}
