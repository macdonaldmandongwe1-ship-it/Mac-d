# FirstFolio Security Specification (Phase 0 TDD)

## 1. Data Invariants

1. **PII Isolation (`/users/{userId}`)**: Email addresses and private account details reside exclusively in `/users/{userId}` and are readable and writable only by the verified owner (`request.auth.uid == userId && request.auth.token.email_verified == true`) or verified admin. No PII is duplicated onto `/books`, `/donations`, or `/ratings`.
2. **Author $1/Month Subscription Gate (`/authorSubscriptions/{authorId}` & `/authorSubscriptionPayments/{paymentId}`)**: Authors must hold an active `$1/month` subscription paid to recipient account `4638330011712851` before publishing new books (except admin-seeded showcase entries). Subscription activation/renewal requires an atomic write alongside an immutable `authorSubscriptionPayments/{paymentId}` receipt where `amountUsd == 1`, `billingMonths == 1`, and `recipientAccount == '4638330011712851'`.
3. **Author Ownership & Anti-Inflation (`/books/{bookId}`)**: Only verified subscribed authors may create a book campaign (`authorId == request.auth.uid && authorCanPublish(request.auth.uid)`, unless `isAdmin()` seeds showcase entries). On creation, `raisedUsd`, `donorCount`, `ratingSum`, `ratingCount`, and `averageRating` must initialize to `0`, and `status` must be `'seeking_funding'`.
4. **Atomic Donation Integrity (`/donations/{donationId}` <-> `/books/{bookId}`)**: A donation cannot exist without a valid parent book, cannot exceed `$5,000` or be less than `$1`, and MUST atomically increment `books/{bookId}.raisedUsd` by exact `amountUsd` and `donorCount` by `1` in the same Firestore batch/transaction (`existsAfter` + `getAfter`).
5. **Atomic Rating Integrity & Anti-Self-Rating (`/ratings/{ratingId}` <-> `/books/{bookId}`)**: Ratings are keyed deterministically (`{bookId}_{reviewerId}`) to guarantee at most one rating per reader per book. Authors are strictly forbidden from rating their own books (`reviewerId != book.authorId`). Creating a rating MUST atomically update `ratingSum`, `ratingCount`, `averageRating`, and `lastRatingId` on `/books/{bookId}` via `existsAfter` / `getAfter`.
6. **Strict Timestamp & Boundary Enforcement**: All `createdAt`, `paidAt`, and `updatedAt` fields must equal `request.time`. All document IDs must satisfy `^[a-zA-Z0-9_\-]+$` (`1..128` chars).

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Unauthenticated Book Create**: Anonymous request tries to `POST /books/book_1` -> `PERMISSION_DENIED`.
2. **Unverified Email Spoof**: Signed-in user with `email_verified: false` tries to create `/users/{uid}` or `/books/{id}` -> `PERMISSION_DENIED`.
3. **PII Blanket Read**: Signed-in User B tries `get(/users/{userA})` or `list(/users)` -> `PERMISSION_DENIED`.
4. **Unsubscribed Book Publish**: Author without an active `$1/month` subscription in `/authorSubscriptions/{uid}` tries to create `/books/b1` -> `PERMISSION_DENIED`.
5. **Subscription Account / Fee Tampering**: Author tries to write `/authorSubscriptionPayments/p1` with `amountUsd: 0` or `recipientAccount: '9999999999'` instead of `'4638330011712851'` -> `PERMISSION_DENIED`.
6. **Self-Inflated Funding on Book Create**: Author creates `/books/b1` with `raisedUsd: 5000`, `donorCount: 40`, `averageRating: 5` -> `PERMISSION_DENIED`.
7. **Shadow Field Injection on Book Create**: Author includes ghost field `isStaffPick: true` in `/books/b1` -> `PERMISSION_DENIED`.
8. **ID Poisoning Attack**: Attacker targets `/books/../../../admin` or a 1,500-char ID -> `PERMISSION_DENIED`.
9. **Orphan Donation Without Atomic Book Update**: Donor writes `/donations/d1` without updating `/books/{bookId}` in the same transaction -> `PERMISSION_DENIED`.
10. **Donation Amount Tampering**: Donor writes `/donations/d1` for `$10` while incrementing `/books/{bookId}.raisedUsd` by `$1,000` -> `PERMISSION_DENIED`.
11. **Author Self-Rating Exploit**: Author creates `/ratings/{bookId}_{authorId}` with `stars: 5` on their own book -> `PERMISSION_DENIED`.
12. **Client Timestamp Forgery / Update Gap**: Author updates `/books/b1` with backdated `createdAt` or mutates `raisedUsd` directly without a paired donation -> `PERMISSION_DENIED`.
