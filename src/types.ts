import { Timestamp } from 'firebase/firestore';

export type UserRole = 'motorist' | 'mechanic';
export type IssueCategory = 'tire' | 'battery' | 'engine' | 'tow' | 'lockout' | 'brakes';
export type RequestStatus =
  | 'open'
  | 'accepted'
  | 'arrived'
  | 'in_progress'
  | 'payment_pending'
  | 'completed'
  | 'cancelled';
export type BidStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';
export type SubscriptionStatus = 'trial' | 'active' | 'expired';
export type PaymentMethod = 'qr_pay' | 'card';

export const TRIAL_DAYS = 7;
export const TRIAL_DURATION_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;
export const MONTHLY_FEE_USD = 4;
export const BILLING_CYCLE_MS = 30 * 24 * 60 * 60 * 1000;
export const PLATFORM_PAYOUT_ACCOUNT = '4638330011712851';

export const LIMITS = {
  displayNameMin: 1,
  displayNameMax: 80,
  mechanicNameMin: 2,
  mechanicNameMax: 80,
  specialtyMin: 2,
  specialtyMax: 80,
  vehicleMin: 2,
  vehicleMax: 80,
  issueNotesMin: 3,
  issueNotesMax: 320,
  locationMin: 2,
  locationMax: 120,
  offerMin: 5,
  offerMax: 5000,
  etaMin: 1,
  etaMax: 240,
  bidNoteMax: 200,
  qrUriMin: 4,
  qrUriMax: 240,
  qrLabelMin: 2,
  qrLabelMax: 80,
  ratingCommentMax: 280,
} as const;

export const RATING_LABELS: Record<number, string> = {
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Very Good',
  5: 'Excellent',
};

export const ISSUE_CATEGORIES: { id: IssueCategory; label: string; suggestedUsd: number }[] = [
  { id: 'tire', label: 'Flat Tire', suggestedUsd: 55 },
  { id: 'battery', label: 'Jump Start / Battery', suggestedUsd: 45 },
  { id: 'lockout', label: 'Key Lockout', suggestedUsd: 50 },
  { id: 'brakes', label: 'Brakes / Rotor', suggestedUsd: 95 },
  { id: 'engine', label: 'Engine / Belt / Stall', suggestedUsd: 110 },
  { id: 'tow', label: 'Winch / Short Tow', suggestedUsd: 125 },
];

export const MECHANIC_AVATARS = [
  '/src/assets/images/mechanic_avatar_one_1795666623319.jpg',
  '/src/assets/images/mechanic_avatar_two_1795666623466.jpg',
  '/src/assets/images/mechanic_avatar_three_1795666624047.jpg',
] as const;

export const HERO_MECHANIC_IMAGE = '/src/assets/images/hero_roadside_mechanic_1795666623592.jpg';

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  phone?: string;
  role: UserRole;
  vehicleSummary?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface MechanicProfile {
  uid: string;
  displayName: string;
  specialty: string;
  avatarUrl?: string;
  rating: number;
  completedJobs: number;
  lat: number;
  lng: number;
  isOnline: boolean;
  qrPaymentUri: string;
  qrPaymentLabel: string;
  trialStartedAt: Timestamp;
  trialEndsAtMs: number;
  subscriptionStatus: SubscriptionStatus;
  subscriptionPaidUntilMs: number;
  monthlyFeeUsd: number;
  autoRenew?: boolean;
  preferredBillingMethod?: PaymentMethod;
  lastPaymentId?: string;
  ratingCount?: number;
  ratingSum?: number;
  lastRatingId?: string;
  updatedAt: Timestamp;
}

export interface BreakdownRequest {
  id: string;
  motoristId: string;
  motoristName: string;
  vehicleMakeModel: string;
  issueCategory: IssueCategory;
  issueNotes: string;
  locationLabel: string;
  lat: number;
  lng: number;
  offerPriceUsd: number;
  status: RequestStatus;
  acceptedBidId?: string;
  acceptedMechanicId?: string;
  acceptedMechanicName?: string;
  agreedPriceUsd?: number;
  qrPaymentUri?: string;
  qrPaymentLabel?: string;
  paymentConfirmedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface MechanicBid {
  id: string;
  requestId: string;
  motoristId: string;
  mechanicId: string;
  mechanicName: string;
  mechanicSpecialty: string;
  mechanicRating: number;
  bidAmountUsd: number;
  etaMinutes: number;
  note?: string;
  qrPaymentUri: string;
  qrPaymentLabel: string;
  status: BidStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface SubscriptionPayment {
  id: string;
  mechanicId: string;
  amountUsd: number;
  billingMonths: number;
  method: PaymentMethod;
  validUntilMs: number;
  recipientAccount?: string;
  paidAt: Timestamp;
}

export interface MechanicRating {
  id: string;
  requestId: string;
  motoristId: string;
  motoristName: string;
  mechanicId: string;
  mechanicName: string;
  vehicleMakeModel: string;
  stars: number;
  comment?: string;
  createdAt: Timestamp;
}

export function isMechanicSubscriptionValid(mech: MechanicProfile | null, nowMs = Date.now()): boolean {
  if (!mech) return false;
  if (mech.subscriptionStatus === 'trial' && mech.trialEndsAtMs > nowMs) return true;
  if (mech.subscriptionStatus === 'active' && mech.subscriptionPaidUntilMs > nowMs) return true;
  return false;
}

export function formatDurationRemaining(targetMs: number, nowMs = Date.now()): string {
  const diff = Math.max(0, targetMs - nowMs);
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  if (days >= 1) {
    return `${days}d ${hours}h left`;
  }
  const mins = Math.max(1, Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000)));
  return `${hours}h ${mins}m left`;
}
