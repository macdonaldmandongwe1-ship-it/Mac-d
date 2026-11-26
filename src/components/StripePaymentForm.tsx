import React, { useMemo, useState } from 'react';
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import { Lock } from 'lucide-react';
import { getStripeJsPromise } from '../utils/stripeClient';

interface StripePaymentFormProps {
  publishableKey: string;
  clientSecret: string;
  amountLabel: string;
  submitLabel: string;
  onSuccess: (paymentIntentId: string) => Promise<void>;
  onCancel: () => void;
}

const InnerCheckoutForm: React.FC<{
  amountLabel: string;
  submitLabel: string;
  onSuccess: (paymentIntentId: string) => Promise<void>;
  onCancel: () => void;
}> = ({ amountLabel, submitLabel, onSuccess, onCancel }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setErrorText(null);
    setProcessing(true);
    try {
      const result = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
      });

      if (result.error) {
        setErrorText(result.error.message || 'Card authorization failed. Please check your details.');
        setProcessing(false);
        return;
      }

      if (!result.paymentIntent || result.paymentIntent.status !== 'succeeded') {
        setErrorText('Payment confirmation was not completed. Please try again.');
        setProcessing(false);
        return;
      }

      await onSuccess(result.paymentIntent.id);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : 'Unable to complete Stripe payment.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleConfirm} className="space-y-4 bg-[#FAF9F6] border border-[#D8D3C8] rounded-xl p-4">
      <div className="flex items-center justify-between text-xs text-zinc-600 border-b border-[#E6E3DC] pb-2.5">
        <span className="inline-flex items-center gap-1.5 font-medium text-zinc-800">
          <Lock className="w-3.5 h-3.5 text-[#1E3A8A]" />
          Secured by Stripe
        </span>
        <span className="font-mono font-semibold text-zinc-900 tabular-nums">{amountLabel}</span>
      </div>

      <PaymentElement />

      {errorText && (
        <p role="alert" className="text-xs p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-900">
          {errorText}
        </p>
      )}

      <div className="flex items-center justify-end gap-2.5 pt-1">
        <button
          type="button"
          disabled={processing}
          onClick={onCancel}
          className="min-h-[40px] px-3.5 py-2 rounded-lg border border-[#D8D3C8] bg-white text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!stripe || processing}
          className="min-h-[40px] px-4 py-2 rounded-lg bg-[#1E3A8A] text-white text-xs font-medium hover:bg-[#1E40AF] transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
        >
          {processing ? 'Authorizing...' : submitLabel}
        </button>
      </div>
    </form>
  );
};

export const StripePaymentForm: React.FC<StripePaymentFormProps> = ({
  publishableKey,
  clientSecret,
  amountLabel,
  submitLabel,
  onSuccess,
  onCancel,
}) => {
  const stripePromise = useMemo(
    () => getStripeJsPromise(publishableKey),
    [publishableKey]
  );

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: '#1E3A8A',
            colorBackground: '#FFFFFF',
            colorText: '#18181B',
            borderRadius: '8px',
          },
        },
      }}
    >
      <InnerCheckoutForm
        amountLabel={amountLabel}
        submitLabel={submitLabel}
        onSuccess={onSuccess}
        onCancel={onCancel}
      />
    </Elements>
  );
};
