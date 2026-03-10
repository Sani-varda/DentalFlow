import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function dispatchWebhookEvent(clinicId: string, eventType: string, payload: any) {
  try {
    const webhooks = await prisma.externalWebhook.findMany({
      where: {
        clinicId,
        isActive: true,
        events: {
          has: eventType
        }
      }
    });

    const dispatchPromises = webhooks.map(webhook => {
      console.log(`Dispatching ${eventType} to ${webhook.url} (${webhook.name})`);
      return axios.post(webhook.url, {
        event: eventType,
        timestamp: new Date().toISOString(),
        clinicId,
        data: payload
      }, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'DentaFlow-Webhook-Dispatcher/1.0'
        }
      }).catch(err => {
        console.error(`Webhook failed for ${webhook.name}:`, err.message);
      });
    });

    await Promise.all(dispatchPromises);
  } catch (err) {
    console.error('Webhook dispatcher error:', err);
  }
}
