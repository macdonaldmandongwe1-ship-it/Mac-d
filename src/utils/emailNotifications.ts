import type { User } from 'firebase/auth';

export type AuthorEmailEventKind = 'donation' | 'rating';
export type EmailDeliveryStatus = 'sent' | 'local_preview';

export interface AuthorEmailStatus {
  registered: boolean;
  emailConfigured: boolean;
}

export interface SimulatedEmailNotification {
  id: string;
  eventKey: string;
  kind: AuthorEmailEventKind;
  recipientLabel: string;
  subject: string;
  body: string;
  sentAtIso: string;
  deliveryStatus: EmailDeliveryStatus;
  deliveryNote: string;
}

export interface DonationEmailInput {
  kind: 'donation';
  eventKey: string;
  authorId: string;
  authorPenName: string;
  recipientLabel: string;
  bookTitle: string;
  donorName: string;
  amountUsd: number;
  message?: string;
}

export interface RatingEmailInput {
  kind: 'rating';
  eventKey: string;
  authorId: string;
  authorPenName: string;
  recipientLabel: string;
  bookTitle: string;
  reviewerName: string;
  stars: number;
  craftFocus: string;
  reviewText?: string;
}

export type AuthorEmailInput = DonationEmailInput | RatingEmailInput;

export function simulateAuthorEmailNotification(
  input: AuthorEmailInput,
  deliveryStatus: EmailDeliveryStatus = 'local_preview',
  deliveryNote = 'Local preview notification'
): SimulatedEmailNotification {
  const sentAtIso = new Date().toISOString();

  if (input.kind === 'donation') {
    const noteSuffix = input.message ? ` Note: "${input.message}"` : '';
    return {
      id: `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      eventKey: input.eventKey,
      kind: 'donation',
      recipientLabel: input.recipientLabel,
      subject: `New $${input.amountUsd.toLocaleString()} pledge for "${input.bookTitle}"`,
      body: `${input.donorName} donated $${input.amountUsd.toLocaleString()} toward your publishing goal.${noteSuffix}`,
      sentAtIso,
      deliveryStatus,
      deliveryNote,
    };
  }

  const excerptSuffix = input.reviewText ? ` "${input.reviewText}"` : '';
  return {
    id: `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    eventKey: input.eventKey,
    kind: 'rating',
    recipientLabel: input.recipientLabel,
    subject: `New ${input.stars}-star rating on "${input.bookTitle}"`,
    body: `${input.reviewerName} rated your work ${input.stars}/5 (${input.craftFocus}).${excerptSuffix}`,
    sentAtIso,
    deliveryStatus,
    deliveryNote,
  };
}

export async function registerAuthorEmailWithServer(user: User): Promise<AuthorEmailStatus> {
  try {
    const token = await user.getIdToken();
    const res = await fetch('/api/author-email/register', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) {
      return { registered: false, emailConfigured: false };
    }
    const data = (await res.json()) as Partial<AuthorEmailStatus>;
    return {
      registered: Boolean(data.registered),
      emailConfigured: Boolean(data.emailConfigured),
    };
  } catch {
    return { registered: false, emailConfigured: false };
  }
}

export async function sendAuthorEmailNotification(
  user: User,
  input: AuthorEmailInput
): Promise<SimulatedEmailNotification> {
  try {
    const token = await user.getIdToken();
    const payload =
      input.kind === 'donation'
        ? {
            kind: 'donation',
            authorId: input.authorId,
            authorPenName: input.authorPenName,
            bookTitle: input.bookTitle,
            actorName: input.donorName,
            amountUsd: input.amountUsd,
            note: input.message,
          }
        : {
            kind: 'rating',
            authorId: input.authorId,
            authorPenName: input.authorPenName,
            bookTitle: input.bookTitle,
            actorName: input.reviewerName,
            stars: input.stars,
            craftFocus: input.craftFocus,
            note: input.reviewText,
          };

    const res = await fetch('/api/notify-author', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      return simulateAuthorEmailNotification(
        input,
        'local_preview',
        'Preview shown locally (server delivery unavailable)'
      );
    }

    const result = (await res.json()) as {
      delivered?: boolean;
      reason?: string | null;
    };

    if (result.delivered) {
      return simulateAuthorEmailNotification(
        input,
        'sent',
        'Delivered to author inbox via Resend'
      );
    }

    const note =
      result.reason === 'email_provider_not_configured'
        ? 'Add RESEND_API_KEY in Settings → Secrets for live inbox delivery'
        : result.reason === 'author_not_registered'
          ? 'Showcase/unregistered author — preview shown locally'
          : result.reason || 'Preview shown locally';

    return simulateAuthorEmailNotification(input, 'local_preview', note);
  } catch {
    return simulateAuthorEmailNotification(
      input,
      'local_preview',
      'Preview shown locally (offline or unreachable)'
    );
  }
}

export async function sendTestAuthorEmail(
  user: User
): Promise<{ delivered: boolean; reason: string | null }> {
  try {
    const token = await user.getIdToken();
    const res = await fetch('/api/notify-author/test', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const data = (await res.json()) as { delivered?: boolean; reason?: string | null };
    return {
      delivered: Boolean(data.delivered),
      reason: data.reason || null,
    };
  } catch (err) {
    return {
      delivered: false,
      reason: err instanceof Error ? err.message : 'Network error sending test email.',
    };
  }
}
