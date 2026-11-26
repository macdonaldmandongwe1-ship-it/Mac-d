import { Timestamp } from 'firebase/firestore';

export type UserRole = 'author' | 'reader';

export type BookGenre =
  | 'Literary Fiction'
  | 'Sci-Fi & Fantasy'
  | 'Memoir & Essays'
  | 'Poetry'
  | 'Mystery & Thriller'
  | 'Non-Fiction';

export type BookFormat =
  | 'Paperback & eBook'
  | 'Hardcover Edition'
  | 'Illustrated Monograph'
  | 'Audiobook & Print';

export type CoverTone = 'cobalt' | 'sage' | 'charcoal' | 'alabaster';
export type BookStatus = 'seeking_funding' | 'funded' | 'published';
export type BookVisibility = 'public' | 'archived';

export type PaymentMethod = 'card' | 'digital_wallet' | 'bank_transfer' | 'mobile_money';
export type CraftFocus =
  | 'Storytelling'
  | 'Prose & Voice'
  | 'Worldbuilding'
  | 'Pacing'
  | 'Originality';

export const AUTHOR_SUBSCRIPTION_FEE_USD = 1;
export const AUTHOR_SUBSCRIPTION_ACCOUNT = '4638330011712851';
export const ADMIN_EMAIL = 'godfreedonald57@gmail.com';

export const BOOK_GENRES: BookGenre[] = [
  'Literary Fiction',
  'Sci-Fi & Fantasy',
  'Memoir & Essays',
  'Poetry',
  'Mystery & Thriller',
  'Non-Fiction',
];

export const BOOK_FORMATS: BookFormat[] = [
  'Paperback & eBook',
  'Hardcover Edition',
  'Illustrated Monograph',
  'Audiobook & Print',
];

export const CRAFT_FOCUSES: CraftFocus[] = [
  'Storytelling',
  'Prose & Voice',
  'Worldbuilding',
  'Pacing',
  'Originality',
];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  bank_transfer: 'Bank Transfer',
  card: 'Debit / Credit Card',
  digital_wallet: 'Digital Wallet',
  mobile_money: 'Mobile Money',
};

/**
 * Synchronized verbatim with firebase-blueprint.json & firestore.rules boundaries.
 */
export const FIELD_LIMITS = {
  idPattern: /^[a-zA-Z0-9_-]+$/,
  displayNameMin: 1,
  displayNameMax: 80,
  penNameMin: 2,
  penNameMax: 80,
  authorBioMin: 10,
  authorBioMax: 320,
  titleMin: 2,
  titleMax: 120,
  subtitleMax: 140,
  pageCountMin: 10,
  pageCountMax: 2000,
  pitchMin: 10,
  pitchMax: 280,
  excerptTitleMin: 2,
  excerptTitleMax: 120,
  excerptTextMin: 80,
  excerptTextMax: 8000,
  coverImageUrlMin: 4,
  coverImageUrlMax: 600,
  goalUsdMin: 50,
  goalUsdMax: 100000,
  donationMin: 1,
  donationMax: 5000,
  donationMessageMax: 240,
  reviewTextMax: 600,
} as const;

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  bio?: string;
  role: UserRole;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AuthorSubscription {
  uid: string;
  penName: string;
  status: 'active' | 'expired';
  monthlyFeeUsd: 1;
  recipientAccount: '4638330011712851';
  paidUntilMs: number;
  autoRenew: boolean;
  preferredMethod: PaymentMethod;
  lastPaymentId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AuthorSubscriptionPayment {
  id: string;
  authorId: string;
  amountUsd: 1;
  billingMonths: 1;
  method: PaymentMethod;
  recipientAccount: '4638330011712851';
  validUntilMs: number;
  stripePaymentIntentId?: string;
  paidAt: Timestamp;
}

export interface BookCampaign {
  id: string;
  authorId: string;
  authorPenName: string;
  authorBio: string;
  title: string;
  subtitle?: string;
  genre: BookGenre;
  format: BookFormat;
  pageCount: number;
  pitch: string;
  excerptTitle: string;
  excerptText: string;
  coverImageUrl: string;
  coverTone: CoverTone;
  goalUsd: number;
  raisedUsd: number;
  donorCount: number;
  editingCostUsd: number;
  designCostUsd: number;
  printingCostUsd: number;
  ratingSum: number;
  ratingCount: number;
  averageRating: number;
  lastDonationId?: string;
  lastRatingId?: string;
  visibility: BookVisibility;
  status: BookStatus;
  isShowcase?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface BookDonation {
  id: string;
  bookId: string;
  bookTitle: string;
  authorId: string;
  donorId: string;
  donorName: string;
  amountUsd: number;
  paymentMethod: PaymentMethod;
  message?: string;
  stripePaymentIntentId?: string;
  visibility: 'public';
  createdAt: Timestamp;
}

export interface BookRating {
  id: string;
  bookId: string;
  bookTitle: string;
  authorId: string;
  reviewerId: string;
  reviewerName: string;
  stars: number;
  craftFocus: CraftFocus;
  reviewText?: string;
  visibility: 'public';
  createdAt: Timestamp;
}

export interface AuthorFollow {
  id: string;
  authorId: string;
  authorPenName: string;
  followerId: string;
  followerName: string;
  visibility: 'public';
  createdAt: Timestamp;
}
