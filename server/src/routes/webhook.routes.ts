import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../config/db';
import { realtimeService } from '../services/realtime.service';
import { dispatchWebhookEvent } from '../services/webhook.dispatcher';
import { verifyTwilioSignature, verifySendGridSignature } from '../lib/webhookSignatures';
import { logger } from '../lib/logger';

const router = Router();
const log = logger.child({ component: 'webhook.routes' });

const TWILIO_STATUS_MAP: Record<string, string> = {
  sent: 'SENT',
  delivered: 'DELIVERED',
  failed: 'FAILED',
  undelivered: 'FAILED',
};

const SENDGRID_STATUS_MAP: Record<string, string> = {
  delivered: 'DELIVERED',
  bounce: 'BOUNCED',
  dropped: 'FAILED',
  open: 'DELIVERED',
};

const twilioSchema = z.object({
  MessageSid: z.string().min(1).max(64),
  MessageStatus: z.string().min(1).max(32).optional(),
  ErrorCode: z.union([z.string(), z.number()]).optional(),
});

const sendGridEventSchema = z
  .object({
    sg_message_id: z.string().min(1),
    event: z.string().min(1).max(64),
    timestamp: z.union([z.number(), z.string()]).optional(),
  })
  .passthrough();

// POST /api/v1/webhooks/twilio
router.post('/twilio', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    if (!verifyTwilioSignature(req, url)) {
      log.warn({ url }, 'twilio signature verification failed');
      res.status(403).json({ error: 'Invalid signature' });
      return;
    }
    const parsed = twilioSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const { MessageSid, MessageStatus, ErrorCode } = parsed.data;

    const mappedStatus = MessageStatus ? TWILIO_STATUS_MAP[MessageStatus] ?? 'PENDING' : 'PENDING';

    const message = await prisma.channelMessage.findFirst({
      where: { externalId: MessageSid },
      include: { appointment: { select: { clinicId: true } } },
    });

    if (!message) {
      // Acknowledge so Twilio doesn't retry; nothing actionable.
      res.status(200).json({ received: true, matched: false });
      return;
    }

    await prisma.channelMessage.update({
      where: { id: message.id },
      data: {
        status: mappedStatus as any,
        deliveryReport: { twilioStatus: MessageStatus, errorCode: ErrorCode ?? null },
      },
    });

    realtimeService.sendToClinic(message.appointment.clinicId, 'message_status_updated', {
      messageId: message.id,
      status: mappedStatus,
      timestamp: new Date(),
    });

    void dispatchWebhookEvent(message.appointment.clinicId, 'MESSAGE_STATUS_UPDATED', {
      messageId: message.id,
      status: mappedStatus,
      channel: 'SMS',
      platformStatus: MessageStatus,
    });

    res.status(200).json({ received: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/webhooks/sendgrid
router.post('/sendgrid', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!verifySendGridSignature(req)) {
      log.warn('sendgrid signature verification failed');
      res.status(403).json({ error: 'Invalid signature' });
      return;
    }

    const events = Array.isArray(req.body) ? req.body : [req.body];
    let processed = 0;

    for (const raw of events) {
      const parsed = sendGridEventSchema.safeParse(raw);
      if (!parsed.success) continue;
      const event = parsed.data;
      const sgId = String(event.sg_message_id).split('.')[0];
      const mappedStatus = SENDGRID_STATUS_MAP[event.event];
      if (!mappedStatus) continue;

      const message = await prisma.channelMessage.findFirst({
        where: { externalId: { startsWith: sgId } },
        include: { appointment: { select: { clinicId: true } } },
      });
      if (!message) continue;

      await prisma.channelMessage.update({
        where: { id: message.id },
        data: {
          status: mappedStatus as any,
          deliveryReport: { sendgridEvent: event.event, timestamp: event.timestamp ?? null },
        },
      });

      realtimeService.sendToClinic(message.appointment.clinicId, 'message_status_updated', {
        messageId: message.id,
        status: mappedStatus,
        timestamp: new Date(),
      });

      void dispatchWebhookEvent(message.appointment.clinicId, 'MESSAGE_STATUS_UPDATED', {
        messageId: message.id,
        status: mappedStatus,
        channel: 'EMAIL',
        platformEvent: event.event,
      });
      processed++;
    }

    res.status(200).json({ received: true, processed });
  } catch (err) {
    next(err);
  }
});

export default router;
