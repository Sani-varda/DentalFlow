import express from 'express';
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
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
}));

// ─── Health check ───
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ─── Public routes ───
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/webhooks', webhookRoutes);

// ─── Protected routes ───
app.use('/api/v1', authMiddleware, auditMiddleware);
app.use('/api/v1/patients', patientRoutes);
app.use('/api/v1/appointments', appointmentRoutes);
app.use('/api/v1/reminders', reminderRoutes);
app.use('/api/v1/no-show-rules', noShowRoutes);
app.use('/api/v1/templates', templateRoutes);
app.use('/api/v1/integrations', integrationRoutes);
app.use('/api/v1/audit', auditRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
 // Removed redundant mount
app.use('/api/v1/campaigns', campaignRoutes);
app.use('/api/v1/realtime', realtimeRoutes);
app.use('/api/v1/users', userRoutes);

// ─── Error handling ───
app.use(notFound);
app.use(errorHandler);

// ─── Start ───
app.listen(env.PORT, () => {
  console.log(`🦷 DentaFlow API running on http://localhost:${env.PORT}`);
  console.log(`   Environment: ${env.NODE_ENV}`);
});

export default app;
