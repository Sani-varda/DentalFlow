import express, { Router } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { env } from './config/env';
import { authMiddleware } from './middleware/auth';
import { auditMiddleware } from './middleware/audit';
import { errorHandler, notFound } from './middleware/errorHandler';
import { requireActiveSubscription } from './middleware/subscription.guard';
import { stripeWebhookHandler } from './routes/stripe-webhook.handler';

import authRoutes        from './routes/auth.routes';
import patientRoutes     from './routes/patient.routes';
import appointmentRoutes from './routes/appointment.routes';
import reminderRoutes    from './routes/reminder.routes';
import noShowRoutes      from './routes/noShowRule.routes';
import templateRoutes    from './routes/template.routes';
import integrationRoutes from './routes/integration.routes';
import auditRoutes       from './routes/audit.routes';
import analyticsRoutes   from './routes/analytics.routes';
import webhookRoutes     from './routes/webhook.routes';
import campaignRoutes    from './routes/campaign.routes';
import realtimeRoutes    from './routes/realtime.routes';
import userRoutes        from './routes/user.routes';
import billingRoutes     from './routes/billing.routes';
import reviewRoutes      from './routes/review.routes';

// ─── Start BullMQ workers ───
import './jobs/reminderScheduler';
import './jobs/reviewWorker';

const app = express();

// ─── Stripe Webhook — MUST be before express.json() ──────────────────────────
app.post(
  '/api/v1/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  stripeWebhookHandler
);

// ─── Global middleware ────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(','),
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
}));

// ─── Stricter rate limit for auth ────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts, please try again later.' },
});

// ─── Rate limit for public review endpoints ───────────────────────────────────
const reviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests to review endpoint.' },
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ─── Public routes ────────────────────────────────────────────────────────────
app.use('/api/v1/auth',          authLimiter, authRoutes);
app.use('/api/v1/webhooks',      webhookRoutes);
// Review public endpoints (token-gated, no JWT required)
app.use('/api/v1/reviews',       reviewLimiter, reviewRoutes);

// ─── Billing routes (auth only — no subscription gate on billing itself) ──────
app.use('/api/v1/billing',       authMiddleware, billingRoutes);

// ─── Protected routes (auth + audit + subscription enforcement) ───────────────
const protect = [authMiddleware, auditMiddleware, requireActiveSubscription];

app.use('/api/v1/patients',      ...protect, patientRoutes);
app.use('/api/v1/appointments',  ...protect, appointmentRoutes);
app.use('/api/v1/reminders',     ...protect, reminderRoutes);
app.use('/api/v1/no-show-rules', ...protect, noShowRoutes);
app.use('/api/v1/templates',     ...protect, templateRoutes);
app.use('/api/v1/integrations',  ...protect, integrationRoutes);
app.use('/api/v1/audit',         ...protect, auditRoutes);
app.use('/api/v1/analytics',     ...protect, analyticsRoutes);
app.use('/api/v1/campaigns',     ...protect, campaignRoutes);
app.use('/api/v1/realtime',      ...protect, realtimeRoutes);
app.use('/api/v1/users',         ...protect, userRoutes);

// ─── Error handling ───────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(env.PORT, () => {
  console.log(`🦷 DentaFlow API running on http://localhost:${env.PORT}`);
  console.log(`   Environment: ${env.NODE_ENV}`);
});

export default app;
