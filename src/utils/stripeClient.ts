import { loadStripe, Stripe } from '@stripe/stripe-js';
import type { User } from 'firebase/auth';

export interface StripeConfigResponse {
  configured: boolean;
  publishableKey: string | null;
}

let cachedStripePromise: Promise<Stripe | null> | null = null;
let cachedPublishableKey: string | null = null;

export async function fetchStripeConfig(): Promise<StripeConfigResponse> {
  try {
    const res = await fetch('/api/stripe/config');
    if (!res.ok) {
      return { configured: false, publishableKey: null };
    }
    const data = (await res.json()) as Partial<StripeConfigResponse>;
    return {
      configured: Boolean(data.configured && data.publishableKey),
      publishableKey: data.publishableKey || null,
    };
  } catch {
    return { configured: false, publishableKey: null };
  }
}

export function getStripeJsPromise(publishableKey: string): Promise<Stripe | null> {
  if (!cachedStripePromise || cachedPublishableKey !== publishableKey) {
    cachedPublishableKey = publishableKey;
    cachedStripePromise = loadStripe(publishableKey);
  }
  return cachedStripePromise;
}

export async function createDonationPaymentIntent(
  user: User,
  params: {
    bookId: string;
    authorId: string;
    bookTitle: string;
    amountUsd: number;
  }
): Promise<{ clientSecret: string; paymentIntentId: string; amountUsd: number }> {
  const token = await user.getIdToken();
  const res = await fetch('/api/stripe/create-donation-intent', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(params),
  });
  const data = (await res.json()) as {
    clientSecret?: string;
    paymentIntentId?: string;
    amountUsd?: number;
    error?: string;
  };
  if (!res.ok || !data.clientSecret || !data.paymentIntentId) {
    throw new Error(data.error || 'Could not start Stripe donation checkout.');
  }
  return {
    clientSecret: data.clientSecret,
    paymentIntentId: data.paymentIntentId,
    amountUsd: data.amountUsd || params.amountUsd,
  };
}

export async function createSubscriptionPaymentIntent(
  user: User,
  penName: string
): Promise<{ clientSecret: string; paymentIntentId: string; amountUsd: number }> {
  const token = await user.getIdToken();
  const res = await fetch('/api/stripe/create-subscription-intent', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ penName }),
  });
  const data = (await res.json()) as {
    clientSecret?: string;
    paymentIntentId?: string;
    amountUsd?: number;
    error?: string;
  };
  if (!res.ok || !data.clientSecret || !data.paymentIntentId) {
    throw new Error(data.error || 'Could not start Stripe subscription checkout.');
  }
  return {
    clientSecret: data.clientSecret,
    paymentIntentId: data.paymentIntentId,
    amountUsd: 1,
  };
}

export async function verifyStripePaymentIntent(
  user: User,
  params: {
    paymentIntentId: string;
    expectedKind: 'book_donation' | 'author_subscription';
    bookId?: string;
  }
): Promise<{ verified: boolean; paymentIntentId: string; amountUsd: number }> {
  const token = await user.getIdToken();
  const res = await fetch('/api/stripe/verify-payment', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(params),
  });
  const data = (await res.json()) as {
    verified?: boolean;
    paymentIntentId?: string;
    amountUsd?: number;
    error?: string;
  };
  if (!res.ok || !data.verified || !data.paymentIntentId) {
    throw new Error(data.error || 'Payment verification failed.');
  }
  return {
    verified: true,
    paymentIntentId: data.paymentIntentId,
    amountUsd: data.amountUsd || 0,
  };
}
