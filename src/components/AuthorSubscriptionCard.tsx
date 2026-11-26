import React, { useState } from 'react';
import { CreditCard, ShieldCheck } from 'lucide-react';
import type { User } from 'firebase/auth';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  AUTHOR_SUBSCRIPTION_ACCOUNT,
  AUTHOR_SUBSCRIPTION_FEE_USD,
  AuthorSubscription,
  AuthorSubscriptionPayment,
  FIELD_LIMITS,
  PAYMENT_METHOD_LABELS,
  PaymentMethod,
} from '../types';
import {
  StripeConfigResponse,
  createSubscriptionPaymentIntent,
  verifyStripePaymentIntent,
} from '../utils/stripeClient';
import { StripePaymentForm } from './StripePaymentForm';

interface AuthorSubscriptionCardProps {
  currentUser: User;
  defaultPenName: string;
  subscription: AuthorSubscription | null;
  payments: AuthorSubscriptionPayment[];
  stripeConfig: StripeConfigResponse;
}

const METHODS: PaymentMethod[] = ['card', 'digital_wallet', 'bank_transfer', 'mobile_money'];

export const AuthorSubscriptionCard: React.FC<AuthorSubscriptionCardProps> = ({
  currentUser,
  defaultPenName,
  subscription,
  payments,
  stripeConfig,
}) => {
  const uid = currentUser.uid;
  const [penName, setPenName] = useState(subscription?.penName || defaultPenName || '');
  const [method, setMethod] = useState<PaymentMethod>(
    subscription?.preferredMethod || 'card'
  );
  const [autoRenew, setAutoRenew] = useState<boolean>(subscription?.autoRenew ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [pendingClientSecret, setPendingClientSecret] = useState<string | null>(null);
  const [pendingPenName, setPendingPenName] = useState<string>('');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const nowMs = Date.now();
  const isActive = Boolean(
    subscription &&
      subscription.status === 'active' &&
      subscription.paidUntilMs > nowMs
  );

  const daysRemaining = isActive && subscription
    ? Math.max(1, Math.ceil((subscription.paidUntilMs - nowMs) / (1000 * 60 * 60 * 24)))
    : 0;

  const commitSubscriptionRecord = async (
    cleanPen: string,
    stripePaymentIntentId?: string
  ) => {
    const paymentId = `asub_${uid.slice(0, 12)}_${Date.now()}`;
    const baseMs = isActive && subscription ? subscription.paidUntilMs : Date.now();
    const validUntilMs = baseMs + 30 * 24 * 60 * 60 * 1000;

    const batch = writeBatch(db);
    const subRef = doc(db, 'authorSubscriptions', uid);
    const payRef = doc(db, 'authorSubscriptionPayments', paymentId);

    if (!subscription) {
      batch.set(subRef, {
        uid,
        penName: cleanPen,
        status: 'active',
        monthlyFeeUsd: AUTHOR_SUBSCRIPTION_FEE_USD,
        recipientAccount: AUTHOR_SUBSCRIPTION_ACCOUNT,
        paidUntilMs: validUntilMs,
        autoRenew,
        preferredMethod: method,
        lastPaymentId: paymentId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.update(subRef, {
        status: 'active',
        paidUntilMs: validUntilMs,
        lastPaymentId: paymentId,
        preferredMethod: method,
        updatedAt: serverTimestamp(),
      });
    }

    const payPayload: Record<string, unknown> = {
      id: paymentId,
      authorId: uid,
      amountUsd: AUTHOR_SUBSCRIPTION_FEE_USD,
      billingMonths: 1,
      method,
      recipientAccount: AUTHOR_SUBSCRIPTION_ACCOUNT,
      validUntilMs,
      paidAt: serverTimestamp(),
    };
    if (stripePaymentIntentId) {
      payPayload.stripePaymentIntentId = stripePaymentIntentId;
    }
    batch.set(payRef, payPayload);

    await batch.commit();
    setFeedback({
      type: 'ok',
      text: `$1.00 monthly author subscription activated${
        stripePaymentIntentId ? ' via Stripe' : ''
      }. Publishing unlocked through ${new Date(validUntilMs).toLocaleDateString()}.`,
    });
  };

  const handleSubscribeOrRenew = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const trimmedPen = (penName || defaultPenName).trim();
    if (trimmedPen.length < FIELD_LIMITS.penNameMin || trimmedPen.length > FIELD_LIMITS.penNameMax) {
      setFeedback({
        type: 'error',
        text: `Author pen name must be between ${FIELD_LIMITS.penNameMin} and ${FIELD_LIMITS.penNameMax} characters.`,
      });
      return;
    }

    setSubmitting(true);
    try {
      if (stripeConfig.configured && stripeConfig.publishableKey) {
        const intent = await createSubscriptionPaymentIntent(currentUser, trimmedPen);
        setPendingPenName(trimmedPen);
        setPendingClientSecret(intent.clientSecret);
        return;
      }

      await commitSubscriptionRecord(trimmedPen);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('{')) {
        handleFirestoreError(err, OperationType.WRITE, `authorSubscriptions/${uid}`);
      } else {
        setFeedback({
          type: 'error',
          text: err instanceof Error ? err.message : 'Unable to activate subscription.',
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleStripeSuccess = async (paymentIntentId: string) => {
    await verifyStripePaymentIntent(currentUser, {
      paymentIntentId,
      expectedKind: 'author_subscription',
    });
    await commitSubscriptionRecord(pendingPenName || penName.trim() || defaultPenName, paymentIntentId);
    setPendingClientSecret(null);
    setPendingPenName('');
  };

  const handleSavePreferences = async () => {
    if (!subscription) return;
    const trimmedPen = penName.trim();
    if (trimmedPen.length < FIELD_LIMITS.penNameMin || trimmedPen.length > FIELD_LIMITS.penNameMax) {
      setFeedback({
        type: 'error',
        text: `Author pen name must be between ${FIELD_LIMITS.penNameMin} and ${FIELD_LIMITS.penNameMax} characters.`,
      });
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    const batch = writeBatch(db);
    batch.update(doc(db, 'authorSubscriptions', uid), {
      penName: trimmedPen,
      autoRenew,
      preferredMethod: method,
      updatedAt: serverTimestamp(),
    });
    try {
      await batch.commit();
      setFeedback({ type: 'ok', text: 'Membership preferences saved.' });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `authorSubscriptions/${uid}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="bg-white border border-[#E6E3DC] rounded-xl p-6 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 border-b border-[#E6E3DC] pb-5">
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">
            Author Publishing Membership
          </p>
          <h2 className="font-display text-2xl font-semibold text-zinc-900">
            $1 / Month Author Subscription
          </h2>
          <p className="text-sm text-zinc-600 max-w-2xl">
            Beginner authors subscribe for <span className="font-mono font-semibold text-zinc-900">$1.00/month</span> to list manuscripts, collect publishing donations, and receive community ratings.
          </p>
        </div>

        <div className="shrink-0 text-left md:text-right space-y-1">
          <p className="text-xs text-zinc-500">Status</p>
          <p className={`text-sm font-semibold ${isActive ? 'text-emerald-800' : 'text-amber-800'}`}>
            {isActive ? `Active · ${daysRemaining} days remaining` : 'Inactive · Subscription required to publish'}
          </p>
          {isActive && subscription && (
            <p className="text-xs font-mono text-zinc-500 tabular-nums">
              Valid until {new Date(subscription.paidUntilMs).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>

      {!stripeConfig.configured && (
        <p className="text-xs text-zinc-600 bg-[#FAF9F6] border border-[#E6E3DC] rounded-lg px-3.5 py-2.5">
          Preview ledger mode active. Add <span className="font-mono">STRIPE_SECRET_KEY</span> and{' '}
          <span className="font-mono">STRIPE_PUBLISHABLE_KEY</span> in Settings → Secrets to collect live $1/month Stripe payments.
        </p>
      )}

      {/* Payment & Activation Form */}
      {pendingClientSecret && stripeConfig.publishableKey ? (
        <StripePaymentForm
          publishableKey={stripeConfig.publishableKey}
          clientSecret={pendingClientSecret}
          amountLabel="$1.00 / month"
          submitLabel="Confirm $1.00 Subscription"
          onSuccess={handleStripeSuccess}
          onCancel={() => setPendingClientSecret(null)}
        />
      ) : (
        <form onSubmit={handleSubscribeOrRenew} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="space-y-1.5">
            <label htmlFor="sub-pen-name" className="block text-xs font-medium text-zinc-700">
              Author Pen Name
            </label>
            <input
              id="sub-pen-name"
              type="text"
              value={penName}
              onChange={(e) => setPenName(e.target.value)}
              maxLength={FIELD_LIMITS.penNameMax}
              required
              placeholder="e.g., Clara Thornton"
              className="w-full min-h-[42px] px-3.5 py-2 rounded-lg border border-[#D8D3C8] bg-white text-sm text-zinc-900 focus:outline-none focus:border-[#1E3A8A]"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="sub-method" className="block text-xs font-medium text-zinc-700">
              Payment Method
            </label>
            <select
              id="sub-method"
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              className="w-full min-h-[42px] px-3.5 py-2 rounded-lg border border-[#D8D3C8] bg-white text-sm text-zinc-900 focus:outline-none focus:border-[#1E3A8A]"
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 min-h-[42px] px-4 py-2 rounded-lg bg-[#1E3A8A] text-white text-sm font-medium inline-flex items-center justify-center gap-2 hover:bg-[#1E40AF] transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              <CreditCard className="w-4 h-4" />
              {submitting
                ? 'Preparing...'
                : isActive
                  ? 'Extend +1 Month ($1)'
                  : stripeConfig.configured
                    ? 'Pay $1 via Stripe'
                    : 'Pay $1 & Activate'}
            </button>
          </div>
        </form>
      )}

      {/* Auto-Renew & Save Preferences */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
        <label className="inline-flex items-center gap-2.5 text-sm text-zinc-700 cursor-pointer">
          <input
            type="checkbox"
            checked={autoRenew}
            onChange={(e) => setAutoRenew(e.target.checked)}
            className="w-4 h-4 rounded border-zinc-300 text-[#1E3A8A] focus:ring-[#1E3A8A]"
          />
          <span>Auto-renew $1/month membership reminder</span>
        </label>

        {subscription && (
          <button
            type="button"
            disabled={submitting}
            onClick={handleSavePreferences}
            className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-[#D8D3C8] text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors cursor-pointer"
          >
            Save Preferences
          </button>
        )}
      </div>

      {feedback && (
        <div
          role="status"
          className={`p-3.5 rounded-lg text-sm flex items-start gap-2.5 ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
              : 'bg-red-50 border border-red-200 text-red-900'
          }`}
        >
          <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Payment Receipts Ledger */}
      {payments.length > 0 && (
        <div className="pt-4 border-t border-[#E6E3DC] space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">
            Verified $1/Month Payment Receipts
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-zinc-700">
              <thead>
                <tr className="border-b border-[#E6E3DC] text-zinc-500">
                  <th className="py-2 pr-4 font-medium">Receipt ID</th>
                  <th className="py-2 pr-4 font-medium">Destination</th>
                  <th className="py-2 pr-4 font-medium">Method</th>
                  <th className="py-2 pr-4 font-medium">Amount</th>
                  <th className="py-2 font-medium">Valid Through</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1EFE9]">
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2.5 pr-4 font-mono text-zinc-600">
                      {(p.stripePaymentIntentId || p.id).slice(0, 20)}
                    </td>
                    <td className="py-2.5 pr-4 text-zinc-700">
                      {p.stripePaymentIntentId ? 'Stripe · FirstFolio' : 'FirstFolio Settlement'}
                    </td>
                    <td className="py-2.5 pr-4">{PAYMENT_METHOD_LABELS[p.method]}</td>
                    <td className="py-2.5 pr-4 font-mono font-medium text-zinc-900 tabular-nums">
                      ${p.amountUsd}.00
                    </td>
                    <td className="py-2.5 font-mono tabular-nums">
                      {new Date(p.validUntilMs).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};
