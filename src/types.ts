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

export type CustomerPaymentMethod =
  | 'cash'
  | 'mobile_money'
  | 'card'
  | 'bank_transfer'
  | 'upi'
  | 'pix'
  | 'digital_wallet'
  | 'crypto';

export type IdentityDocumentType = 'national_id' | 'passport';
export type IdentityVerificationStatus = 'unverified' | 'pending_review' | 'verified' | 'rejected';

export const ADMIN_EMAIL = 'godfreedonald57@gmail.com';
export const MIN_MECHANIC_TEAM_SIZE = 3;

export const CUSTOMER_PAYMENT_METHODS: {
  id: CustomerPaymentMethod;
  label: string;
  region: string;
  examples: string;
  usesQrSettlement: boolean;
}[] = [
  {
    id: 'cash',
    label: 'Cash',
    region: 'Global',
    examples: 'Direct cash on site',
    usesQrSettlement: false,
  },
  {
    id: 'mobile_money',
    label: 'Mobile Money',
    region: 'Africa & Emerging',
    examples: 'M-Pesa · MTN MoMo · Airtel · Wave',
    usesQrSettlement: true,
  },
  {
    id: 'card',
    label: 'Card',
    region: 'Global',
    examples: 'Visa · Mastercard · Amex · UnionPay',
    usesQrSettlement: true,
  },
  {
    id: 'bank_transfer',
    label: 'Bank Transfer',
    region: 'Global',
    examples: 'SEPA · ACH · Faster Payments · SPEI',
    usesQrSettlement: false,
  },
  {
    id: 'upi',
    label: 'UPI',
    region: 'India & South Asia',
    examples: 'Google Pay · PhonePe · Paytm · BHIM',
    usesQrSettlement: true,
  },
  {
    id: 'pix',
    label: 'Pix',
    region: 'Brazil & LatAm',
    examples: 'Instant Pix QR / Chave Pix',
    usesQrSettlement: true,
  },
  {
    id: 'digital_wallet',
    label: 'Digital Wallet',
    region: 'Global & APAC',
    examples: 'PayPal · Alipay · WeChat · GrabPay · GCash',
    usesQrSettlement: true,
  },
  {
    id: 'crypto',
    label: 'Crypto',
    region: 'Global',
    examples: 'USDC · USDT · Bitcoin Lightning',
    usesQrSettlement: true,
  },
];

export const GLOBAL_SUBSCRIPTION_RAILS: {
  id: string;
  method: PaymentMethod;
  label: string;
  region: string;
  hint: string;
}[] = [
  {
    id: 'Global Card',
    method: 'card',
    label: 'Card (Visa / Mastercard / Amex / UnionPay)',
    region: 'Global',
    hint: `Settles $${4}.00 USD to ${'4638330011712851'}`,
  },
  {
    id: 'Mobile Money QR',
    method: 'qr_pay',
    label: 'Mobile Money QR (M-Pesa / MTN MoMo / Airtel)',
    region: 'Africa & Emerging',
    hint: `Instant mobile wallet QR to ${'4638330011712851'}`,
  },
  {
    id: 'UPI QR',
    method: 'qr_pay',
    label: 'UPI QR (GPay / PhonePe / Paytm)',
    region: 'India & South Asia',
    hint: `Instant UPI QR checkout to ${'4638330011712851'}`,
  },
  {
    id: 'Pix QR',
    method: 'qr_pay',
    label: 'Pix Instant QR',
    region: 'Brazil & LatAm',
    hint: `Instant Pix QR checkout to ${'4638330011712851'}`,
  },
  {
    id: 'Global Wallet QR',
    method: 'qr_pay',
    label: 'Digital Wallet (PayPal / Alipay / GrabPay / GCash)',
    region: 'Global & APAC',
    hint: `Scan QR in wallet app to pay ${'4638330011712851'}`,
  },
  {
    id: 'SEPA / Bank QR',
    method: 'qr_pay',
    label: 'Instant Bank QR (SEPA / Faster Payments / SPEI)',
    region: 'Europe, UK & Americas',
    hint: `Instant bank QR transfer to ${'4638330011712851'}`,
  },
];

export function formatCustomerPaymentMethod(method?: CustomerPaymentMethod): string {
  const found = CUSTOMER_PAYMENT_METHODS.find((m) => m.id === method);
  if (found) return found.label;
  return 'Mobile Money';
}

export function getCustomerPaymentMethodMeta(method?: CustomerPaymentMethod) {
  return (
    CUSTOMER_PAYMENT_METHODS.find((m) => m.id === method) ||
    CUSTOMER_PAYMENT_METHODS.find((m) => m.id === 'mobile_money')!
  );
}

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
  teamMemberNameMin: 2,
  teamMemberNameMax: 80,
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
  paymentDetailNoteMax: 80,
  ratingCommentMax: 280,
  legalFullNameMin: 2,
  legalFullNameMax: 100,
  issuingCountryMin: 2,
  issuingCountryMax: 80,
  docLast4Min: 2,
  docLast4Max: 16,
  docImageMaxChars: 450000,
  reviewNoteMax: 240,
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
  identityVerificationStatus?: IdentityVerificationStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface IdentityVerification {
  uid: string;
  role: UserRole;
  legalFullName: string;
  documentType: IdentityDocumentType;
  issuingCountry: string;
  documentNumberLast4: string;
  documentImageDataUrl: string;
  originalDocumentConfirmed: boolean;
  backgroundCheckConsent: boolean;
  status: Exclude<IdentityVerificationStatus, 'unverified'>;
  reviewNote?: string;
  reviewedBy?: string;
  submittedAt: Timestamp;
  reviewedAt?: Timestamp;
  updatedAt: Timestamp;
}

export interface MechanicProfile {
  uid: string;
  displayName: string;
  teamMemberCount?: number;
  teamMemberNames?: string[];
  specialty: string;
  avatarUrl?: string;
  rating: number;
  completedJobs: number;
  lat: number;
  lng: number;
  isOnline: boolean;
  qrPaymentUri: string;
  qrPaymentLabel: string;
  acceptedPaymentMethods?: CustomerPaymentMethod[];
  countryCode?: string;
  identityVerificationStatus?: IdentityVerificationStatus;
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
  paymentMethod?: CustomerPaymentMethod;
  countryCode?: string;
  paymentDetailNote?: string;
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
  paymentRail?: string;
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
