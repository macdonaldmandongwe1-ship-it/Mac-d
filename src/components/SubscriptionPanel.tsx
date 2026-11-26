import React, { useEffect, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { QRCodeSVG } from 'qrcode.react';
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Landmark,
  QrCode,
  Receipt,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { OperationType, db, handleFirestoreError } from '../firebase';
import {
  BILLING_CYCLE_MS,
  MONTHLY_FEE_USD,
  MechanicProfile,
  PLATFORM_PAYOUT_ACCOUNT,
  PaymentMethod,
  SubscriptionPayment,
  TRIAL_DAYS,
  TRIAL_DURATION_MS,
  formatDurationRemaining,
  isMechanicSubscriptionValid,
} from '../types';

interface SubscriptionPanelProps {
  mechanic: MechanicProfile;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function SubscriptionPanel({ mechanic }: SubscriptionPanelProps) {
  const [payments, setPayments] = useState<SubscriptionPayment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>(
    mechanic.preferredBillingMethod || 'card'
  );
  const [autoRenew, setAutoRenew] = useState<boolean>(mechanic.autoRenew ?? true);
  const [savingAutoRenew, setSavingAutoRenew] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<SubscriptionPayment | null>(null);
  const [copiedAccount, setCopiedAccount] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setSelectedMethod(mechanic.preferredBillingMethod || 'card');
    setAutoRenew(mechanic.autoRenew ?? true);
  }, [mechanic.preferredBillingMethod, mechanic.autoRenew]);

  // Listen to mechanic's $4/month subscription payment ledger
  useEffect(() => {
    const path = 'subscriptionPayments';
    const q = query(
      collection(db, 'subscriptionPayments'),
      where('mechanicId', '==', mechanic.uid)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs
          .map((d) => d.data() as SubscriptionPayment)
          .sort((a, b) => {
            const aMs = a.paidAt?.toMillis?.() ?? 0;
            const bMs = b.paidAt?.toMillis?.() ?? 0;
            return bMs - aMs;
          });
        setPayments(rows);
        setPaymentsLoading(false);
      },
      (err) => {
        setPaymentsLoading(false);
        handleFirestoreError(err, OperationType.LIST, path);
      }
    );
    return () => unsub();
  }, [mechanic.uid]);

  // Auto-sync trial status to 'expired' in Firestore if trial window has elapsed
  useEffect(() => {
    if (
      mechanic.subscriptionStatus === 'trial' &&
      nowMs >= mechanic.trialEndsAtMs
    ) {
      void updateDoc(doc(db, 'mechanics', mechanic.uid), {
        subscriptionStatus: 'expired',
        updatedAt: serverTimestamp(),
      }).catch((err) =>
        handleFirestoreError(err, OperationType.UPDATE, `mechanics/${mechanic.uid}`)
      );
    }
  }, [mechanic.uid, mechanic.subscriptionStatus, mechanic.trialEndsAtMs, nowMs]);

  const canBid = isMechanicSubscriptionValid(mechanic, nowMs);
  const isTrial = mechanic.subscriptionStatus === 'trial' && mechanic.trialEndsAtMs > nowMs;
  const isPaidActive =
    mechanic.subscriptionStatus === 'active' && mechanic.subscriptionPaidUntilMs > nowMs;
  const trialExpiringSoon =
    isTrial && mechanic.trialEndsAtMs - nowMs <= 24 * 60 * 60 * 1000;

  const trialStartMs = mechanic.trialStartedAt?.toMillis?.() ?? mechanic.trialEndsAtMs - TRIAL_DURATION_MS;
  const trialElapsedMs = Math.max(0, Math.min(TRIAL_DURATION_MS, nowMs - trialStartMs));
  const trialProgressPct = Math.round((trialElapsedMs / TRIAL_DURATION_MS) * 100);
  const daysUsed = Math.min(TRIAL_DAYS, Math.max(1, Math.ceil(trialElapsedMs / (24 * 60 * 60 * 1000))));

  const activeCoverageEndMs = isPaidActive
    ? mechanic.subscriptionPaidUntilMs
    : mechanic.trialEndsAtMs;

  const nextCoverageEndMs =
    Math.max(nowMs, mechanic.trialEndsAtMs, mechanic.subscriptionPaidUntilMs) + BILLING_CYCLE_MS;

  const subscriptionQrPayload = `wrenchbid://subscribe?mechanic=${encodeURIComponent(
    mechanic.uid
  )}&account=${PLATFORM_PAYOUT_ACCOUNT}&plan=monthly&amount=${MONTHLY_FEE_USD}.00`;

  const handleCopyAccount = async () => {
    try {
      await navigator.clipboard.writeText(PLATFORM_PAYOUT_ACCOUNT);
      setCopiedAccount(true);
      window.setTimeout(() => setCopiedAccount(false), 2000);
    } catch {
      // Clipboard fallback ignored if blocked
    }
  };

  const handleToggleAutoRenew = async () => {
    if (savingAutoRenew) return;
    const nextVal = !autoRenew;
    setSavingAutoRenew(true);
    setAutoRenew(nextVal);
    try {
      await updateDoc(doc(db, 'mechanics', mechanic.uid), {
        autoRenew: nextVal,
        preferredBillingMethod: selectedMethod,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      setAutoRenew(!nextVal);
      handleFirestoreError(err, OperationType.UPDATE, `mechanics/${mechanic.uid}`);
    } finally {
      setSavingAutoRenew(false);
    }
  };

  const handleSelectMethod = async (method: PaymentMethod) => {
    setSelectedMethod(method);
    try {
      await updateDoc(doc(db, 'mechanics', mechanic.uid), {
        preferredBillingMethod: method,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `mechanics/${mechanic.uid}`);
    }
  };

  const handlePayMonthlySubscription = async () => {
    if (processingPayment) return;
    setProcessingPayment(true);
    setPaymentNotice(null);

    const paymentId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const paymentRef = doc(db, 'subscriptionPayments', paymentId);
    const mechRef = doc(db, 'mechanics', mechanic.uid);
    const validUntilMs = nextCoverageEndMs;

    try {
      const batch = writeBatch(db);
      batch.set(paymentRef, {
        id: paymentId,
        mechanicId: mechanic.uid,
        amountUsd: MONTHLY_FEE_USD,
        billingMonths: 1,
        method: selectedMethod,
        validUntilMs,
        recipientAccount: PLATFORM_PAYOUT_ACCOUNT,
        paidAt: serverTimestamp(),
      });
      batch.update(mechRef, {
        subscriptionStatus: 'active',
        subscriptionPaidUntilMs: validUntilMs,
        lastPaymentId: paymentId,
        preferredBillingMethod: selectedMethod,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();

      setPaymentNotice(
        `Payment recorded ($${MONTHLY_FEE_USD.toFixed(2)} to account ${PLATFORM_PAYOUT_ACCOUNT}). Dispatch coverage active through ${formatDate(validUntilMs)}.`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `subscriptionPayments/${paymentId}`);
    } finally {
      setProcessingPayment(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 7-Day Free Trial & Active Plan Status Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-slate-500">
              Mechanic Membership &amp; Billing
            </div>
            <h3 className="font-display text-xl font-bold text-slate-900">
              {isPaidActive
                ? 'Active $4.00/Month Mechanic Plan'
                : isTrial
                ? '7-Day Free Trial Active'
                : 'Trial Expired — Renewal Required'}
            </h3>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isPaidActive ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Active Plan · Bidding Enabled
              </span>
            ) : isTrial ? (
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold ${
                  trialExpiringSoon
                    ? 'bg-amber-50 border-amber-200 text-amber-900'
                    : 'bg-sky-50 border-sky-200 text-sky-900'
                }`}
              >
                <CalendarClock className="w-4 h-4" />
                {trialExpiringSoon ? 'Trial Ending Soon' : '7-Day Free Trial'} ·{' '}
                <span className="tabular-nums">{formatDurationRemaining(mechanic.trialEndsAtMs, nowMs)}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-xs font-semibold text-red-800">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                Expired · Bidding Paused
              </span>
            )}
          </div>
        </div>

        {/* Metrics Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-1">
            <div className="text-xs text-slate-500">Trial Window</div>
            <div className="font-display text-lg font-bold text-slate-900 tabular-nums">
              {isTrial ? `Day ${daysUsed} of ${TRIAL_DAYS}` : `${TRIAL_DAYS}-Day Trial Completed`}
            </div>
            <div className="text-xs text-slate-600 tabular-nums">
              Ends {formatDateTime(mechanic.trialEndsAtMs)}
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-1">
            <div className="text-xs text-slate-500">Subscription Rate</div>
            <div className="font-display text-lg font-bold text-slate-900 tabular-nums">
              ${MONTHLY_FEE_USD.toFixed(2)} / month
            </div>
            <div className="text-xs text-slate-600">
              0% commission on customer QR payouts
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-1">
            <div className="text-xs text-slate-500">
              {canBid ? 'Dispatch Eligible Until' : 'Coverage Status'}
            </div>
            <div className="font-display text-lg font-bold text-slate-900 tabular-nums">
              {canBid ? formatDate(activeCoverageEndMs) : 'Action Needed'}
            </div>
            <div className="text-xs text-slate-600 tabular-nums">
              {canBid
                ? formatDurationRemaining(activeCoverageEndMs, nowMs)
                : 'Pay $4.00 to resume live bidding'}
            </div>
          </div>
        </div>

        {/* 7-Day Trial Progress Bar */}
        {!isPaidActive && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700">
                7-Day Free Trial Progress
              </span>
              <span className="font-mono text-slate-600 tabular-nums">
                {isTrial ? `${trialProgressPct}% elapsed` : '100% elapsed'}
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-slate-100 border border-slate-200 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  isTrial
                    ? trialExpiringSoon
                      ? 'bg-amber-500'
                      : 'bg-orange-600'
                    : 'bg-red-600'
                }`}
                style={{ width: `${isTrial ? Math.max(8, trialProgressPct) : 100}%` }}
              />
            </div>
            <p className="text-xs text-slate-500">
              {isTrial
                ? `Paying $${MONTHLY_FEE_USD.toFixed(2)} early preserves all remaining trial time and adds 30 full days starting ${formatDate(mechanic.trialEndsAtMs)}.`
                : 'Your 7-day trial has ended. Complete a $4.00 monthly payment below to unlock immediate bidding.'}
            </p>
          </div>
        )}
      </div>

      {/* $4/Month Payment Handling & Auto-Renew Controls */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h4 className="font-display text-lg font-bold text-slate-900">
              Handle $4.00/Month Subscription Payment
            </h4>
            <p className="text-xs text-slate-600 mt-0.5">
              Choose card or QR payment to activate or extend your mechanic dispatch access by 30 days.
            </p>
          </div>

          <button
            type="button"
            disabled={savingAutoRenew}
            onClick={() => void handleToggleAutoRenew()}
            className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-800 inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${autoRenew ? 'text-emerald-600' : 'text-slate-400'}`} />
            <span>Auto-Renew: {autoRenew ? 'On ($4/mo)' : 'Manual'}</span>
          </button>
        </div>

        {/* Destination Settlement Account */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <Landmark className="w-5 h-5 text-slate-700 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="text-xs font-semibold text-slate-900">
                WrenchBid Subscription Payout Account
              </div>
              <div className="text-xs text-slate-600">
                Only the $4.00/month mechanic subscription goes to account{' '}
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {PLATFORM_PAYOUT_ACCOUNT}
                </span>
                . Customer repair QR payments go directly to you.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleCopyAccount()}
            className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
          >
            {copiedAccount ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Account</span>
              </>
            )}
          </button>
        </div>

        {/* Method Selection */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => void handleSelectMethod('card')}
            className={`min-h-[56px] p-4 rounded-xl border text-left flex items-center gap-3 transition-colors ${
              selectedMethod === 'card'
                ? 'border-orange-600 bg-orange-50/60 text-slate-900'
                : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
            }`}
          >
            <CreditCard
              className={`w-5 h-5 shrink-0 ${
                selectedMethod === 'card' ? 'text-orange-600' : 'text-slate-400'
              }`}
            />
            <div>
              <div className="text-sm font-semibold">Debit / Credit Card</div>
              <div className="text-xs text-slate-500">Settles $4.00 to {PLATFORM_PAYOUT_ACCOUNT}</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => void handleSelectMethod('qr_pay')}
            className={`min-h-[56px] p-4 rounded-xl border text-left flex items-center gap-3 transition-colors ${
              selectedMethod === 'qr_pay'
                ? 'border-orange-600 bg-orange-50/60 text-slate-900'
                : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
            }`}
          >
            <QrCode
              className={`w-5 h-5 shrink-0 ${
                selectedMethod === 'qr_pay' ? 'text-orange-600' : 'text-slate-400'
              }`}
            />
            <div>
              <div className="text-sm font-semibold">Subscription QR Pay</div>
              <div className="text-xs text-slate-500">Scan QR to pay {PLATFORM_PAYOUT_ACCOUNT}</div>
            </div>
          </button>
        </div>

        {selectedMethod === 'qr_pay' && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row items-center gap-5">
            <div className="p-2.5 bg-white border border-slate-200 rounded-xl shrink-0">
              <QRCodeSVG
                value={subscriptionQrPayload}
                size={112}
                level="M"
                bgColor="#FFFFFF"
                fgColor="#0F172A"
              />
            </div>
            <div className="space-y-1 text-center sm:text-left">
              <div className="text-xs font-semibold text-slate-900">
                WrenchBid Mechanic Plan QR Checkout
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Scan this QR code in your payment app to send <strong>$4.00 USD</strong> to account{' '}
                <strong className="font-mono">{PLATFORM_PAYOUT_ACCOUNT}</strong> for 30 days of unlimited roadside bidding, then tap Confirm Payment below.
              </p>
              <div className="text-[11px] font-mono text-slate-500 break-all">
                {subscriptionQrPayload}
              </div>
            </div>
          </div>
        )}

        {paymentNotice && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-xs font-medium text-emerald-900 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{paymentNotice}</span>
          </div>
        )}

        <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-xs text-slate-600">
            New coverage end date:{' '}
            <strong className="text-slate-900 tabular-nums">
              {formatDate(nextCoverageEndMs)}
            </strong>{' '}
            (+30 days)
          </div>

          <button
            type="button"
            disabled={processingPayment}
            onClick={() => void handlePayMonthlySubscription()}
            className="min-h-[46px] px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
          >
            <ShieldCheck className="w-4 h-4 text-orange-400" />
            {processingPayment
              ? 'Processing $4.00...'
              : isPaidActive
              ? `Extend +1 Month ($${MONTHLY_FEE_USD.toFixed(2)})`
              : `Pay $${MONTHLY_FEE_USD.toFixed(2)} & Activate Plan`}
          </button>
        </div>
      </div>

      {/* Billing & Payment Receipts Ledger */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-slate-700" />
            <h4 className="font-display text-base font-bold text-slate-900">
              Subscription Payment History
            </h4>
          </div>
          <span className="text-xs text-slate-500 tabular-nums">
            {payments.length} {payments.length === 1 ? 'receipt' : 'receipts'}
          </span>
        </div>

        {paymentsLoading ? (
          <div className="p-5 text-xs text-slate-500">Loading billing ledger...</div>
        ) : payments.length === 0 ? (
          <div className="p-6 text-center space-y-1">
            <div className="text-sm font-medium text-slate-800">No subscription payments yet</div>
            <p className="text-xs text-slate-500">
              {isTrial
                ? 'You are currently covered by your 7-day free trial. Your $4.00 receipts will appear here.'
                : 'Complete a $4.00 payment above to record your first monthly receipt.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Paid Date</th>
                  <th className="px-5 py-3 font-semibold">Method</th>
                  <th className="px-5 py-3 font-semibold">Valid Through</th>
                  <th className="px-5 py-3 font-semibold text-right">Amount</th>
                  <th className="px-5 py-3 font-semibold text-right">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((p) => {
                  const paidMs = p.paidAt?.toMillis?.() ?? Date.now();
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3.5 text-slate-800 tabular-nums whitespace-nowrap">
                        {formatDate(paidMs)}
                      </td>
                      <td className="px-5 py-3.5 text-slate-700 whitespace-nowrap">
                        {p.method === 'qr_pay' ? 'QR Pay' : 'Card'}
                      </td>
                      <td className="px-5 py-3.5 text-slate-700 tabular-nums whitespace-nowrap">
                        {formatDate(p.validUntilMs)}
                      </td>
                      <td className="px-5 py-3.5 font-semibold text-slate-900 tabular-nums text-right whitespace-nowrap">
                        ${p.amountUsd.toFixed(2)}
                      </td>
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setSelectedReceipt(p)}
                          className="text-orange-700 hover:text-orange-800 font-semibold hover:underline underline-offset-2"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Receipt Detail Modal */}
      {selectedReceipt && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="receipt-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedReceipt(null);
          }}
        >
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3">
              <div>
                <div className="text-xs text-slate-500">WrenchBid Billing Receipt</div>
                <h5 id="receipt-modal-title" className="font-display text-lg font-bold text-slate-900">
                  Mechanic Monthly Plan
                </h5>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReceipt(null)}
                aria-label="Close receipt"
                className="min-w-[40px] min-h-[40px] rounded-xl border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <dl className="divide-y divide-slate-100 text-xs">
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-slate-500">Receipt ID</dt>
                <dd className="font-mono text-slate-800">{selectedReceipt.id}</dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-slate-500">Mechanic</dt>
                <dd className="font-medium text-slate-900">{mechanic.displayName}</dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-slate-500">Payment Method</dt>
                <dd className="font-medium text-slate-900">
                  {selectedReceipt.method === 'qr_pay' ? 'Subscription QR Pay' : 'Debit / Credit Card'}
                </dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-slate-500">Destination Account</dt>
                <dd className="font-mono font-medium text-slate-900 tabular-nums">
                  {selectedReceipt.recipientAccount || PLATFORM_PAYOUT_ACCOUNT}
                </dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-slate-500">Paid On</dt>
                <dd className="font-medium text-slate-900 tabular-nums">
                  {formatDateTime(selectedReceipt.paidAt?.toMillis?.() ?? Date.now())}
                </dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-slate-500">Coverage Valid Through</dt>
                <dd className="font-medium text-slate-900 tabular-nums">
                  {formatDateTime(selectedReceipt.validUntilMs)}
                </dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-slate-500">Total Paid</dt>
                <dd className="font-display text-base font-bold text-emerald-700 tabular-nums">
                  ${selectedReceipt.amountUsd.toFixed(2)} USD
                </dd>
              </div>
            </dl>

            <button
              type="button"
              onClick={() => setSelectedReceipt(null)}
              className="w-full min-h-[42px] rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
