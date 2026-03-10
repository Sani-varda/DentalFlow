import { Router, Request, Response } from 'express';
import prisma from '../config/db';
import { realtimeService } from '../services/realtime.service';
import { dispatchWebhookEvent } from '../services/webhook.dispatcher';

const router = Router();

// POST /api/v1/webhooks/twilio — delivery status callback
router.post('/twilio', async (req: Request, res: Response) => {
  try {
    const { MessageSid, MessageStatus, ErrorCode } = req.body;
    if (!MessageSid) {
      res.status(400).json({ error: 'Missing MessageSid' });
      return;
    }

    const statusMap: Record<string, string> = {
      sent: 'SENT',
      delivered: 'DELIVERED',
      failed: 'FAILED',
      undelivered: 'FAILED',
    };

    const mappedStatus = statusMap[MessageStatus] || 'PENDING';

    // Find the message and clinicId
    const message = await prisma.channelMessage.findFirst({
      where: { externalId: MessageSid },
      include: { appointment: { select: { clinicId: true } } }
    });

    if (message) {
      await prisma.channelMessage.update({
        where: { id: message.id },
        data: {
          status: mappedStatus as any,
          deliveryReport: { twilioStatus: MessageStatus, errorCode: ErrorCode || null },
        },
      });

      realtimeService.sendToClinic(message.appointment.clinicId, 'message_status_updated', {
        messageId: message.id,
        status: mappedStatus,
        timestamp: new Date(),
        payload: { MessageStatus, ErrorCode }
      });

      // Dispatch to external webhooks (n8n/Make/Zapier)
      dispatchWebhookEvent(message.appointment.clinicId, 'MESSAGE_STATUS_UPDATED', {
        messageId: message.id,
        status: mappedStatus,
        channel: 'SMS',
        platformStatus: MessageStatus
      });
    }

    res.status(200).json({ received: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/webhooks/sendgrid — email delivery events
router.post('/sendgrid', async (req: Request, res: Response) => {
  try {
    const events = Array.isArray(req.body) ? req.body : [req.body];
    for (const event of events) {
      if (!event.sg_message_id) continue;
      const sgId = event.sg_message_id.split('.')[0];

      const statusMap: Record<string, string> = {
        delivered: 'DELIVERED',
        bounce: 'BOUNCED',
        dropped: 'FAILED',
        open: 'DELIVERED',
      };
      const mappedStatus = statusMap[event.event] || null;
      if (!mappedStatus) continue;

      const message = await prisma.channelMessage.findFirst({
        where: { externalId: { startsWith: sgId } },
        include: { appointment: { select: { clinicId: true } } }
      });

      if (message) {
        await prisma.channelMessage.update({
          where: { id: message.id },
          data: {
            status: mappedStatus as any,
            deliveryReport: { sendgridEvent: event.event, timestamp: event.timestamp },
          },
        });

        realtimeService.sendToClinic(message.appointment.clinicId, 'message_status_updated', {
          messageId: message.id,
          status: mappedStatus,
          timestamp: new Date(),
          payload: { event: event.event }
        });

        // Dispatch to external webhooks
        dispatchWebhookEvent(message.appointment.clinicId, 'MESSAGE_STATUS_UPDATED', {
          messageId: message.id,
          status: mappedStatus,
          channel: 'EMAIL',
          platformEvent: event.event
        });
      }
    }

    res.status(200).json({ received: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
