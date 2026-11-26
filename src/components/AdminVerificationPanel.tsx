import React, { useEffect, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { CheckCircle2, Eye, EyeOff, ShieldCheck, XCircle } from 'lucide-react';
import { OperationType, db, handleFirestoreError } from '../firebase';
import { IdentityVerification, LIMITS } from '../types';

interface AdminVerificationPanelProps {
  adminEmail: string;
}

export function AdminVerificationPanel({ adminEmail }: AdminVerificationPanelProps) {
  const [records, setRecords] = useState<IdentityVerification[]>([]);
  const [loading, setLoading] = useState(true);
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});
  const [notesByUid, setNotesByUid] = useState<Record<string, string>>({});
  const [updatingUid, setUpdatingUid] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'identityVerifications'),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as IdentityVerification)
          .sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0));
        setRecords(list);
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        handleFirestoreError(err, OperationType.LIST, 'identityVerifications');
      }
    );
    return () => unsub();
  }, []);

  const handleReview = async (
    item: IdentityVerification,
    nextStatus: 'verified' | 'rejected'
  ) => {
    setUpdatingUid(item.uid);
    try {
      const batch = writeBatch(db);
      const cleanNote = (notesByUid[item.uid] || '').trim().slice(0, LIMITS.reviewNoteMax);

      const verUpdate: Record<string, unknown> = {
        status: nextStatus,
        reviewedBy: adminEmail,
        reviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (cleanNote) {
        verUpdate.reviewNote = cleanNote;
      }
      batch.update(doc(db, 'identityVerifications', item.uid), verUpdate);
      batch.update(doc(db, 'users', item.uid), {
        identityVerificationStatus: nextStatus,
        updatedAt: serverTimestamp(),
      });

      const mechSnap = await getDoc(doc(db, 'mechanics', item.uid));
      if (mechSnap.exists()) {
        batch.update(doc(db, 'mechanics', item.uid), {
          identityVerificationStatus: nextStatus,
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `identityVerifications/${item.uid}`);
    } finally {
      setUpdatingUid(null);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-orange-600" />
          <div>
            <h3 className="font-display text-base font-bold text-slate-900">
              Identity &amp; Background Check Review Queue
            </h3>
            <p className="text-xs text-slate-500">
              Admin-only review of original National ID &amp; Passport submissions
            </p>
          </div>
        </div>
        <span className="text-xs font-semibold text-slate-600 tabular-nums">
          {records.length} {records.length === 1 ? 'submission' : 'submissions'}
        </span>
      </div>

      {loading ? (
        <div className="text-xs text-slate-500">Loading verification submissions...</div>
      ) : records.length === 0 ? (
        <div className="text-xs text-slate-500 py-4 text-center">
          No customer or mechanic ID/Passport submissions yet.
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {records.map((item) => {
            const revealed = Boolean(revealedIds[item.uid]);
            return (
              <div key={item.uid} className="py-4 first:pt-0 last:pb-0 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="text-sm font-bold text-slate-900">
                      {item.legalFullName}
                    </div>
                    <div className="text-xs text-slate-600">
                      Role: <strong className="capitalize">{item.role}</strong> ·{' '}
                      {item.documentType === 'passport' ? 'Passport' : 'National ID'} ·{' '}
                      {item.issuingCountry} · Ref{' '}
                      <span className="font-mono font-semibold">{item.documentNumberLast4}</span>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-semibold capitalize ${
                      item.status === 'verified'
                        ? 'text-emerald-700'
                        : item.status === 'rejected'
                        ? 'text-red-700'
                        : 'text-amber-700'
                    }`}
                  >
                    {item.status.replace('_', ' ')}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <div className="relative">
                    <img
                      src={item.documentImageDataUrl}
                      alt={`${item.legalFullName} identity document`}
                      className={`w-40 h-28 object-cover rounded-xl border border-slate-200 bg-slate-100 transition ${
                        revealed ? 'blur-none' : 'blur-md'
                      }`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setRevealedIds((prev) => ({ ...prev, [item.uid]: !revealed }))
                    }
                    className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5"
                  >
                    {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {revealed ? 'Hide Document' : 'Inspect ID / Passport'}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    maxLength={LIMITS.reviewNoteMax}
                    value={notesByUid[item.uid] ?? item.reviewNote ?? ''}
                    onChange={(e) =>
                      setNotesByUid((prev) => ({ ...prev, [item.uid]: e.target.value }))
                    }
                    placeholder="Optional background check / rejection note"
                    className="flex-1 min-w-[200px] min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 text-xs"
                  />
                  <button
                    type="button"
                    disabled={updatingUid === item.uid}
                    onClick={() => void handleReview(item, 'verified')}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Approve Verification
                  </button>
                  <button
                    type="button"
                    disabled={updatingUid === item.uid}
                    onClick={() => void handleReview(item, 'rejected')}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-red-300 bg-white hover:bg-red-50 disabled:opacity-50 text-red-700 text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Request Re-upload
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
