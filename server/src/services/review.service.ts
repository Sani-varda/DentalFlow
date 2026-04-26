import crypto from 'crypto';
import prisma from '../config/db';
import { Channel } from '@prisma/client';
import { dispatch } from './messaging/dispatcher';
import { env } from '../config/env';

const BASE_URL = env.REVIEW_BASE_URL || 'http://localhost:3000';
const TOKEN_TTL_HOURS = 72;

// ─── Generate a secure review token ──────────────────────────────────────────
export function generateReviewToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// ─── Build the review landing page URL ───────────────────────────────────────
export function buildReviewUrl(token: string): string {
  return `${BASE_URL}/review/${token}`;
}

// ─── Send review request post-appointment ────────────────────────────────────
export async function sendReviewRequest(appointmentId: string): Promise<void> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { patient: true, clinic: true },
  });

  if (!appointment) {
    console.warn(`[ReviewService] Appointment ${appointmentId} not found`);
    return;
  }

  if (!appointment.patient.consentStatus) {
    console.log(`[ReviewService] Patient ${appointment.patientId} has no consent — skipping`);
    return;
  }

  // Idempotency — don't send twice for same appointment
  const existing = await prisma.reviewRequest.findUnique({
    where: { appointmentId },
  });
  if (existing) {
    console.log(`[ReviewService] Review request already exists for appointment ${appointmentId}`);
    return;
  }

  const token   = generateReviewToken();
  const url     = buildReviewUrl(token);
  const channel = appointment.patient.preferredChannel;
  const name    = appointment.patient.name.split(' ')[0];
  const clinic  = appointment.clinic.name;

  // ── Build message by channel ───────────────────────────────────────────────
  const smsBody   = `Hi ${name}! How was your visit at ${clinic}? Rate us (30 sec): ${url} 🦷`;
  const waBody    = `Hi ${name}! 😊 Thanks for visiting *${clinic}* today.\n\nWe'd love your feedback — it only takes 30 seconds:\n${url}\n\n_Reply STOP to opt out_`;
  const emailSubj = `How was your visit at ${clinic}?`;
  const emailHtml = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#1a1a2e">Hi ${name},</h2>
      <p>Thanks for visiting <strong>${clinic}</strong> today. We hope your appointment went well!</p>
      <p>Your feedback helps us improve and helps other patients find great dental care.</p>
      <div style="text-align:center;margin:32px 0">
        <a href="${url}" style="background:#4f46e5;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px">
          ⭐ Rate Your Visit
        </a>
      </div>
      <p style="color:#666;font-size:12px">This link expires in 72 hours. Reply to opt out.</p>
    </div>`;

  const contactMap: Record<Channel, string | undefined> = {
    SMS:       appointment.patient.phone ?? undefined,
    WHATSAPP:  appointment.patient.phone ?? undefined,
    EMAIL:     appointment.patient.email ?? undefined,
  };

  const to = contactMap[channel];
  if (!to) {
    console.warn(`[ReviewService] No contact info for patient ${appointment.patientId} on channel ${channel}`);
    return;
  }

  const bodyMap: Record<Channel, string> = {
    SMS:      smsBody,
    WHATSAPP: waBody,
    EMAIL:    emailHtml,
  };

  // ── Create DB record first (before send — idempotency) ────────────────────
  const reviewRequest = await prisma.reviewRequest.create({
    data: {
      clinicId:      appointment.clinicId,
      appointmentId: appointment.id,
      patientId:     appointment.patientId,
      token,
      channel,
      outcome:       'SENT',
    },
  });

  // ── Dispatch message ───────────────────────────────────────────────────────
  const result = await dispatch(channel, to, emailSubj, bodyMap[channel]);

  // ── Update with delivery result ───────────────────────────────────────────
  await prisma.reviewRequest.update({
    where: { id: reviewRequest.id },
    data: {
      sentAt:     result.success ? new Date() : null,
      externalId: result.externalId ?? null,
      outcome:    result.success ? 'SENT' : 'PENDING',
    },
  });

  if (result.success) {
    console.log(`[ReviewService] Review request sent for appointment ${appointmentId} via ${channel}`);
  } else {
    console.error(`[ReviewService] Failed to send review request: ${result.error}`);
  }
}

// ─── Validate token & mark as opened ─────────────────────────────────────────
export async function resolveReviewToken(token: string) {
  const request = await prisma.reviewRequest.findUnique({
    where: { token },
    include: { clinic: true, patient: true },
  });

  if (!request) return null;

  // Check expiry (72h)
  const expiresAt = new Date(request.createdAt.getTime() + TOKEN_TTL_HOURS * 60 * 60 * 1000);
  if (new Date() > expiresAt) {
    await prisma.reviewRequest.update({
      where: { id: request.id },
      data:  { outcome: 'EXPIRED' },
    });
    return null;
  }

  // Mark opened (first time only)
  if (!request.openedAt) {
    await prisma.reviewRequest.update({
      where: { id: request.id },
      data:  { openedAt: new Date(), outcome: 'OPENED' },
    });
  }

  return request;
}

// ─── Submit star rating (rating gate logic) ───────────────────────────────────
export async function submitRating(
  token:  string,
  rating: number
): Promise<{ action: 'GOOGLE_REDIRECT' | 'SHOW_FORM'; googleUrl?: string }> {
  if (rating < 1 || rating > 5) throw new Error('Rating must be 1–5');

  const request = await prisma.reviewRequest.findUnique({
    where: { token },
    include: { clinic: true },
  });
  if (!request) throw new Error('Invalid or expired review link');

  // Determine outcome based on rating gate
  const isPositive = rating >= 4;
  const outcome    = isPositive ? 'RATED_POSITIVE' : 'RATED_NEGATIVE';

  await prisma.reviewRequest.update({
    where: { id: request.id },
    data:  { rating, ratingAt: new Date(), outcome },
  });

  if (isPositive) {
    // Redirect to Google Business
    const placeId   = (request.clinic as any).googlePlaceId ?? env.GOOGLE_PLACE_ID_FALLBACK ?? '';
    const googleUrl = placeId
      ? `https://search.google.com/local/writereview?placeid=${placeId}`
      : `https://www.google.com/search?q=${encodeURIComponent(request.clinic.name + ' dental review')}`;

    return { action: 'GOOGLE_REDIRECT', googleUrl };
  }

  // 1-3 stars → show internal feedback form
  return { action: 'SHOW_FORM' };
}

// ─── Submit internal feedback form (1–3 stars) ────────────────────────────────
export async function submitFeedback(
  token:    string,
  comment:  string,
  category: string
): Promise<void> {
  const request = await prisma.reviewRequest.findUnique({ where: { token } });
  if (!request) throw new Error('Invalid review token');
  if (request.outcome !== 'RATED_NEGATIVE') throw new Error('Feedback form only for negative ratings');

  await prisma.reviewFeedback.create({
    data: {
      reviewRequestId: request.id,
      rating:          request.rating ?? 0,
      comment,
      category,
    },
  });

  await prisma.reviewRequest.update({
    where: { id: request.id },
    data:  { outcome: 'FEEDBACK_GIVEN' },
  });

  console.log(`[ReviewService] Internal feedback received for token ${token}`);
}

// ─── Admin: Get review analytics for a clinic ────────────────────────────────
export async function getReviewAnalytics(clinicId: string, days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [requests, feedback] = await Promise.all([
    prisma.reviewRequest.findMany({
      where:   { clinicId, createdAt: { gte: since } },
      include: { patient: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.reviewFeedback.findMany({
      where: {
        reviewRequest: { clinicId, createdAt: { gte: since } },
      },
      include: { reviewRequest: { include: { patient: { select: { name: true } } } } },
      orderBy: { submittedAt: 'desc' },
    }),
  ]);

  const total        = requests.length;
  const sent         = requests.filter(r => r.sentAt).length;
  const opened       = requests.filter(r => r.openedAt).length;
  const rated        = requests.filter(r => r.rating !== null);
  const ratedCount   = rated.length;
  const positiveCount = rated.filter(r => (r.rating ?? 0) >= 4).length;
  const negativeCount = rated.filter(r => (r.rating ?? 0) <= 3 && (r.rating ?? 0) >= 1).length;
  const avgRating    = ratedCount > 0
    ? rated.reduce((sum, r) => sum + (r.rating ?? 0), 0) / ratedCount
    : 0;

  const starDistribution = [1, 2, 3, 4, 5].map(star => ({
    star,
    count: rated.filter(r => r.rating === star).length,
  }));

  return {
    summary: {
      total,
      sent,
      openRate:      sent > 0 ? Math.round((opened / sent) * 100) : 0,
      responseRate:  sent > 0 ? Math.round((ratedCount / sent) * 100) : 0,
      avgRating:     Math.round(avgRating * 10) / 10,
      positiveCount,
      negativeCount,
      googleRedirects: positiveCount,
    },
    starDistribution,
    recentRatings: requests
      .filter(r => r.rating !== null)
      .slice(0, 20)
      .map(r => ({
        id:         r.id,
        patientName: r.patient.name,
        rating:     r.rating,
        ratingAt:   r.ratingAt,
        outcome:    r.outcome,
        channel:    r.channel,
      })),
    internalFeedback: feedback.slice(0, 20).map(f => ({
      id:          f.id,
      patientName: f.reviewRequest.patient.name,
      rating:      f.rating,
      comment:     f.comment,
      category:    f.category,
      submittedAt: f.submittedAt,
    })),
  };
}

// ─── Admin: Get paginated review list ────────────────────────────────────────
export async function getReviewList(
  clinicId: string,
  page     = 1,
  perPage  = 20,
  outcome?: string
) {
  const skip  = (page - 1) * perPage;
  const where = {
    clinicId,
    ...(outcome ? { outcome: outcome as any } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.reviewRequest.findMany({
      where,
      include: {
        patient:  { select: { name: true, phone: true, email: true } },
        feedback: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take:    perPage,
    }),
    prisma.reviewRequest.count({ where }),
  ]);

  return {
    data:       items,
    pagination: { page, perPage, total, pages: Math.ceil(total / perPage) },
  };
}
