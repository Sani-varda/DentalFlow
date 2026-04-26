import { Channel } from '@prisma/client';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';

const log = logger.child({ component: 'messaging.dispatcher' });

export interface SendResult {
  success: boolean;
  externalId?: string;
  error?: string;
}

// Lazily-initialised, module-scoped clients so we don't re-import per call.
let twilioClient: ReturnType<typeof getTwilioFactory> | null = null;
let sendgridReady = false;

function getTwilioFactory() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return (require('twilio') as (sid: string, token: string, opts?: { timeout?: number }) => any)(
    env.TWILIO_ACCOUNT_SID,
    env.TWILIO_AUTH_TOKEN,
    { timeout: env.EXTERNAL_HTTP_TIMEOUT_MS },
  );
}

function getTwilio() {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) return null;
  if (!twilioClient) twilioClient = getTwilioFactory();
  return twilioClient;
}

function getSendGrid() {
  if (!env.SENDGRID_API_KEY) return null;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const sgMail = require('@sendgrid/mail');
  if (!sendgridReady) {
    sgMail.setApiKey(env.SENDGRID_API_KEY);
    sendgridReady = true;
  }
  return sgMail;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

// ─── SMS (Twilio) ───
export async function sendSms(to: string, body: string): Promise<SendResult> {
  const client = getTwilio();
  if (!client) {
    log.warn({ to }, 'twilio not configured, skipping sms');
    return { success: false, error: 'Twilio not configured' };
  }
  try {
    const message = (await withTimeout(
      client.messages.create({
        body,
        from: env.TWILIO_PHONE_NUMBER,
        to,
        statusCallback: `${env.BASE_URL}/api/v1/webhooks/twilio`,
      }),
      env.EXTERNAL_HTTP_TIMEOUT_MS,
      'twilio.sms',
    )) as { sid: string };
    return { success: true, externalId: message.sid };
  } catch (err) {
    log.error({ err: (err as Error).message, to }, 'sms send failed');
    return { success: false, error: (err as Error).message };
  }
}

// ─── WhatsApp (Twilio) ───
export async function sendWhatsApp(to: string, body: string): Promise<SendResult> {
  const client = getTwilio();
  if (!client) {
    log.warn({ to }, 'twilio not configured, skipping whatsapp');
    return { success: false, error: 'Twilio not configured' };
  }
  try {
    const message = (await withTimeout(
      client.messages.create({
        body,
        from: env.TWILIO_WHATSAPP_NUMBER,
        to: `whatsapp:${to}`,
        statusCallback: `${env.BASE_URL}/api/v1/webhooks/twilio`,
      }),
      env.EXTERNAL_HTTP_TIMEOUT_MS,
      'twilio.whatsapp',
    )) as { sid: string };
    return { success: true, externalId: message.sid };
  } catch (err) {
    log.error({ err: (err as Error).message, to }, 'whatsapp send failed');
    return { success: false, error: (err as Error).message };
  }
}

// ─── Email (SendGrid) ───
export async function sendEmail(to: string, subject: string, html: string): Promise<SendResult> {
  const sgMail = getSendGrid();
  if (!sgMail) {
    log.warn({ to }, 'sendgrid not configured, skipping email');
    return { success: false, error: 'SendGrid not configured' };
  }
  try {
    const result = (await withTimeout(
      sgMail.send({ to, from: env.SENDGRID_FROM_EMAIL, subject, html }),
      env.EXTERNAL_HTTP_TIMEOUT_MS,
      'sendgrid.email',
    )) as Array<{ headers?: Record<string, string> }>;
    const response = result[0];
    const messageId = response?.headers?.['x-message-id'] ?? undefined;
    return { success: true, externalId: messageId };
  } catch (err) {
    log.error({ err: (err as Error).message, to }, 'email send failed');
    return { success: false, error: (err as Error).message };
  }
}

export async function dispatch(
  channel: Channel,
  to: string,
  subject: string,
  body: string,
): Promise<SendResult> {
  if (!to || typeof to !== 'string') {
    return { success: false, error: 'recipient address required' };
  }
  switch (channel) {
    case 'SMS':
      return sendSms(to, body);
    case 'WHATSAPP':
      return sendWhatsApp(to, body);
    case 'EMAIL':
      return sendEmail(to, subject, body);
    default:
      return { success: false, error: `Unknown channel: ${String(channel)}` };
  }
}
