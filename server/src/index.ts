import express, { Router } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { env } from './config/env';
import { authMiddleware } from './middleware/auth';
import { auditMiddleware } from './middleware/audit';
import { errorHandler, notFound } from './middleware/errorHandler';

import authRoutes from './routes/auth.routes';
import patientRoutes from './routes/patient.routes';
import appointmentRoutes from './routes/appointment.routes';
import reminderRoutes from './routes/reminder.routes';
import noShowRoutes from './routes/noShowRule.routes';
import templateRoutes from './routes/template.routes';
import integrationRoutes from './routes/integration.routes';
import auditRoutes from './routes/audit.routes';
import analyticsRoutes from './routes/analytics.routes';
import webhookRoutes from './routes/webhook.routes';
import campaignRoutes from './routes/campaign.routes';
import realtimeRoutes from './routes/realtime.routes';
import userRoutes from './routes/user.routes';

const app = express();

// ─── Global middleware ───
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

// ─── Stricter rate limit for auth endpoints ───
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts, please try again later.' },
});

// ─── Health check ───
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ─── Public routes ───
app.use('/api/v1/auth', authLimiter, authRoutes);
app.use('/api/v1/webhooks', webhookRoutes);

// ─── Protected routes (auth + audit middleware applied per route group) ───
const protect = [authMiddleware, auditMiddleware];

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

// ─── Error handling ───
app.use(notFound);
app.use(errorHandler);

// ─── Start ───
app.listen(env.PORT, () => {
  console.log(`🦷 DentaFlow API running on http://localhost:${env.PORT}`);
  console.log(`   Environment: ${env.NODE_ENV}`);
});

export default app;
