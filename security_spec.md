# Security Specification — WrenchBid

## 1. Data Invariants

1. **PII Isolation**: Private user emails and phone numbers exist strictly in `/users/{userId}` and are readable only by the verified owner (`request.auth.uid == userId`).
2. **7-Day Trial Integrity**: On `/mechanics/{mechanicId}` creation, `subscriptionStatus` MUST be `'trial'`, `trialStartedAt == request.time`, `monthlyFeeUsd == 4`, and `trialEndsAtMs <= request.time.toMillis() + 691200000` (cannot forge a multi-year free trial). `trialStartedAt`, `trialEndsAtMs`, and `monthlyFeeUsd` are immutable once created.
3. **Atomic $4/Month Subscription Billing**:
   - Activating or renewing `subscriptionStatus == 'active'` and extending `subscriptionPaidUntilMs` MUST occur atomically in a `writeBatch` alongside creating an immutable `/subscriptionPayments/{paymentId}` ledger entry (`amountUsd == 4`, `billingMonths == 1`), enforced bidirectionally via `existsAfter` and `getAfter`.
   - Expiring a trial (`subscriptionStatus: 'trial'` -> `'expired'`) cannot increase `subscriptionPaidUntilMs`.
4. **Bidding Gate**: A mechanic can only create a bid under `/requests/{requestId}/bids/{bidId}` if their trial (`trialEndsAtMs > request.time.toMillis()`) or $4/month subscription (`subscriptionPaidUntilMs > request.time.toMillis()`) is currently valid.
5. **Terminal State Locking**: Completed or cancelled breakdown requests and non-pending bids cannot be modified.
6. **Post-Repair Rating Integrity**: A motorist may submit at most one immutable 1–5 star rating at `/ratings/{requestId}` only after the breakdown request reaches `status == 'completed'`, atomically updating the assigned mechanic's `rating`, `ratingCount`, and `ratingSum` in the same `writeBatch`.
7. **Strict Path & Payload Bounds**: Every document ID matches `^[a-zA-Z0-9_\-]+$` (`1..128`), and every string/numeric field is bounded.

---

## 2. The "Dirty Dozen" Adversarial Payloads

1. **PII Cross-Read**: User B reads `/users/userA`. Expected: `PERMISSION_DENIED`.
2. **Trial Window Forgery**: Mechanic creates `/mechanics/uid` with `trialEndsAtMs` set 365 days in the future. Expected: `PERMISSION_DENIED`.
3. **Unpaid Subscription Activation**: Mechanic updates `/mechanics/uid` to `{ subscriptionStatus: 'active', subscriptionPaidUntilMs: future }` without creating a `/subscriptionPayments/{paymentId}` doc in the same batch. Expected: `PERMISSION_DENIED`.
4. **Discount / $0 Payment Spoofing**: Mechanic writes `/subscriptionPayments/p1` with `amountUsd: 0` or `billingMonths: 12`. Expected: `PERMISSION_DENIED`.
5. **Expired Mechanic Bid**: Mechanic with expired trial and no active subscription tries to create `/requests/r1/bids/b1`. Expected: `PERMISSION_DENIED`.
6. **Shadow Field Injection**: Mechanic writes ghost field `isVerifiedAdmin: true` to `/mechanics/uid`. Expected: `PERMISSION_DENIED`.
7. **Immutable Field Tampering**: Mechanic updates `trialEndsAtMs` or `monthlyFeeUsd` after profile creation. Expected: `PERMISSION_DENIED`.
8. **Motorist Bid Forgery**: User tries to accept a nonexistent `acceptedBidId` on `/requests/r1`. Expected: `PERMISSION_DENIED`.
9. **Terminal Request Mutation**: Motorist or mechanic updates `/requests/r1` after `status == 'completed'`. Expected: `PERMISSION_DENIED`.
10. **Cross-Mechanic Payment Ledger Read**: Mechanic B queries `/subscriptionPayments` for Mechanic A's receipts. Expected: `PERMISSION_DENIED`.
11. **Unverified Email Write**: Account with `email_verified == false` attempts to write. Expected: `PERMISSION_DENIED`.
12. **Client Timestamp Backdating**: Client supplies arbitrary past/future `paidAt` instead of `request.time`. Expected: `PERMISSION_DENIED`.
