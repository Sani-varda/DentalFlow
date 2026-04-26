import crypto from 'crypto';
import type { Request } from 'express';
import { env } from '../config/env';

/**
 * Verify a Twilio request signature.
 *
 * Twilio computes HMAC-SHA1 over the full request URL plus, for
 * application/x-www-form-urlencoded requests, the alphabetically-sorted
 * concatenation of POST parameters.
 *
 * @returns true if signature is valid (or verification is disabled).
 */
export function verifyTwilioSignature(req: Request, requestUrl: string): boolean {
  if (!env.VERIFY_TWILIO_SIGNATURE) return true;

  const authToken = env.TWILIO_AUTH_TOKEN;
  const signature = req.header('x-twilio-signature');
  if (!authToken || !signature) return false;

  let data = requestUrl;
  if (req.body && typeof req.body === 'object') {
    const sortedKeys = Object.keys(req.body).sort();
    for (const key of sortedKeys) {
      data += key + String(req.body[key] ?? '');
    }
  }

  const expected = crypto.createHmac('sha1', authToken).update(data).digest('base64');
  return safeCompare(expected, signature);
}

/**
 * Verify a SendGrid Event Webhook signature using ECDSA over the raw body.
 *
 * The public key (SENDGRID_WEBHOOK_PUBLIC_KEY) is the base64-encoded
 * verification key shown in the SendGrid event-webhook settings.
 *
 * Requires the raw request body to be available as a Buffer/string on
 * `req.rawBody` (set by the body-parser middleware).
 */
export function verifySendGridSignature(req: Request): boolean {
  if (!env.VERIFY_SENDGRID_SIGNATURE) return true;

  const signature = req.header('x-twilio-email-event-webhook-signature');
  const timestamp = req.header('x-twilio-email-event-webhook-timestamp');
  const publicKey = env.SENDGRID_WEBHOOK_PUBLIC_KEY;
  const rawBody = (req as Request & { rawBody?: Buffer | string }).rawBody;

  if (!signature || !timestamp || !publicKey || !rawBody) return false;

  const payload = (typeof rawBody === 'string' ? Buffer.from(rawBody) : rawBody);
  const data = Buffer.concat([Buffer.from(timestamp), payload]);

  try {
    const verifier = crypto.createVerify('SHA256');
    verifier.update(data);
    verifier.end();
    const pubKeyPem = `-----BEGIN PUBLIC KEY-----\n${publicKey}\n-----END PUBLIC KEY-----`;
    return verifier.verify(pubKeyPem, signature, 'base64');
  } catch {
    return false;
  }
}

function safeCompare(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
