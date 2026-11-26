import 'dotenv/config';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { DecodedIdToken } from 'firebase-admin/auth';
import Stripe from 'stripe';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// Load Firebase projectId (no IAM required for verifyIdToken)
const firebaseConfigPath = path.resolve(__dirname, 'firebase-applet-config.json');
let firebaseProjectId = '';
if (fs.existsSync(firebaseConfigPath)) {
  const rawConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8')) as {
    projectId?: string;
  };
  if (rawConfig.projectId && rawConfig.projectId !== 'remixed-project-id') {
    firebaseProjectId = rawConfig.projectId;
  }
}

if (firebaseProjectId) {
  if (!getApps().length) {
    initializeApp({ projectId: firebaseProjectId });
  } else {
    getApp();
  }
}

// Confined server-side store mapping verified author UID -> verified author email
const DATA_DIR = path.resolve(__dirname, '.data');
const EMAIL_REGISTRY_FILE = path.resolve(DATA_DIR, 'author-emails.json');
if (!EMAIL_REGISTRY_FILE.startsWith(DATA_DIR + path.sep)) {
  throw new Error('Invalid author email registry path');
}

function readEmailRegistry(): Record<string, string> {
  try {
    if (!fs.existsSync(EMAIL_REGISTRY_FILE)) {
      return {};
    }
    const raw = fs.readFileSync(EMAIL_REGISTRY_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const clean: Record<string, string> = {};
    for (const [uid, email] of Object.entries(parsed)) {
      if (typeof uid === 'string' && typeof email === 'string' && email.includes('@')) {
        clean[uid] = email;
      }
    }
    return clean;
  } catch {
    return {};
  }
}

function writeEmailRegistry(registry: Record<string, string>): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(EMAIL_REGISTRY_FILE, JSON.stringify(registry, null, 2), 'utf8');
}

const authorEmailCache: Record<string, string> = readEmailRegistry();

const VERIFIED_PAYMENTS_FILE = path.resolve(DATA_DIR, 'verified-payments.json');
if (!VERIFIED_PAYMENTS_FILE.startsWith(DATA_DIR + path.sep)) {
  throw new Error('Invalid verified payments ledger path');
}

function readVerifiedPayments(): Record<string, string> {
  try {
    if (!fs.existsSync(VERIFIED_PAYMENTS_FILE)) {
      return {};
    }
    const raw = fs.readFileSync(VERIFIED_PAYMENTS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const clean: Record<string, string> = {};
    for (const [pi, uid] of Object.entries(parsed)) {
      if (typeof pi === 'string' && typeof uid === 'string') {
        clean[pi] = uid;
      }
    }
    return clean;
  } catch {
    return {};
  }
}

function writeVerifiedPayments(ledger: Record<string, string>): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(VERIFIED_PAYMENTS_FILE, JSON.stringify(ledger, null, 2), 'utf8');
}

const verifiedPaymentsCache: Record<string, string> = readVerifiedPayments();

let cachedStripeClient: Stripe | null = null;
function getStripeClient(): Stripe | null {
  const key = (process.env.STRIPE_SECRET_KEY || '').trim();
  if (!key) return null;
  if (!cachedStripeClient) {
    cachedStripeClient = new Stripe(key);
  }
  return cachedStripeClient;
}

function getStripePublishableKey(): string | null {
  const secretKey = (process.env.STRIPE_SECRET_KEY || '').trim();
  const pubKey = (process.env.STRIPE_PUBLISHABLE_KEY || process.env.VITE_STRIPE_PUBLISHABLE_KEY || '').trim();
  if (!secretKey || !pubKey || !pubKey.startsWith('pk_')) {
    return null;
  }
  return pubKey;
}

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const VALID_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

interface AuthenticatedRequest extends Request {
  firebaseUser?: DecodedIdToken;
}

async function requireFirebaseUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!firebaseProjectId) {
    res.status(503).json({ error: 'Firebase authentication is not configured.' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing Bearer authorization token.' });
    return;
  }

  const idToken = authHeader.slice('Bearer '.length).trim();
  if (!idToken) {
    res.status(401).json({ error: 'Empty authorization token.' });
    return;
  }

  try {
    const decoded = await getAuth().verifyIdToken(idToken);
    if (!decoded.email_verified || typeof decoded.email !== 'string') {
      res.status(403).json({ error: 'Verified email account is required.' });
      return;
    }
    req.firebaseUser = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired Firebase ID token.' });
  }
}

async function sendViaResend(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ delivered: boolean; reason?: string; messageId?: string }> {
  const apiKey = (process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) {
    return { delivered: false, reason: 'email_provider_not_configured' };
  }

  const fromEmail =
    (process.env.RESEND_FROM_EMAIL || '').trim() || 'FirstFolio <onboarding@resend.dev>';

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    return {
      delivered: false,
      reason: `provider_error_${response.status}: ${errText.slice(0, 180)}`,
    };
  }

  const json = (await response.json()) as { id?: string };
  return { delivered: true, messageId: json.id };
}

function buildNotificationEmail(input: {
  kind: 'donation' | 'rating';
  authorPenName: string;
  bookTitle: string;
  actorName: string;
  amountUsd?: number;
  stars?: number;
  craftFocus?: string;
  note?: string;
}): { subject: string; html: string; text: string } {
  const safeAuthor = escapeHtml(input.authorPenName);
  const safeBook = escapeHtml(input.bookTitle);
  const safeActor = escapeHtml(input.actorName);
  const safeNote = input.note ? escapeHtml(input.note) : '';

  if (input.kind === 'donation') {
    const amount = Number(input.amountUsd || 0).toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    const subject = `New $${amount} pledge for "${input.bookTitle}" on FirstFolio`;
    const text = `Hello ${input.authorPenName},\n\n${input.actorName} just donated $${amount} toward publishing "${input.bookTitle}".${
      input.note ? `\n\nReader note: "${input.note}"` : ''
    }\n\n— FirstFolio`;
    const html = `
      <div style="font-family: Georgia, serif; color: #18181b; max-width: 560px; margin: 0 auto; padding: 24px; background: #faf9f6; border: 1px solid #e6e3dc; border-radius: 10px;">
        <p style="font-family: sans-serif; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: #71717a; margin: 0 0 8px;">FirstFolio Patronage Update</p>
        <h1 style="font-size: 22px; margin: 0 0 16px;">New $${escapeHtml(amount)} pledge for &ldquo;${safeBook}&rdquo;</h1>
        <p style="font-family: sans-serif; font-size: 15px; line-height: 1.6; color: #3f3f46; margin: 0 0 16px;">
          Hello ${safeAuthor}, <strong>${safeActor}</strong> contributed <strong>$${escapeHtml(amount)}</strong> toward bringing your manuscript into print.
        </p>
        ${
          safeNote
            ? `<blockquote style="font-family: sans-serif; font-size: 14px; line-height: 1.6; color: #27272a; background: #ffffff; border: 1px solid #e6e3dc; border-radius: 8px; padding: 14px; margin: 0 0 16px;">&ldquo;${safeNote}&rdquo;</blockquote>`
            : ''
        }
        <p style="font-family: sans-serif; font-size: 12px; color: #71717a; margin: 0;">Sent by FirstFolio Author Notifications</p>
      </div>
    `;
    return { subject, html, text };
  }

  const stars = Math.min(5, Math.max(1, Math.round(Number(input.stars || 5))));
  const craft = input.craftFocus || 'Storytelling';
  const subject = `New ${stars}-star rating on "${input.bookTitle}" on FirstFolio`;
  const text = `Hello ${input.authorPenName},\n\n${input.actorName} rated "${input.bookTitle}" ${stars}/5 stars (Craft focus: ${craft}).${
    input.note ? `\n\nReview: "${input.note}"` : ''
  }\n\n— FirstFolio`;
  const html = `
    <div style="font-family: Georgia, serif; color: #18181b; max-width: 560px; margin: 0 auto; padding: 24px; background: #faf9f6; border: 1px solid #e6e3dc; border-radius: 10px;">
      <p style="font-family: sans-serif; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: #71717a; margin: 0 0 8px;">FirstFolio Reader Critique</p>
      <h1 style="font-size: 22px; margin: 0 0 16px;">New ${stars}-star rating on &ldquo;${safeBook}&rdquo;</h1>
      <p style="font-family: sans-serif; font-size: 15px; line-height: 1.6; color: #3f3f46; margin: 0 0 16px;">
        Hello ${safeAuthor}, <strong>${safeActor}</strong> rated your manuscript <strong>${stars} / 5</strong> and highlighted <strong>${escapeHtml(craft)}</strong>.
      </p>
      ${
        safeNote
          ? `<blockquote style="font-family: sans-serif; font-size: 14px; line-height: 1.6; color: #27272a; background: #ffffff; border: 1px solid #e6e3dc; border-radius: 8px; padding: 14px; margin: 0 0 16px;">&ldquo;${safeNote}&rdquo;</blockquote>`
          : ''
      }
      <p style="font-family: sans-serif; font-size: 12px; color: #71717a; margin: 0;">Sent by FirstFolio Author Notifications</p>
    </div>
  `;
  return { subject, html, text };
}

async function startServer() {
  const app = express();

  // Stripe Webhook must read raw request body BEFORE express.json()
  app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), (req, res) => {
    const stripe = getStripeClient();
    const webhookSecret = (process.env.STRIPE_WEBHOOK_SECRET || '').trim();
    if (!stripe || !webhookSecret) {
      res.status(503).json({ error: 'Stripe webhook is not configured.' });
      return;
    }

    const sig = req.headers['stripe-signature'];
    if (typeof sig !== 'string') {
      res.status(400).json({ error: 'Missing Stripe signature header.' });
      return;
    }

    try {
      const event = stripe.webhooks.constructEvent(req.body as Buffer, sig, webhookSecret);
      if (event.type === 'payment_intent.succeeded') {
        // Payment intent succeeded; verified on client + /api/stripe/verify-payment before Firestore commit
      }
      res.json({ received: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid Stripe webhook signature.';
      res.status(400).json({ error: msg });
    }
  });

  app.use(express.json({ limit: '32kb' }));

  // Public Stripe configuration check (publishable pk_ key only, never secret key)
  app.get('/api/stripe/config', (_req, res) => {
    const publishableKey = getStripePublishableKey();
    res.json({
      configured: Boolean(publishableKey),
      publishableKey,
    });
  });

  // Create Stripe PaymentIntent for a reader's book donation
  app.post('/api/stripe/create-donation-intent', requireFirebaseUser, async (req: AuthenticatedRequest, res) => {
    const stripe = getStripeClient();
    if (!stripe || !getStripePublishableKey()) {
      res.status(503).json({ error: 'Stripe payment processing is not configured yet.' });
      return;
    }

    const user = req.firebaseUser!;
    const body = req.body as Record<string, unknown>;
    const bookId = typeof body.bookId === 'string' ? body.bookId.trim() : '';
    const authorId = typeof body.authorId === 'string' ? body.authorId.trim() : '';
    const bookTitle = typeof body.bookTitle === 'string' ? body.bookTitle.trim().slice(0, 120) : '';
    const rawAmount = Number(body.amountUsd);

    if (
      !VALID_ID_REGEX.test(bookId) ||
      !VALID_ID_REGEX.test(authorId) ||
      bookTitle.length < 2 ||
      !Number.isFinite(rawAmount) ||
      rawAmount < 1 ||
      rawAmount > 5000
    ) {
      res.status(400).json({ error: 'Invalid donation payment request.' });
      return;
    }

    const cleanAmountUsd = Math.round(rawAmount * 100) / 100;
    const amountCents = Math.round(cleanAmountUsd * 100);

    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
        description: `FirstFolio book publishing donation: ${bookTitle}`,
        metadata: {
          kind: 'book_donation',
          bookId,
          bookTitle,
          authorId,
          donorId: user.uid,
        },
      });

      res.json({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amountUsd: cleanAmountUsd,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to create Stripe payment intent.';
      res.status(500).json({ error: msg });
    }
  });

  // Create Stripe PaymentIntent for the fixed $1/month author membership
  app.post('/api/stripe/create-subscription-intent', requireFirebaseUser, async (req: AuthenticatedRequest, res) => {
    const stripe = getStripeClient();
    if (!stripe || !getStripePublishableKey()) {
      res.status(503).json({ error: 'Stripe payment processing is not configured yet.' });
      return;
    }

    const user = req.firebaseUser!;
    const body = req.body as Record<string, unknown>;
    const penName = typeof body.penName === 'string' ? body.penName.trim().slice(0, 80) : '';
    if (penName.length < 2) {
      res.status(400).json({ error: 'Author pen name must be at least 2 characters.' });
      return;
    }

    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: 100, // Server-authoritative $1.00 USD
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
        description: 'FirstFolio Author Publishing Membership ($1.00 / month)',
        metadata: {
          kind: 'author_subscription',
          authorId: user.uid,
          penName,
          recipientAccount: '4638330011712851',
        },
      });

      res.json({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amountUsd: 1,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to create subscription payment intent.';
      res.status(500).json({ error: msg });
    }
  });

  // Server-authoritative Stripe PaymentIntent verification before Firestore receipt commit
  app.post('/api/stripe/verify-payment', requireFirebaseUser, async (req: AuthenticatedRequest, res) => {
    const stripe = getStripeClient();
    if (!stripe) {
      res.status(503).json({ error: 'Stripe payment processing is not configured.' });
      return;
    }

    const user = req.firebaseUser!;
    const body = req.body as Record<string, unknown>;
    const paymentIntentId =
      typeof body.paymentIntentId === 'string' ? body.paymentIntentId.trim() : '';
    const expectedKind = body.expectedKind;
    const expectedBookId =
      typeof body.bookId === 'string' ? body.bookId.trim() : undefined;

    if (
      !VALID_ID_REGEX.test(paymentIntentId) ||
      (expectedKind !== 'book_donation' && expectedKind !== 'author_subscription')
    ) {
      res.status(400).json({ error: 'Invalid payment verification payload.' });
      return;
    }

    if (verifiedPaymentsCache[paymentIntentId]) {
      res.status(409).json({ error: 'This payment has already been recorded.' });
      return;
    }

    try {
      const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (intent.status !== 'succeeded' || intent.currency !== 'usd') {
        res.status(402).json({ error: `Payment not completed (status: ${intent.status}).` });
        return;
      }

      if (intent.metadata?.kind !== expectedKind) {
        res.status(403).json({ error: 'Payment type mismatch.' });
        return;
      }

      if (expectedKind === 'book_donation') {
        if (intent.metadata?.donorId !== user.uid) {
          res.status(403).json({ error: 'Payment does not belong to current user.' });
          return;
        }
        if (expectedBookId && intent.metadata?.bookId !== expectedBookId) {
          res.status(403).json({ error: 'Payment book mismatch.' });
          return;
        }
      } else if (intent.metadata?.authorId !== user.uid || intent.amount !== 100) {
        res.status(403).json({ error: 'Subscription payment verification failed.' });
        return;
      }

      verifiedPaymentsCache[paymentIntentId] = user.uid;
      writeVerifiedPayments(verifiedPaymentsCache);

      res.json({
        verified: true,
        paymentIntentId: intent.id,
        amountUsd: Math.round((intent.amount / 100) * 100) / 100,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to verify Stripe payment.';
      res.status(500).json({ error: msg });
    }
  });

  // Register signed-in user's verified email on the server for author notifications
  app.post('/api/author-email/register', requireFirebaseUser, (req: AuthenticatedRequest, res) => {
    const user = req.firebaseUser!;
    if (!VALID_ID_REGEX.test(user.uid) || !user.email) {
      res.status(400).json({ error: 'Invalid user credentials.' });
      return;
    }
    authorEmailCache[user.uid] = user.email;
    writeEmailRegistry(authorEmailCache);
    res.json({
      registered: true,
      emailConfigured: Boolean((process.env.RESEND_API_KEY || '').trim()),
    });
  });

  // Check author notification delivery readiness without leaking PII
  app.get('/api/author-email/status', requireFirebaseUser, (req: AuthenticatedRequest, res) => {
    const user = req.firebaseUser!;
    res.json({
      registered: Boolean(authorEmailCache[user.uid]),
      emailConfigured: Boolean((process.env.RESEND_API_KEY || '').trim()),
    });
  });

  // Send a test notification email directly to the signed-in author's verified email
  app.post('/api/notify-author/test', requireFirebaseUser, async (req: AuthenticatedRequest, res) => {
    const user = req.firebaseUser!;
    const recipient = user.email!;
    const displayName =
      typeof user.name === 'string' && user.name.trim() ? user.name.trim().slice(0, 80) : 'Author';

    const emailContent = buildNotificationEmail({
      kind: 'rating',
      authorPenName: displayName,
      bookTitle: 'Your FirstFolio Manuscript',
      actorName: 'FirstFolio Reader Check',
      stars: 5,
      craftFocus: 'Prose & Voice',
      note: 'This confirms real email delivery is configured and working for your Author Studio.',
    });

    try {
      const result = await sendViaResend({
        to: recipient,
        subject: `[Test] ${emailContent.subject}`,
        html: emailContent.html,
        text: emailContent.text,
      });
      res.json({
        delivered: result.delivered,
        reason: result.reason || null,
        messageId: result.messageId || null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Email delivery error';
      res.status(500).json({ delivered: false, reason: msg });
    }
  });

  // Deliver real email notification when a reader donates or rates a manuscript
  app.post('/api/notify-author', requireFirebaseUser, async (req: AuthenticatedRequest, res) => {
    const user = req.firebaseUser!;
    const body = req.body as Record<string, unknown>;

    const kind = body.kind;
    const authorId = typeof body.authorId === 'string' ? body.authorId.trim() : '';
    const authorPenName =
      typeof body.authorPenName === 'string' ? body.authorPenName.trim().slice(0, 80) : 'Author';
    const bookTitle =
      typeof body.bookTitle === 'string' ? body.bookTitle.trim().slice(0, 120) : '';
    const actorName =
      typeof body.actorName === 'string'
        ? body.actorName.trim().slice(0, 80)
        : (typeof user.name === 'string' ? user.name.slice(0, 80) : 'Reader');
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 600) : undefined;

    if ((kind !== 'donation' && kind !== 'rating') || !VALID_ID_REGEX.test(authorId) || bookTitle.length < 2) {
      res.status(400).json({ error: 'Invalid notification payload.' });
      return;
    }

    let amountUsd: number | undefined;
    let stars: number | undefined;
    let craftFocus: string | undefined;

    if (kind === 'donation') {
      const amt = Number(body.amountUsd);
      if (!Number.isFinite(amt) || amt < 1 || amt > 5000) {
        res.status(400).json({ error: 'Invalid donation amount.' });
        return;
      }
      amountUsd = amt;
    } else {
      const rawStars = Number(body.stars);
      if (!Number.isInteger(rawStars) || rawStars < 1 || rawStars > 5) {
        res.status(400).json({ error: 'Invalid star rating.' });
        return;
      }
      stars = rawStars;
      craftFocus =
        typeof body.craftFocus === 'string' ? body.craftFocus.trim().slice(0, 40) : 'Storytelling';
    }

    const recipientEmail =
      authorEmailCache[authorId] || (authorId === user.uid ? user.email : undefined);

    if (!recipientEmail) {
      res.json({
        delivered: false,
        reason: 'author_not_registered',
      });
      return;
    }

    const emailContent = buildNotificationEmail({
      kind,
      authorPenName,
      bookTitle,
      actorName,
      amountUsd,
      stars,
      craftFocus,
      note,
    });

    try {
      const result = await sendViaResend({
        to: recipientEmail,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      });
      res.json({
        delivered: result.delivered,
        reason: result.reason || null,
        messageId: result.messageId || null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Email delivery error';
      res.status(500).json({ delivered: false, reason: msg });
    }
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FirstFolio server listening on port ${PORT}`);
  });
}

void startServer();
