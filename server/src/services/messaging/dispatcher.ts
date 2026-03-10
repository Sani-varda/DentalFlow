import { env } from '../../config/env';
import { Channel } from '@prisma/client';

export interface SendResult {
  success: boolean;
  externalId?: string;
  error?: string;
}

// ─── SMS Gateway (Twilio) ───
export async function sendSms(to: string, body: string): Promise<SendResult> {
  try {
    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
      console.warn('[SMS] Twilio not configured — skipping');
      return { success: false, error: 'Twilio not configured' };
    }

    const twilio = require('twilio')(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
    const message = await twilio.messages.create({
      body,
      from: env.TWILIO_PHONE_NUMBER,
      to,
      statusCallback: `${process.env.BASE_URL || 'http://localhost:3000'}/api/v1/webhooks/twilio`,
    });

    return { success: true, externalId: message.sid };
  } catch (err: any) {
    console.error('[SMS] Send failed:', err.message);
    return { success: false, error: err.message };
  }
}

// ─── WhatsApp Gateway (Twilio) ───
export async function sendWhatsApp(to: string, body: string): Promise<SendResult> {
  try {
    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
      console.warn('[WhatsApp] Twilio not configured — skipping');
      return { success: false, error: 'Twilio not configured' };
    }

    const twilio = require('twilio')(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
    const message = await twilio.messages.create({
      body,
      from: env.TWILIO_WHATSAPP_NUMBER,
      to: `whatsapp:${to}`,
      statusCallback: `${process.env.BASE_URL || 'http://localhost:3000'}/api/v1/webhooks/twilio`,
    });

    return { success: true, externalId: message.sid };
  } catch (err: any) {
    console.error('[WhatsApp] Send failed:', err.message);
    return { success: false, error: err.message };
  }
}

// ─── Email Gateway (SendGrid) ───
export async function sendEmail(to: string, subject: string, html: string): Promise<SendResult> {
  try {
    if (!env.SENDGRID_API_KEY) {
      console.warn('[Email] SendGrid not configured — skipping');
      return { success: false, error: 'SendGrid not configured' };
    }

    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(env.SENDGRID_API_KEY);

    const [response] = await sgMail.send({
      to,
      from: env.SENDGRID_FROM_EMAIL,
      subject,
      html,
    });

    const messageId = response?.headers?.['x-message-id'] || null;
    return { success: true, externalId: messageId };
  } catch (err: any) {
    console.error('[Email] Send failed:', err.message);
    return { success: false, error: err.message };
  }
}

// ─── Dispatch by channel ───
export async function dispatch(channel: Channel, to: string, subject: string, body: string): Promise<SendResult> {
  switch (channel) {
    case 'SMS':
      return sendSms(to, body);
    case 'WHATSAPP':
      return sendWhatsApp(to, body);
    case 'EMAIL':
      return sendEmail(to, subject, body);
    default:
      return { success: false, error: `Unknown channel: ${channel}` };
  }
}
