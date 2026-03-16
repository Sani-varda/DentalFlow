import dotenv from 'dotenv';
dotenv.config();

export const env = {
  // Server
  PORT: parseInt(process.env.PORT || '3000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',

  // Database
  DATABASE_URL: process.env.DATABASE_URL!,

  // Redis
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',

  // JWT
  JWT_SECRET: process.env.JWT_SECRET || 'change_me_in_production',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',

  // Google OAuth
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',

  // Twilio
  TWILIO_ACCOUNT_SID:    process.env.TWILIO_ACCOUNT_SID    || '',
  TWILIO_AUTH_TOKEN:     process.env.TWILIO_AUTH_TOKEN     || '',
  TWILIO_PHONE_NUMBER:   process.env.TWILIO_PHONE_NUMBER   || '',
  TWILIO_WHATSAPP_NUMBER: process.env.TWILIO_WHATSAPP_NUMBER || '',

  // SendGrid
  SENDGRID_API_KEY:    process.env.SENDGRID_API_KEY    || '',
  SENDGRID_FROM_EMAIL: process.env.SENDGRID_FROM_EMAIL || '',

  // No-show scoring
  CHRONIC_THRESHOLD: parseFloat(process.env.CHRONIC_THRESHOLD || '0.7'),

  // Real-time / SSE
  MAX_SSE_CONNECTIONS_PER_USER: parseInt(process.env.MAX_SSE_CONNECTIONS_PER_USER || '5', 10),

  // Stripe Billing
  STRIPE_SECRET_KEY:      process.env.STRIPE_SECRET_KEY      || '',
  STRIPE_WEBHOOK_SECRET:  process.env.STRIPE_WEBHOOK_SECRET  || '',
  STRIPE_PRICE_STARTER:   process.env.STRIPE_PRICE_STARTER   || '',
  STRIPE_PRICE_GROWTH:    process.env.STRIPE_PRICE_GROWTH    || '',
  STRIPE_PRICE_ENTERPRISE: process.env.STRIPE_PRICE_ENTERPRISE || '',

  // Google Review Collection
  REVIEW_BASE_URL:          process.env.REVIEW_BASE_URL          || 'http://localhost:3000',
  GOOGLE_PLACE_ID_FALLBACK: process.env.GOOGLE_PLACE_ID_FALLBACK || '',
} as const;
