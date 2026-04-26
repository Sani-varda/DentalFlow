import express, { Request } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';

import { env } from './config/env';
import prisma from './config/db';
import { logger } from './lib/logger';
import { verifyEncryptionKey } from './lib/crypto';

import { authMiddleware } from './middleware/auth';
import { auditMiddleware } from './middleware/audit';
import { errorHandler, notFound } from './middleware/errorHandler';
import { requestId } from './middleware/requestId';
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

export const app = express();

// Trust the first hop proxy so rate-limit / req.ip honour X-Forwarded-For from
// the load balancer. Set env TRUST_PROXY=false if running without a proxy.
app.set('trust proxy', 1);

// ─── Stripe Webhook — MUST be before express.json() ──────────────────────────
app.post(
  '/api/v1/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  stripeWebhookHandler,
);

// ─── Global middleware ───
app.use(requestId);
app.use(
  pinoHttp({
    logger,
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
    customProps: (req) => ({ requestId: (req as Request).id }),
    serializers: {
      req: (req) => ({ id: req.id, method: req.method, url: req.url }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  }),
);

app.use(helmet());
app.use(
  cors({
    origin: env.ALLOWED_ORIGINS_LIST.length > 0 ? env.ALLOWED_ORIGINS_LIST : false,
    credentials: true,
  }),
);

// JSON parser with raw body capture (needed for SendGrid signature verification)
app.use(
  express.json({
    limit: '2mb',
    verify: (req, _res, buf) => {
      (req as Request & { rawBody?: Buffer }).rawBody = buf;
    },
  }),
);
// Twilio sends application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: false, limit: '256kb' }));

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts, please try again later.' },
});

const expensiveLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'This endpoint is rate-limited; slow down.' },
});

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600, // generous — webhooks can burst
  standardHeaders: true,
  legacyHeaders: false,
});

// Public review endpoints (token-gated, no JWT required) — moderate rate limit.
const reviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests to review endpoint.' },
});

// ─── Health checks ───
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ready', timestamp: new Date().toISOString() });
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'readiness probe failed');
    res.status(503).json({ status: 'not_ready', error: 'database unreachable' });
  }
});

// ─── Public routes ───
app.use('/api/v1/auth', authLimiter, authRoutes);
app.use('/api/v1/webhooks', webhookLimiter, webhookRoutes);
app.use('/api/v1/reviews', reviewLimiter, reviewRoutes);

// ─── Billing routes (auth only — no subscription gate on billing itself) ───
app.use('/api/v1/billing', authMiddleware, billingRoutes);

// ─── Protected routes (auth + audit + subscription enforcement) ───
const protect = [authMiddleware, auditMiddleware, requireActiveSubscription];

app.use('/api/v1/patients', ...protect, patientRoutes);
app.use('/api/v1/appointments', ...protect, appointmentRoutes);
app.use('/api/v1/reminders', ...protect, reminderRoutes);
app.use('/api/v1/no-show-rules', ...protect, expensiveLimiter, noShowRoutes);
app.use('/api/v1/templates', ...protect, templateRoutes);
app.use('/api/v1/integrations', ...protect, integrationRoutes);
app.use('/api/v1/audit', ...protect, auditRoutes);
app.use('/api/v1/analytics', ...protect, analyticsRoutes);
app.use('/api/v1/campaigns', ...protect, expensiveLimiter, campaignRoutes);
app.use('/api/v1/realtime', ...protect, realtimeRoutes);
app.use('/api/v1/users', ...protect, userRoutes);

app.use(notFound);
app.use(errorHandler);

// ─── Bootstrap & graceful shutdown ───
async function bootstrap(): Promise<void> {
  // Validate encryption key (decrypt-roundtrip) before accepting traffic.
  verifyEncryptionKey();

  // Verify DB connectivity before binding the port. Fail fast if the
  // database is unreachable instead of returning errors to clients.
  await prisma.$queryRaw`SELECT 1`;

  const server = app.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV },
      'dentaflow api started',
    );
  });

  // Reasonable timeouts: keep-alive should be longer than ALB defaults.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutdown initiated');

    // Stop accepting new connections, drain in-flight ones up to 25s.
    const closeTimer = setTimeout(() => {
      logger.warn('forceful shutdown after 25s drain timeout');
      process.exit(1);
    }, 25_000);

    server.close(async (err) => {
      clearTimeout(closeTimer);
      if (err) {
        logger.error({ err: err.message }, 'http server close error');
      }
      try {
        await prisma.$disconnect();
      } catch (dbErr) {
        logger.error({ err: (dbErr as Error).message }, 'prisma disconnect error');
      }
      logger.info('shutdown complete');
      process.exit(err ? 1 : 0);
    });
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'unhandled promise rejection');
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err: err.message, stack: err.stack }, 'uncaught exception');
    void shutdown('uncaughtException');
  });
}

if (require.main === module) {
  bootstrap().catch((err) => {
    logger.fatal({ err: err.message, stack: err.stack }, 'bootstrap failed');
    process.exit(1);
  });
}

export default app;
