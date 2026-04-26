import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  // Server
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Redis
  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  // JWT — must be at least 32 chars; weak/sentinel values rejected in production
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('24h'),

  // Credentials encryption — 64-char hex (32 bytes) for AES-256-GCM
  CREDENTIALS_ENCRYPTION_KEY: z
    .string()
    .regex(/^[a-fA-F0-9]{64}$/, 'CREDENTIALS_ENCRYPTION_KEY must be a 64-character hex string'),

  // Public base URL — used for webhook callbacks (Twilio, SendGrid)
  BASE_URL: z.string().url().default('http://localhost:3000'),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().optional().default(''),

  // Twilio
  TWILIO_ACCOUNT_SID: z.string().optional().default(''),
  TWILIO_AUTH_TOKEN: z.string().optional().default(''),
  TWILIO_PHONE_NUMBER: z.string().optional().default(''),
  TWILIO_WHATSAPP_NUMBER: z.string().optional().default(''),

  // SendGrid
  SENDGRID_API_KEY: z.string().optional().default(''),
  SENDGRID_FROM_EMAIL: z.string().optional().default(''),

  // Webhook signature verification (set true in production once configured)
  VERIFY_TWILIO_SIGNATURE: z.coerce.boolean().default(false),
  VERIFY_SENDGRID_SIGNATURE: z.coerce.boolean().default(false),
  SENDGRID_WEBHOOK_PUBLIC_KEY: z.string().optional().default(''),

  // External scoring service
  SCORING_SERVICE_URL: z.string().url().default('http://localhost:8001/api/v1/scoring'),
  SCORING_SERVICE_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),

  // External call defaults
  EXTERNAL_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),

  // No-show scoring
  CHRONIC_THRESHOLD: z.coerce.number().min(0).max(1).default(0.7),

  // Real-time / SSE
  MAX_SSE_CONNECTIONS_PER_USER: z.coerce.number().int().positive().default(5),

  // CORS
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),

  // Stripe Billing
  STRIPE_SECRET_KEY: z.string().optional().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(''),
  STRIPE_PRICE_STARTER: z.string().optional().default(''),
  STRIPE_PRICE_GROWTH: z.string().optional().default(''),
  STRIPE_PRICE_ENTERPRISE: z.string().optional().default(''),

  // Google Review Collection
  REVIEW_BASE_URL: z.string().url().default('http://localhost:3000'),
  GOOGLE_PLACE_ID_FALLBACK: z.string().optional().default(''),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Print structured validation errors then crash — refuse to boot with bad config.
  // eslint-disable-next-line no-console
  console.error(
    '[env] Invalid environment configuration:\n',
    JSON.stringify(parsed.error.flatten().fieldErrors, null, 2),
  );
  process.exit(1);
}

const data = parsed.data;

// Reject sentinel / weak JWT secrets in production
const WEAK_SECRETS = new Set([
  'change_me_in_production',
  'changeme',
  'secret',
  'jwt_secret',
  'your_jwt_secret',
]);
if (data.NODE_ENV === 'production' && WEAK_SECRETS.has(data.JWT_SECRET.toLowerCase())) {
  // eslint-disable-next-line no-console
  console.error('[env] JWT_SECRET appears to be a default/sentinel value — refusing to boot in production.');
  process.exit(1);
}

export const env = Object.freeze({
  ...data,
  ALLOWED_ORIGINS_LIST: data.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
});

export type Env = typeof env;
