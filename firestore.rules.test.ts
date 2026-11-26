/**
 * WrenchBid Firestore Security Rules Verification Suite (Dirty Dozen)
 */

export const DIRTY_DOZEN_CASES = [
  { id: 1, name: 'PII Cross-Read on /users/{userId}', expected: 'PERMISSION_DENIED' },
  { id: 2, name: '365-Day Trial Window Forgery on /mechanics/{uid}', expected: 'PERMISSION_DENIED' },
  { id: 3, name: 'Subscription Activation Without Atomic /subscriptionPayments Doc', expected: 'PERMISSION_DENIED' },
  { id: 4, name: '$0 / 12-Month Payment Spoofing on /subscriptionPayments/{id}', expected: 'PERMISSION_DENIED' },
  { id: 5, name: 'Expired Trial Mechanic Bid Attempt', expected: 'PERMISSION_DENIED' },
  { id: 6, name: 'Shadow Field Injection on /mechanics/{uid}', expected: 'PERMISSION_DENIED' },
  { id: 7, name: 'Immutable trialEndsAtMs / monthlyFeeUsd Tampering', expected: 'PERMISSION_DENIED' },
  { id: 8, name: 'Accept Nonexistent Bid on /requests/{id}', expected: 'PERMISSION_DENIED' },
  { id: 9, name: 'Mutating Completed Breakdown Request', expected: 'PERMISSION_DENIED' },
  { id: 10, name: 'Cross-Mechanic Subscription Receipt Read', expected: 'PERMISSION_DENIED' },
  { id: 11, name: 'Unverified Email Write Attempt', expected: 'PERMISSION_DENIED' },
  { id: 12, name: 'Backdated Client Timestamp Forgery on paidAt', expected: 'PERMISSION_DENIED' },
  { id: 13, name: 'Rating Submitted Before Request Status Is Completed', expected: 'PERMISSION_DENIED' },
  { id: 14, name: 'Out-of-Range 6-Star or Self-Rating Forgery on /ratings/{id}', expected: 'PERMISSION_DENIED' },
] as const;
